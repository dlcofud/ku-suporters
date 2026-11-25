import Link from "next/link";
import { repo } from "@/lib/repo";
import { approveReviewAction, rejectReviewAction } from "@/lib/actions";
import { contribution, trends } from "@supportlab/core";

const RESULT: Record<string, string> = { final_pass: "최종 합격", document_pass: "서류 합격", fail: "불합격" };

/**
 * 사용자가 '합격 경험 공유'로 낸 글 승인 (검수 화면 안의 한 칸).
 * 승인하면 공유한 사람에게 크레딧이 지급되고 후기가 합격 경향에 들어가요. 증빙 이미지는 처리가 끝나면 지워요.
 */
export async function SharedApprovals({ error }: { error?: string }) {
  const queue = await repo.listContributions({ statuses: ["submitted", "in_review"] });
  const done = await repo.listContributions({ statuses: ["approved", "rejected"] });
  const coded = new Map((await Promise.all(queue.filter((c) => c.storyReviewId).map((c) => repo.getCodedReview(c.storyReviewId!)))).filter((x): x is trends.CodedReview => !!x).map((r) => [r.id, r]));
  return (
    <section id="shared" className="grid" style={{ gap: 12 }}>
      <div className="row between">
        <div className="grid" style={{ gap: 2 }}>
          <h2 style={{ margin: 0 }}>사용자가 공유한 합격 경험 {queue.length > 0 && <span className="tag k-hl">{queue.length}건 대기</span>}</h2>
          <span className="small muted">사용자가 직접 낸 글이라 사람이 승인해야 해요. 승인하면 크레딧이 지급되고 합격 경향에 들어가요. 점수는 AI가 자동 검수해 둬요. 내가 낸 공유는 다른 관리자가 승인해요.</span>
        </div>
      </div>
      {error && <div className="note warn">{error}</div>}
      {queue.length === 0 && <p className="muted small" style={{ margin: 0 }}>승인할 공유가 없어요.</p>}
      {queue.map((c) => (
        <form key={c.id} action={approveReviewAction} className="card">
          <input type="hidden" name="id" value={c.id} />
          <div className="row between">
            <h3 style={{ margin: 0 }}>{c.activityName}</h3>
            <span className="tag">{RESULT[c.result ?? ""] ?? "-"}</span>
          </div>
          <span className="small muted">{c.field ? `${c.field} · ` : ""}게시물 {c.selectedMediaIds.length}개 · 증빙 {c.proofUploadRef ? "있음" : "없음"} · 후기 {c.story ? `${c.story.length}자` : "없음"} · 동의 {c.consents.filter((x) => x.agreed).length}/4 (버전 {c.consents[0]?.version}) · 기여 보상 {(c.rewardTotal ?? contribution.computeReward(c).total)}</span>
          {c.story && (
            <details className="card" style={{ padding: 14 }}>
              <summary><b>후기 원문</b> <span className="small muted">승인·반려하면 지워져요</span></summary>
              <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{c.story}</p>
            </details>
          )}
          {c.storyReviewId && coded.get(c.storyReviewId) && (() => {
            const rv = coded.get(c.storyReviewId!)!;
            const sc = trends.finalScores(rv);
            return (
              <div className="small">
                <b>AI 코딩</b> {trends.CODES.map((k) => `${k} ${trends.markText(sc[k])}`).join(" · ")} · 총점 {trends.markSum(sc)}/16 (— 언급 없음)
                {rv.ai.summary && <span className="muted"> — {rv.ai.summary}</span>}{" "}
                <Link href={`/reviews/${rv.id}`}>점수 자세히</Link>
              </div>
            );
          })()}
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>검수 체크리스트</b> <span className="small muted">낸 것에 맞는 항목만 보여요</span></legend>
            {contribution.checksNeeded(c).map((k) => (
              <label key={k} className="check"><input type="checkbox" name={`chk_${k}`} />{contribution.REVIEW_CHECKS[k]}</label>
            ))}
          </fieldset>
          <label>반려 사유 (반려할 때 필수)<input type="text" name="reason" /></label>
          <div className="row">
            <button className="btn pri" type="submit">승인 · 크레딧 확정</button>
            <button className="btn warn" type="submit" formAction={rejectReviewAction}>반려 · 크레딧 취소</button>
          </div>
        </form>
      ))}
      {done.length > 0 && (
        <details className="card">
          <summary><b>처리 완료</b> {done.length}건</summary>
          <table><thead><tr><th>활동</th><th>결과</th><th>결정</th><th>사유</th></tr></thead>
            <tbody>{done.map((c) => <tr key={c.id}><td>{c.activityName}</td><td>{RESULT[c.result ?? ""]}</td><td>{c.status === "approved" ? "승인" : "반려"}</td><td>{c.review?.reason ?? "-"}</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </section>
  );
}
