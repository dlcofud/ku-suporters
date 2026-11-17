import { llm } from "@supportlab/core";

/**
 * 보강 작업용 LLM. 위에서부터 먼저 있는 것을 쓴다.
 * 1) ANTHROPIC_API_KEY  → Claude API (구조화 출력). ANTHROPIC_MODEL로 모델을 바꿀 수 있다 (기본 claude-haiku-5-5)
 * 2) OLLAMA_URL         → 로컬 모델 (Gemma 등, 0 크레딧)
 * 3) 둘 다 없으면 데모 모드: 빈 응답을 주되, 프롬프트 길이로 토큰을 계산해 크레딧 차감을 보여 준다
 *    (공고 분석은 규칙 기반, 후기 분석은 규칙 기반 초안으로 동작)
 */
export function getLLM(): llm.LLMClient {
  if (process.env.ANTHROPIC_API_KEY) return new llm.AnthropicClient(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || "claude-haiku-5-5");
  if (process.env.OLLAMA_URL) return new llm.OllamaClient(process.env.OLLAMA_MODEL || "gemma4:e4b", process.env.OLLAMA_URL, Number(process.env.OLLAMA_NUM_CTX) || 16384, process.env.OLLAMA_VISION !== "0");
  return new llm.MockLLM(() => "{}", "paid");
}

/** 화면에 보여 줄 현재 AI 상태 */
export function llmStatus(): { mode: "claude" | "ollama" | "demo"; label: string } {
  if (process.env.ANTHROPIC_API_KEY) return { mode: "claude", label: `Claude (${process.env.ANTHROPIC_MODEL || "claude-haiku-5-5"})` };
  if (process.env.OLLAMA_URL) return { mode: "ollama", label: `로컬 모델 (${process.env.OLLAMA_MODEL || "gemma4:e4b"})` };
  return { mode: "demo", label: "데모 모드 (AI 키 없음 · 규칙 기반)" };
}
