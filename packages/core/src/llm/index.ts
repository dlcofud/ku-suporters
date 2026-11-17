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
          { role: "user", content: req.user },
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
      messages: [{ role: "user", content: req.user }],
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

/** LLM이 돌려준 텍스트에서 JSON 객체를 꺼낸다. 코드 블록으로 감싸 보내도 처리한다. */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("응답에서 JSON을 찾지 못했어요");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
