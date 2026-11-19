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
  /** 함께 보낼 이미지·PDF (이미지를 읽을 수 있는 모델만, vision이 true인 클라이언트. PDF는 Gemini·Claude만) */
  images?: LLMImage[];
  /** 이 요청만 기다리는 시간을 바꿀 때 (지원하는 클라이언트만, 지금은 Gemini) */
  timeoutMs?: number;
}

export interface LLMImage {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf";
  /** base64 (data: 접두어 없이) */
  data: string;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  /** 모델이 멈춘 이유 (STOP · MAX_TOKENS 등, 아는 경우만) */
  finishReason?: string;
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
          { role: "user", content: req.user, ...(req.images?.some((i) => i.mediaType !== "application/pdf") ? { images: req.images.filter((i) => i.mediaType !== "application/pdf").map((i) => i.data) } : {}) },
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
            ? [
                ...req.images.map((i) =>
                  i.mediaType === "application/pdf"
                    ? { type: "document", source: { type: "base64", media_type: i.mediaType, data: i.data } }
                    : { type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } },
                ),
                { type: "text", text: req.user },
              ]
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
 *   400이면 모델이 모르는 설정을 하나씩 빼고 다시 묻는다: 생각 설정 → 스키마 (결과는 각 기능의 검사기가 다시 확인).
 * - 모델이 붐비면(503·429·5xx·시간 초과) 다음 모델로 넘어간다: GEMINI_MODEL → fallbackModels.
 *   무료 등급의 최신 Flash는 수요가 몰리면 503을 내거나 답 없이 멈춘다 (2026-11-19 배포 로그에서 확인).
 * - 모델 하나에 timeoutMs(기본 15초). 평소 코치 답은 2~8초 (2026-11-19 /api/ai/diagnose 측정).
 * - 모든 모델이 붐비면 잠깐(retryDelayMs, 기본 1.5초) 쉬고 한 바퀴 더 돈다 (rounds, 기본 2).
 *   503은 몇 초 사이에도 왔다 갔다 해서, 한 번 더 물으면 대부분 답한다. 최악이어도 두 모델 × 두 바퀴 ≈ 1분.
 * 키는 서버 환경 변수(GEMINI_API_KEY)로만 넘긴다. 브라우저에서 만들지 말 것.
 */
export class GeminiClient implements LLMClient {
  readonly tier = "paid" as const;
  readonly vision = true;
  constructor(
    private readonly apiKey: string,
    /** 기본은 구글이 최신 Flash로 바꿔 주는 별칭. GEMINI_MODEL로 고정할 수 있다 */
    readonly model: string = "gemini-flash-latest",
    private readonly opts: {
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      /** 모델 하나를 기다리는 시간 (기본 15초) */
      timeoutMs?: number;
      /** 모든 모델이 붐빌 때 몇 바퀴까지 돌지 (기본 2) */
      rounds?: number;
      /** 바퀴 사이에 쉬는 시간 (기본 1500ms) */
      retryDelayMs?: number;
      /** 첫 모델이 붐빌 때 차례로 쓸 모델 (기본 gemini-flash-lite-latest). 빈 배열이면 넘어가지 않는다 */
      fallbackModels?: string[];
      /**
       * 생각(thinking) 깊이 (기본 minimal). Gemini 3 Flash는 기본이 high라 긴 요청에서 오래 걸리고,
       * Flash-Lite는 원래 생각하지 않는데 low를 보내면 오히려 생각을 켠다. "off"면 설정을 보내지 않는다 (모델 기본값)
       */
      thinkingLevel?: "minimal" | "low" | "medium" | "high" | "off";
    } = {},
  ) {
    if (!apiKey) throw new Error("GEMINI_API_KEY가 비어 있어요");
  }

  /** 차례로 써 볼 모델들 (겹치는 이름은 한 번만) */
  get models(): string[] {
    return [...new Set([this.model, ...(this.opts.fallbackModels ?? ["gemini-flash-lite-latest"])].filter(Boolean))];
  }

