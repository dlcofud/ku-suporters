import { trends } from "@supportlab/core";
import { currentUser, rolesOf } from "@/lib/session";
import { repo } from "@/lib/repo";
import { getLLM } from "@/lib/llm";
import { fetchNotice, NoticeFetchError } from "@/lib/fetchNotice";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI 교차 검수 한 건 (관리자).
 * 원문을 다시 가져와 AI가 코드북으로 새로 점수를 매기고, 지금 점수(시트·AI 초안)와 비교해 저장한다.
 * 사람 검수를 대신하지 않는다: 상태는 그대로 두고 cross 칸만 채운다. 원문은 저장하지 않는다.
 * 받는 것: { id }
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !rolesOf(user).includes("admin")) return Response.json({ error: "관리자만 쓸 수 있어요" }, { status: 403 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const r = id ? await repo.getCodedReview(id) : undefined;
  if (!r) return Response.json({ error: "후기를 찾지 못했어요" }, { status: 404 });
  const at = new Date().toISOString();
  const fail = async (error: string) => {
    r.cross = { ok: false, error, at };
    await repo.saveCodedReview(r);
    return Response.json({ id: r.id, ok: false, error });
  };

  // 원문: 웹 후기는 페이지를 한 번 가져오고, 사용자 공유 후기는 공유에 남아 있는 글을 쓴다
  let text = "";
  if (r.meta.url.startsWith("http")) {
    try {
      text = (await fetchNotice(r.meta.url)).text;
    } catch (e) {
      return fail(e instanceof NoticeFetchError ? `원문을 가져오지 못했어요: ${e.message}` : "원문을 가져오지 못했어요");
    }
  } else if (r.contributionId) {
    text = (await repo.getContribution(r.contributionId))?.story ?? "";
  }
  if (text.trim().length < 200) return fail("원문 글이 너무 짧아요 (로그인이 필요하거나 글이 이미지일 수 있어요)");

  let coded: trends.CodingResult;
  try {
    coded = await trends.codeReviewWithLLM(text.slice(0, 20_000), r.meta, getLLM());
  } catch (e) {
    console.error("[cross] AI 실패", e);
    return fail(`AI가 답하지 못했어요: ${e instanceof Error ? e.message.slice(0, 120) : "알 수 없는 오류"}`);
  }
  if (coded.model === "rules") return fail("AI가 연결되지 않아 규칙 기반으로만 읽혀요. 교차 검수에는 쓰지 않아요");
  const { verdict, diff } = trends.compareScores(r.ai.scores, coded.scores);
  r.cross = { ok: true, scores: coded.scores, model: coded.model, at, verdict, diff };
  await repo.saveCodedReview(r);
  return Response.json({ id: r.id, ok: true, verdict, diff });
}
