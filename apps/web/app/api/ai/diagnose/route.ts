import { apply, llm } from "@supportlab/core";
import { currentUser, currentActivity, rolesOf } from "@/lib/session";
import { ensureApplication } from "@/lib/apply";
import { geminiProbe } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 관리자 전용 진단: 지금 고른 서포터즈로 '코치 한 번'과 같은 요청을 만들어
 * 설정 네 가지로 동시에 Gemini에 보내고, 걸린 시간·멈춘 이유·출력 길이를 돌려준다.
 * 지원서·대화는 저장하지 않고, 크레딧도 쓰지 않는다.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  if (!rolesOf(user).includes("admin")) return Response.json({ error: "관리자만 쓸 수 있어요" }, { status: 403 });
  const act = await currentActivity(user.id);
  if (!act) return Response.json({ error: "서포터즈를 먼저 골라 주세요" }, { status: 400 });

  const message = new URL(req.url).searchParams.get("message") || "통학길에 이어폰으로 강의 녹음을 다시 들어요. 이 경험을 1번에 써 주세요.";
  const app = ensureApplication(act);
  const { system, user: prompt } = apply.buildCoachPrompt(app, act.analysis, act.name, message);
  const schema = apply.COACH_SCHEMA as unknown as Record<string, unknown>;

  const variants = [
    { name: "스키마 + 생각 low (예전)", thinking: "low" as const, withSchema: true },
    { name: "스키마 + 생각 minimal (지금 기본)", thinking: "minimal" as const, withSchema: true },
    { name: "스키마 없이 JSON + 생각 minimal", thinking: "minimal" as const, withSchema: false },
    { name: "스키마 + 생각 설정 안 보냄", thinking: "off" as const, withSchema: true },
  ];
  const results = await Promise.all(
    variants.map(async (v) => {
      const client = geminiProbe(v.thinking, 25_000);
      if (!client) return { ...v, ok: false, error: "GEMINI_API_KEY가 없어요" };
      const t0 = Date.now();
      try {
        const r = await client.complete({ system, user: prompt, maxOutputTokens: 1800, json: true, ...(v.withSchema ? { schema } : {}) });
        let replyOk = false;
        try {
          replyOk = typeof llm.extractJson<{ reply?: unknown }>(r.text).reply === "string";
        } catch {
          replyOk = false;
        }
        return { name: v.name, ok: true, seconds: (Date.now() - t0) / 1000, model: r.model, finishReason: r.finishReason, outputTokens: r.outputTokens, chars: r.text.length, replyOk, preview: r.text.slice(0, 160) };
      } catch (e) {
        return { name: v.name, ok: false, seconds: (Date.now() - t0) / 1000, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return Response.json(
    { activity: act.name, promptChars: system.length + prompt.length, questions: app.questions.length, chatTurns: app.chat.length, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
