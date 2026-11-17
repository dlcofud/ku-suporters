import { apply, credits } from "@supportlab/core";
import { currentUser, currentActivity } from "@/lib/session";
import { repo, newId } from "@/lib/repo";
import { getLLM, llmStatus } from "@/lib/llm";
import { ensureApplication, publicApp, saveApp } from "@/lib/apply";

// 로컬 모델은 한 번에 1~2분 걸릴 수 있다
export const maxDuration = 120;

/**
 * 지원서 코치와 한 번 주고받기.
 * 받는 것: { message, edits?: {q,text}[] }  — edits는 사용자가 양식에서 직접 고친 문항
 * 주는 것: { app, edits, model, notice? }
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const act = await currentActivity(user.id);
  if (!act) return Response.json({ error: "먼저 공고를 분석해 주세요" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { message?: string; edits?: { q: number; text: string }[] };
  const message = String(body.message ?? "").trim();
  if (!message) return Response.json({ error: "메시지가 비어 있어요" }, { status: 400 });

  let app = ensureApplication(act);
  if (Array.isArray(body.edits)) app = apply.applyUserEdits(app, body.edits);
  const ctx = { notice: act.analysis, activityName: act.name };
  let notice: string | undefined;
  let result: apply.CoachTurnResult;

  if (llmStatus().mode === "demo") {
    result = apply.coachTurnByRules(app, ctx, message);
  } else {
    const hold = await repo.ledger.hold(user.id, "coach_turn", newId("job")).catch((e) => (e instanceof credits.InsufficientCreditsError ? null : Promise.reject(e)));
    if (!hold) {
      notice = "크레딧이 모자라서 이번 답은 규칙 기반 코치가 했어요. 크레딧 화면에서 충전할 수 있어요.";
      result = apply.coachTurnByRules(app, ctx, message);
    } else {
      try {
        result = await apply.coachTurn(app, ctx, message, getLLM());
        await repo.ledger.settle(hold, result.usage, result.tier);
      } catch (e) {
        await repo.ledger.release(hold);
        console.error("[apply] AI 코치 실패", e);
        notice = `AI 연결에 실패해서 규칙 기반 코치가 답했어요 (${e instanceof Error ? e.message.slice(0, 120) : "알 수 없는 오류"}).`;
        // 실패한 시도에서 사용자 말이 이미 들어갔을 수 있어 지운다
        if (app.chat.at(-1)?.role === "user" && app.chat.at(-1)?.text === message) app.chat.pop();
        result = apply.coachTurnByRules(app, ctx, message);
      }
    }
  }
  await saveApp(act, result.app);
  return Response.json({ app: publicApp(result.app), edits: result.edits, model: result.model, notice });
}