  private body(req: LLMRequest, withSchema: boolean, withThinking: boolean): Record<string, unknown> {
    const level = this.opts.thinkingLevel ?? "minimal";
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
        // 생각 토큰도 출력 한도에 들어간다. 너무 넉넉하면 JSON이 끝나지 않고 길게 이어질 때 오래 걸린다
        maxOutputTokens: Math.max(1024, Math.round(req.maxOutputTokens * 1.5)),
        ...(withThinking && level !== "off" ? { thinkingConfig: { thinkingLevel: level } } : {}),
        temperature: wantsJson ? 0.2 : 0.7,
        ...(wantsJson ? { responseMimeType: "application/json" } : {}),
        ...(withSchema && req.schema ? { responseJsonSchema: req.schema } : {}),
      },
    };
  }

  /** 시간 초과는 Response 대신 "timeout"을 돌려준다 (다음 모델로 넘어가기 위해) */
  private async post(model: string, body: Record<string, unknown>, signal: AbortSignal): Promise<Response | "timeout"> {
    const f = this.opts.fetchImpl ?? fetch;
    const url = `${this.opts.baseUrl ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try {
      return await f(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey }, body: JSON.stringify(body), signal });
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "timeout";
      throw new Error(`Gemini에 연결하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 모델 하나로 묻기. 붐비면 { busy } 를 돌려주고, 고칠 수 없는 오류는 던진다 */
  private async tryModel(model: string, req: LLMRequest): Promise<{ res: Response } | { busy: string }> {
    const waitMs = req.timeoutMs ?? this.opts.timeoutMs ?? 15_000;
    const signal = AbortSignal.timeout(waitMs);
    // 키가 틀린 400은 설정을 빼 봐야 소용없으니 바로 알린다
    const keyError = async (r: Response | "timeout") => {
      if (r === "timeout" || r.status !== 400) return false;
      const detail = await r.clone().text().catch(() => "");
      return /API key/i.test(detail);
    };
    const KEY_MSG = "Gemini API 키가 맞지 않아요. GEMINI_API_KEY를 확인해 주세요";
    let withSchema = true;
    let withThinking = (this.opts.thinkingLevel ?? "minimal") !== "off";
    let res = await this.post(model, this.body(req, withSchema, withThinking), signal);
    if (await keyError(res)) throw new Error(KEY_MSG);
    if (res !== "timeout" && res.status === 400 && withThinking) {
      withThinking = false;
      res = await this.post(model, this.body(req, withSchema, withThinking), signal);
    }
    if (res !== "timeout" && res.status === 400 && req.schema) {
      withSchema = false;
      res = await this.post(model, this.body(req, withSchema, withThinking), signal);
    }
    if (res === "timeout") return { busy: `${model}: ${Math.round(waitMs / 1000)}초 안에 답 없음` };
    if (res.status === 429 || res.status >= 500) return { busy: `${model}: ${res.status}` };
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 400 && /API key/i.test(detail)) throw new Error(KEY_MSG);
      if (res.status === 403) throw new Error("Gemini API 키에 권한이 없어요. Google AI Studio에서 키를 다시 만들어 주세요");
      if (res.status === 404) return { busy: `${model}: 모델 없음` };
      throw new Error(`Gemini API 오류 ${res.status}: ${detail.slice(0, 300)}`);
    }
    return { res };
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const tried: string[] = [];
    const rounds = Math.max(1, this.opts.rounds ?? 2);
    for (let round = 0; round < rounds; round++) {
      if (round > 0) await new Promise((r) => setTimeout(r, this.opts.retryDelayMs ?? 1500));
      for (const model of this.models) {
        const r = await this.tryModel(model, req);
        if ("busy" in r) {
          if (!tried.includes(r.busy)) tried.push(r.busy);
          // 모델이 없으면 다음 바퀴에도 없다
          continue;
        }
        return this.read(r.res, req, model);
      }
      if (tried.every((t) => t.endsWith("모델 없음"))) break;
    }
    if (tried.every((t) => t.endsWith("모델 없음"))) throw new Error(`Gemini에 '${this.model}' 모델이 없어요. GEMINI_MODEL을 확인해 주세요`);
    if (tried.some((t) => t.endsWith(": 429"))) throw new Error(`Gemini 무료 사용량을 넘었어요. 잠시 뒤 다시 시도해 주세요 (${tried.join(" · ")})`);
    throw new Error(`Gemini가 지금 붐벼서 답하지 못했어요. 잠시 뒤 다시 시도해 주세요 (${tried.join(" · ")})`);
  }

  private async read(res: Response, req: LLMRequest, model: string): Promise<LLMResponse> {
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
      model: data.modelVersion ?? model,
      finishReason: cand?.finishReason,
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
