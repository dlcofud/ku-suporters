import { llm } from "@supportlab/core";

/**
 * 보강 작업용 LLM. 위에서부터 먼저 있는 것을 쓴다.
 * 1) ANTHROPIC_API_KEY → Claude API. ANTHROPIC_MODEL로 모델을 바꿀 수 있다 (기본 claude-haiku-5-5)
 * 2) GEMINI_API_KEY    → Google Gemini API. GEMINI_MODEL로 모델을 바꿀 수 있다 (기본 gemini-flash-latest)
 * 3) OLLAMA_URL        → 로컬 모델 (Gemma 등, 0 크레딧)
 * 4) 아무것도 없으면 데모 모드: 규칙 기반으로만 동작 (공고 분석·후기 분석·코치 모두 규칙 기반 대체)
 */
const GEMINI_DEFAULT = "gemini-flash-latest";

export function getLLM(): llm.LLMClient {
  if (process.env.ANTHROPIC_API_KEY) return new llm.AnthropicClient(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || "claude-haiku-5-5");
  if (process.env.GEMINI_API_KEY)
    // GEMINI_BASE_URL은 테스트용 (가짜 Gemini 서버). 보통은 비워 둔다
    return new llm.GeminiClient(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || GEMINI_DEFAULT, {
      baseUrl: process.env.GEMINI_BASE_URL || undefined,
      // 첫 모델이 붐비면(503 등) 차례로 쓸 모델. 쉼표로 여러 개. 비우면 gemini-flash-lite-latest
      fallbackModels: process.env.GEMINI_FALLBACK_MODELS !== undefined && process.env.GEMINI_FALLBACK_MODELS.trim() !== "" ? process.env.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean) : undefined,
      // 생각 깊이: 기본 minimal (코치 요청이 25초를 넘겼다). minimal · low · medium · high · off
      thinkingLevel: geminiThinking(),
    });
  if (process.env.OLLAMA_URL) return new llm.OllamaClient(process.env.OLLAMA_MODEL || "gemma4:e4b", process.env.OLLAMA_URL, Number(process.env.OLLAMA_NUM_CTX) || 16384, process.env.OLLAMA_VISION !== "0");
  return new llm.MockLLM(() => "{}", "paid");
}

/** 화면에 보여 줄 현재 AI 상태 */
export function llmStatus(): { mode: "claude" | "gemini" | "ollama" | "demo"; label: string } {
  if (process.env.ANTHROPIC_API_KEY) return { mode: "claude", label: `Claude (${process.env.ANTHROPIC_MODEL || "claude-haiku-5-5"})` };
  if (process.env.GEMINI_API_KEY) return { mode: "gemini", label: `Gemini (${process.env.GEMINI_MODEL || GEMINI_DEFAULT})` };
  if (process.env.OLLAMA_URL) return { mode: "ollama", label: `로컬 모델 (${process.env.OLLAMA_MODEL || "gemma4:e4b"})` };
  return { mode: "demo", label: "데모 모드 (AI 키 없음 · 규칙 기반)" };
}

const THINKING = ["minimal", "low", "medium", "high", "off"] as const;
type Thinking = (typeof THINKING)[number];
function geminiThinking(): Thinking {
  const v = process.env.GEMINI_THINKING as Thinking | undefined;
  return v && THINKING.includes(v) ? v : "minimal";
}

/** 진단용: 대체 모델 없이 모델 하나를 정해진 설정으로 부르는 Gemini 클라이언트 (키가 없으면 undefined) */
export function geminiProbe(thinkingLevel: Thinking, timeoutMs = 25_000): llm.GeminiClient | undefined {
  if (!process.env.GEMINI_API_KEY) return undefined;
  return new llm.GeminiClient(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || GEMINI_DEFAULT, {
    baseUrl: process.env.GEMINI_BASE_URL || undefined,
    fallbackModels: [],
    thinkingLevel,
    timeoutMs,
    rounds: 1,
  });
}
