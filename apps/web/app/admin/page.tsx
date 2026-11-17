import { requireRole } from "@/lib/session";
import { repo } from "@/lib/repo";
import { approveReviewAction, rejectReviewAction } from "@/lib/actions";
import { contribution } from "@supportlab/core";

const RESULT: Record<string, string> = { final_pass: "최종 합격", document_pass: "서류 합격", fail: "불합격" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireRole("admin");
  const { error } = await searchParams;
  const queue = await repo.listContributions({ statuses: ["submitted", "in_review"] });
  const done = await repo.listContributions({ statuses: ["approved", "rejected"] });
  return (
    <>
      <header>
        <span className="eyebrow">관리자</span>
        <h1>업로드 자료 검수</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>관리자(@{me.loginId})만 볼 수 있어요. 승인하면 공유한 사람에게 크레딧이 지급되고, 증빙 이미지는 검수가 끝나면 지워요. 내가 올린 공유는 다른 관리자가 검수해야 해요.</p>
      {error && <div className="note warn">{error}</div>}
      {queue.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>검수할 자료가 없어요.</p></div>}
      {queue.map((c) => (
        <form key={c.id} action={approveReviewAction} className="card">
          <input type="hidden" name="id" value={c.id} />
          <div className="row between">
            <h2>{c.activityName}</h2>
            <span className="tag">{RESULT[c.result ?? ""] ?? "-"}</span>
          </div>
          <span className="small muted">게시물 {c.selectedMediaIds.length}개 · 증빙 {c.proofUploadRef ? "있음" : "없음"} · 동의 {c.consents.filter((x) => x.agreed).length}/4 (버전 {c.consents[0]?.version}) · 기여 보상 {contribution.computeReward(c).total}</span>
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>검수 체크리스트</b></legend>
            {Object.entries(contribution.REVIEW_CHECKS).map(([k, label]) => (
              <label key={k} className="check"><input type="checkbox" name={`chk_${k}`} />{label}</label>
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
        <section className="card">
          <h2>처리 완료</h2>
          <table><thead><tr><th>활동</th><th>결과</th><th>결정</th><th>사유</th></tr></thead>
            <tbody>{done.map((c) => <tr key={c.id}><td>{c.activityName}</td><td>{RESULT[c.result ?? ""]}</td><td>{c.status === "approved" ? "승인" : "반려"}</td><td>{c.review?.reason ?? "-"}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}
