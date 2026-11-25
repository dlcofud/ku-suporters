import { trends } from "@supportlab/core";
import { repo } from "@/lib/repo";
import { getLLM } from "@/lib/llm";
import { fetchNotice, NoticeFetchError } from "@/lib/fetchNotice";

/**
 * 후기 한 건 자동 검수 (packages/core/src/trends/autoreview.ts 흐름).
 *   교차 검수(없을 때만) → 같으면 검수 완료 → 다르면 AI 판정 → 검수 완료.
 *   원문을 못 읽거나 AI가 답하지 못하면 그 이유를 남기고 '관리자 확인 필요'가 된다.
 * text를 주면(방금 붙여넣은 본문 등) 원문을 다시 가져오지 않는다. 원문은 저장하지 않는다.
 */
export type AutoOutcome = { id: string; state: trends.AutoState; via?: string; error?: string };

export async function autoReview(id: string, given?: string): Promise<AutoOutcome> {
  const r = await repo.getCodedReview(id);
  if (!r) return { id, state: "needs-human", error: "후기를 찾지 못했어요" };
  if (r.status === "검수 완료") return { id, state: "done", via: r.human?.via };
  const at = new Date().toISOString();
  const done = async (): Promise<AutoOutcome> => {
    await repo.saveCodedReview(r);
    return { id, state: trends.autoState(r), via: r.human?.via, error: trends.autoProblem(r) };
  };

  // 예전에 실패했으면 이번에 다시 시도한다
  if (r.cross && !r.cross.ok) delete r.cross;
  if (r.judge && !r.judge.ok) delete r.judge;

  // 교차 검수가 이미 일치하면 원문을 다시 읽을 필요가 없다
  if (trends.finalizeAuto(r, at)) return done();

  let text = given ?? "";
  if (!text) {
    if (r.meta.url.startsWith("http")) {
      try {
        text = (await fetchNotice(r.meta.url)).text;
      } catch (e) {
        r.cross ??= { ok: false, error: e instanceof NoticeFetchError ? `원문을 가져오지 못했어요: ${e.message}` : "원문을 가져오지 못했어요", at };
        if (r.cross.ok) r.judge = { ok: false, error: "판정하려고 원문을 다시 가져오지 못했어요", at };
        return done();
      }
    } else if (r.contributionId) {
      text = (await repo.getContribution(r.contributionId))?.story ?? "";
    }
  }
  const short = text.trim().length < (given ? 80 : 200);
  if (short) {
    const error = "원문 글이 너무 짧아요 (로그인이 필요하거나 글이 이미지일 수 있어요)";
    if (r.cross?.ok) r.judge = { ok: false, error, at };
    else r.cross = { ok: false, error, at };
    return done();
  }
  const llm = getLLM();

  if (!r.cross?.ok) {
    try {
      const coded = await trends.codeReviewWithLLM(text.slice(0, 20_000), r.meta, llm);
      if (coded.model === "rules") throw new Error("AI가 연결되지 않아 규칙 기반으로만 읽혀요");
      r.cross = { ok: true, scores: coded.scores, model: coded.model, at, ...trends.compareScores(r.ai.scores, coded.scores) };
    } catch (e) {
      console.error("[auto] 교차 검수 실패", e);
      r.cross = { ok: false, error: `AI 교차 검수 실패: ${e instanceof Error ? e.message.slice(0, 120) : "알 수 없는 오류"}`, at };
      return done();
    }
    if (trends.finalizeAuto(r, at)) return done();
  }

  const cross = r.cross as Extract<trends.CrossCheck, { ok: true }>;
  try {
    r.judge = await trends.judgeWithLLM(text, r.meta, cross.diff, r.ai.scores, cross.scores, llm, at);
  } catch (e) {
    console.error("[auto] AI 판정 실패", e);
    r.judge = { ok: false, error: `AI 판정 실패: ${e instanceof Error ? e.message.slice(0, 120) : "알 수 없는 오류"}`, at };
    return done();
  }
  trends.finalizeAuto(r, at);
  return done();
}

/** 아직 자동 검수를 돌리지 않은 후기 (오래된 것 먼저) */
export async function autoTodo(): Promise<string[]> {
  const list = await repo.listCodedReviews();
  return list
    .filter((r) => trends.autoState(r) === "todo")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((r) => r.id);
}
