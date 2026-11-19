import { llm } from "@supportlab/core";
import { currentUser } from "@/lib/session";
import { getLLM, llmStatus } from "@/lib/llm";

/** 지금 설정된 AI에 아주 짧은 요청을 보내 연결이 되는지 확인한다 (로그인한 사람만) */
export async function GET() {
  if (!(await currentUser())) return Response.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  const status = llmStatus();
  if (status.mode === "demo") return Response.json({ ok: false, mode: status.mode, label: status.label, error: "AI 설정이 없어요. apps/web/.env.local 에 GEMINI_API_KEY 를 넣고 서버를 다시 켜 주세요" });
  const t0 = Date.now();
  try {
    const res = await getLLM().complete({
      system: "연결 확인용 요청입니다.",
      user: "'서포트랩 연결 성공'이라는 뜻의 짧은 한국어 문장 하나를 reply에 넣어 주세요.",
      maxOutputTokens: 80,
      json: true,
      schema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false },
    });
    const reply = llm.extractJson<{ reply?: string }>(res.text).reply ?? "";
    return Response.json({ ok: true, mode: status.mode, label: status.label, model: res.model, ms: Date.now() - t0, reply });
  } catch (e) {
    return Response.json({ ok: false, mode: status.mode, label: status.label, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
  }
}
