/**
 * LLM 어댑터. 모듈들은 특정 모델에 묶이지 않고 이 인터페이스만 쓴다.
 * - 상용 API(OpenAI, Anthropic, Gemini 등)와 로컬 Gemma 4(Ollama)를 같은 방식으로 꽂을 수 있다.
 * - 사용한 토큰 수를 돌려주므로 크레딧 정산(credits 모듈)에 그대로 쓸 수 있다.
 */

export interface LLMRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  /** true면 JSON 하나만 출력하도록 요청한다. */
  json?: boolean;
  /**
   * JSON 스키마. 주면 지원하는 모델에서 응답이 이 모양을 반드시 따르게 한다(구조화 출력).
   * 객체마다 additionalProperties:false, required 를 모두 적어야 한다. minimum/maxLength 같은 제약은 쓰지 않는다.
   */
  schema?: Record<string, unknown>;
  /** 함께 보낼 이미지 (이미지를 읽을 수 있는 모델만, vision이 true인 클라이언트) */
  images?: LLMImage[];
}

export interface LLMImage {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** base64 (data: 접두어 없이) */
  data: string;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface LLMClient {
  readonly model: string;
  /** "local"(Gemma 등, API 비용 0) 또는 "paid"(상용 API) */
  readonly tier: "local" | "paid";
  /** 이미지를 함께 읽을 수 있는지 */
  readonly vision?: boolean;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

/** 대략적인 토큰 수 추정. 한국어는 글자당 토큰이 많아 보수적으로 잡는다. */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    tokens += /[가-힣]/.test(ch) ? 0.9 : 0.3;
  }
  return Math.ceil(tokens);
}

/** 테스트와 UI 개발용 가짜 LLM. 정해 둔 응답을 돌려준다. */
export class MockLLM implements LLMClient {
  readonly model = "mock";
  constructor(
    private readonly responder: (req: LLMRequest) => string,
    readonly tier: "local" | "paid" = "paid",
  ) {}
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const text = this.responder(req);
    return {
      text,
      inputTokens: estimateTokens(req.system + req.user),
      outputTokens: estimateTokens(text),
      model: this.model,
    };
  }
}

/**
 * Ollama로 로컬 모델(예: Gemma 4)을 부르는 클라이언트.
 * 해커톤 데모에서 요약·분류처럼 쉬운 작업을 API 비용 없이 처리할 때 쓴다.
 */
export class OllamaClient implements LLMClient {
  readonly tier = "local" as const;
  constructor(
    readonly model: string = "gemma4:e4b",
    private readonly baseUrl: string = "http://localhost:11434",
    /**
     * 문맥 길이(토큰). Ollama는 메모리가 24GB 미만이면 기본 4,096이라 긴 후기·공고가 잘린다.
     * 코드북 + 후기 본문이 들어가도록 기본 16,384로 올린다 (메모리가 부족하면 OLLAMA_NUM_CTX로 낮춘다).
     */
    private readonly numCtx: number = 16384,
    /** Gemma 4 등 이미지를 읽는 모델이면 true (OLLAMA_VISION=0 으로 끌 수 있다) */
    readonly vision: boolean = true,
  ) {}
  async complete(req: LLMRequest): Promise<LLMResponse> {
    // 작은 로컬 모델은 스키마를 프롬프트에도 보여 주면 더 잘 따른다 (Ollama 문서 권장)
    const system = req.schema ? `${req.system}\n\n다음 JSON 스키마에 맞는 JSON만 출력하세요:\n${JSON.stringify(req.schema)}` : req.system;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: req.schema ?? (req.json ? "json" : undefined),
        // 생각(thinking) 출력을 끄고 답만 받는다
        think: false,
        options: { num_predict: req.maxOutputTokens, num_ctx: this.numCtx, temperature: req.schema || req.json ? 0.2 : 0.7 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: req.user, ...(req.images?.length ? { images: req.images.map((i) => i.data) } : {}) },
        ],
      }),
    }).catch((e: unknown) => {
      throw new Error(`Ollama에 연결하지 못했어요 (${this.baseUrl}). Ollama 앱이 켜져 있는지 확인해 주세요: ${e instanceof Error ? e.message : String(e)}`);
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 404) throw new Error(`Ollama에 '${this.model}' 모델이 없어요. 터미널에서 ollama pull ${this.model} 을 먼저 실행해 주세요`);
      throw new Error(`Ollama 오류 ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const text = data.message?.content ?? "";
    return {
      text,
      inputTokens: data.prompt_eval_count ?? estimateTokens(req.system + req.user),
      outputTokens: data.eval_count ?? estimateTokens(text),
      model: this.model,
    };
  }
}

/**
 * Anthropic Claude API 클라이언트 (Messages API, fetch만 사용).
 * schema를 주면 구조화 출력(output_config.format = json_schema)으로 깨지지 않는 JSON을 받는다.
 * 키는 서버 환경 변수로만 넘긴다. 브라우저에서 만들지 말 것.
 */
export class AnthropicClient implements LLMClient {
  readonly tier = "paid" as const;
  readonly vision = true;
  constructor(
    private readonly apiKey: string,
    readonly model: string = "claude-haiku-5-5",
    private readonly opts: { baseUrl?: string; version?: string; fetchImpl?: typeof fetch } = {},
  ) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 비어 있어요");
  }
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxOutputTokens,
      system: req.json && !req.schema ? `${req.system}\n\nJSON 객체 하나만 출력하세요. 다른 말은 쓰지 마세요.` : req.system,
      messages: [
        {
          role: "user",
          content: req.images?.length
            ? [...req.images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } })), { type: "text", text: req.user }]
            : req.user,
        },
      ],
    };
    if (req.schema) body.output_config = { format: { type: "json_schema", schema: req.schema } };
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`${this.opts.baseUrl ?? "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.opts.version ?? "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Claude API 오류 ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
      model?: string;
    };
    if (data.stop_reason === "refusal") throw new Error("모델이 이 요청을 처리하지 않았어요");
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return {
      text,
      inputTokens: data.usage?.input_tokens ?? estimateTokens(req.system + req.user),
      outputTokens: data.usage?.output_tokens ?? estimateTokens(text),
      model: data.model ?? this.model,
    };
  }
}

