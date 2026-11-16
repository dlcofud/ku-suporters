import { llm } from "@supportlab/core";

/**
 * 보강 작업용 LLM.
 * - OLLAMA_URL이 있으면 로컬 모델(Gemma 등, 0 크레딧)
 * - 없으면 데모 모드: 실제 모델 대신 빈 응답을 주되, 프롬프트 길이로 토큰을 계산해 크레딧 차감을 보여준다
 */
export function getLLM(): llm.LLMClient {
  if (process.env.OLLAMA_URL) return new llm.OllamaClient(process.env.OLLAMA_MODEL || "gemma4:e4b", process.env.OLLAMA_URL);
  return new llm.MockLLM(() => "{}", "paid");
}
