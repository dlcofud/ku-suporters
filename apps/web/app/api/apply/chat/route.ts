import { apply, credits } from "@supportlab/core";
import { readMaterialFile, FormReadError } from "@supportlab/core/apply/node";
import { currentUser, currentActivity } from "@/lib/session";
import { repo, newId } from "@/lib/repo";
import { getLLM, llmStatus } from "@/lib/llm";
import { ensureApplication, publicApp, saveApp } from "@/lib/apply";
import { trendBriefFor } from "@/lib/trends";

// 로컬 모델은 한 번에 1~2분 걸릴 수 있다
export const maxDuration = 120;
/** 한 번에 올릴 수 있는 자료 수 (Vercel 요청 크기 4.5MB 안에 들어가게 화면에서 이미지를 줄여 보낸다) */
const MAX_FILES = 6;

/**
 * 지원서 코치와 한 번 주고받기.
 * 받는 것: JSON { message, edits?: {q,text}[] }  — edits는 사용자가 양식에서 직접 고친 문항
 *         또는 multipart: message, edits(JSON 글), files(자료 여러 개)
 * 자료는 이번 대화에서만 읽고, 글 자료만 정리 전까지 지원서에 보관한다 (이미지·PDF는 저장하지 않는다).
 * 주는 것: { app, edits, model, notice? }
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const act = await currentActivity(user.id);
  if (!act) return Response.json({ error: "먼저 공고를 분석해 주세요" }, { status: 400 });
  let body: { message?: string; edits?: { q: number; text: string }[] } = {};
  const materials: apply.MaterialInput[] = [];
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return Response.json({ error: "보낸 내용을 받지 못했어요" }, { status: 400 });
    let edits: { q: number; text: string }[] | undefined;
    try {
      edits = JSON.parse(String(fd.get("edits") ?? "[]"));
    } catch {
      edits = undefined;
    }
    body = { message: String(fd.get("message") ?? ""), edits };
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_FILES) return Response.json({ error: `자료는 한 번에 ${MAX_FILES}개까지 올릴 수 있어요` }, { status: 400 });
    for (const f of files) {
      try {
        materials.push(readMaterialFile(f.name, Buffer.from(await f.arrayBuffer()), f.type));
      } catch (e) {
        return Response.json({ error: e instanceof FormReadError ? e.message : `'${f.name}'을(를) 읽지 못했어요` }, { status: 400 });
      }
    }
  } else {
    body = (await req.json().catch(() => ({}))) as typeof body;
  }
  const message = String(body.message ?? "").trim() || (materials.length ? "자료를 올렸어요. 정리해서 맞는 문항에 써 주세요." : "");
  if (!message) return Response.json({ error: "메시지가 비어 있어요" }, { status: 400 });

  let app = ensureApplication(act);
  if (Array.isArray(body.edits)) app = apply.applyUserEdits(app, body.edits);
  const ctx = { notice: act.analysis, activityName: act.name, trend: await trendBriefFor(act.analysis) };
  let notice: string | undefined;
  let result: apply.CoachTurnResult;

  if (llmStatus().mode === "demo") {
    result = apply.coachTurnByRules(app, ctx, message, materials);
  } else {
    const hold = await repo.ledger.hold(user.id, "coach_turn", newId("job")).catch((e) => (e instanceof credits.InsufficientCreditsError ? null : Promise.reject(e)));
    if (!hold) {
      notice = "크레딧이 모자라서 이번 답은 규칙 기반 코치가 했어요. 크레딧 화면에서 충전할 수 있어요.";
      result = apply.coachTurnByRules(app, ctx, message, materials);
    } else {
      try {
        const client = getLLM();
        if (!client.vision && materials.some((m) => m.kind !== "text")) notice = "지금 연결된 AI는 이미지·PDF를 읽지 못해서 글 자료만 읽었어요.";
        result = await apply.coachTurn(app, ctx, message, client, materials);
        await repo.ledger.settle(hold, result.usage, result.tier);
      } catch (e) {
        await repo.ledger.release(hold);
        console.error("[apply] AI 코치 실패", e);
        notice = `AI 연결에 실패해서 규칙 기반 코치가 답했어요 (${e instanceof Error ? e.message.slice(0, 120) : "알 수 없는 오류"}).`;
        // 실패한 시도에서 사용자 말이 이미 들어갔을 수 있어 지운다
        if (app.chat.at(-1)?.role === "user" && app.chat.at(-1)?.text === message) app.chat.pop();
        result = apply.coachTurnByRules(app, ctx, message, materials);
      }
    }
  }
  await saveApp(act, result.app);
  return Response.json({ app: publicApp(result.app), edits: result.edits, model: result.model, notice });
}