/**
 * Google Gemini API 클라이언트 (generateContent, fetch만 사용).
 * - schema를 주면 responseMimeType=application/json + responseJsonSchema로 JSON을 받는다.
 *   모델이 스키마를 받지 않으면(400) 스키마 없이 JSON 모드로 한 번 더 묻는다 (결과는 각 기능의 검사기가 다시 확인).
 * - 429·503(사용량 초과·일시 장애)이면 잠깐 쉬고 한 번 더 시도한다.
 * - 60초 안에 답이 없으면 멈춘다 (페이지가 끝없이 기다리지 않게).
 * 키는 서버 환경 변수(GEMINI_API_KEY)로만 넘긴다. 브라우저에서 만들지 말 것.
 */
export class GeminiClient implements LLMClient {
  readonly tier = "paid" as const;
  readonly vision = true;
  constructor(
    private readonly apiKey: string,
    /** 기본은 구글이 최신 안정판 Flash로 바꿔 주는 별칭. GEMINI_MODEL로 고정할 수 있다 */
    readonly model: string = "gemini-flash-latest",
    private readonly opts: { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number; retryDelayMs?: number } = {},
  ) {
    if (!apiKey) throw new Error("GEMINI_API_KEY가 비어 있어요");
  }

  private body(req: LLMRequest, withSchema: boolean): Record<string, unknown> {
    const wantsJson = !!(req.schema || req.json);
    return {
      systemInstruction: { parts: [{ text: wantsJson && !(withSchema && req.schema) ? `${req.system}\n\nJSON 객체 하나만 출력하세요. 다른 말은 쓰지 마세요.${req.schema ? `\n다음 JSON 스키마를 따르세요:\n${JSON.stringify(req.schema)}` : ""}` : req.system }] },
      contents: [
        {
          role: "user",
          parts: [...(req.images ?? []).map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.data } })), { text: req.user }],
        },
      ],
      generationConfig: {
        // 생각(thinking)하는 모델은 생각 토큰도 출력 한도에 들어가므로 넉넉히 준다
        maxOutputTokens: Math.max(2048, req.maxOutputTokens * 4),
        temperature: wantsJson ? 0.2 : 0.7,
        ...(wantsJson ? { responseMimeType: "application/json" } : {}),
        ...(withSchema && req.schema ? { responseJsonSchema: req.schema } : {}),
      },
    };
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    const f = this.opts.fetchImpl ?? fetch;
    const url = `${this.opts.baseUrl ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    return f(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 60_000),
    }).catch((e: unknown) => {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new Error(timeout ? "Gemini가 60초 안에 답하지 않았어요. 잠시 뒤 다시 시도해 주세요" : `Gemini에 연결하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    let withSchema = true;
    let res = await this.post(this.body(req, withSchema));
    if (res.status === 400 && req.schema) {
      withSchema = false;
      res = await this.post(this.body(req, withSchema));
    }
    if (res.status === 429 || res.status === 503) {
      await new Promise((r) => setTimeout(r, this.opts.retryDelayMs ?? 2000));
      res = await this.post(this.body(req, withSchema));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 400 && /API key/i.test(detail)) throw new Error("Gemini API 키가 맞지 않아요. GEMINI_API_KEY를 확인해 주세요");
      if (res.status === 403) throw new Error("Gemini API 키에 권한이 없어요. Google AI Studio에서 키를 다시 만들어 주세요");
      if (res.status === 404) throw new Error(`Gemini에 '${this.model}' 모델이 없어요. GEMINI_MODEL을 확인해 주세요`);
      if (res.status === 429) throw new Error("Gemini 무료 사용량을 넘었어요. 잠시 뒤 다시 시도해 주세요");
      throw new Error(`Gemini API 오류 ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      modelVersion?: string;
    };
    if (data.promptFeedback?.blockReason) throw new Error("모델이 이 요청을 처리하지 않았어요");
    const cand = data.candidates?.[0];
    // 생각(thought) 부분은 빼고 답만 모은다
    const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    if (!text && cand?.finishReason === "SAFETY") throw new Error("모델이 이 요청을 처리하지 않았어요");
    const u = data.usageMetadata;
    return {
      text,
      inputTokens: u?.promptTokenCount ?? estimateTokens(req.system + req.user),
      outputTokens: (u?.candidatesTokenCount ?? estimateTokens(text)) + (u?.thoughtsTokenCount ?? 0),
      model: data.modelVersion ?? this.model,
    };
  }
}

/** LLM이 돌려준 텍스트에서 JSON 객체를 꺼낸다. 코드 블록으로 감싸 보내도 처리한다. */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("응답에서 JSON을 찾지 못했어요");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
