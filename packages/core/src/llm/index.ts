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
  ) {}
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: req.json ? "json" : undefined,
        options: { num_predict: req.maxOutputTokens },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
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

/** LLM이 돌려준 텍스트에서 JSON 객체를 꺼낸다. 코드 블록으로 감싸 보내도 처리한다. */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("응답에서 JSON을 찾지 못했어요");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
