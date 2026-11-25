import Link from "next/link";
import { notFound } from "next/navigation";
import { trends } from "@supportlab/core";
import { requireRole } from "@/lib/session";
import { repo } from "@/lib/repo";
import { verifyReviewAction, verifyAndNextAction } from "@/lib/actions";
import { SubmitButton, PendingNote } from "@/components/Pending";

/** 값 "-" = 언급 없음(평균에서 뺌). 0 = 언급은 있지만 내용 없음 */
const SCORE_OPTIONS: [string, string][] = [["-", "— · 언급 없음"], ["0", "0 · 내용 없음"], ["1", "1 · 있음"], ["2", "2 · 구체적"]];

export default async function ReviewDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dup?: string; saved?: string; aierror?: string; own?: string }> }) {
  const me = await requireRole("admin");
  const { id } = await params;
  const q = await searchParams;
  const r = await repo.getCodedReview(id);
  if (!r) notFound();
  const c = trends.toCurated(r);
  const cur = trends.finalScores(r);
  const rules = r.ai.model === "rules";
  const fromSheet = r.ai.model === "sheet";
  const mine = !trends.canVerify(r, me.id);
  const all = await repo.listCodedReviews();
  const contrib = r.contributionId ? await repo.getContribution(r.contributionId) : undefined;
  const web = r.meta.url.startsWith("http");
  const left = all.filter((x) => x.status !== "검수 완료" && x.id !== r.id && trends.canVerify(x, me.id)).length;
  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <span className="eyebrow"><Link href="/reviews">합격 후기 분석</Link> · {r.status}</span>
        <h1>{c.org !== "확인 필요" ? `${c.org} ${c.activity !== "확인 필요" ? c.activity : ""}` : r.meta.title || "활동 정보 확인 필요"}</h1>
        {web ? (
          <p className="small muted" style={{ margin: 0 }}>출처: <a href={r.meta.url} target="_blank" rel="noreferrer">{r.meta.sourceName}{r.meta.title ? ` 「${r.meta.title}」` : ""}</a> · <a className="btn small-btn" href={r.meta.url} target="_blank" rel="noreferrer">원문 열기 ↗</a></p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>출처: {r.meta.sourceName} · {r.pendingApproval ? "관리자 승인 전이라 합격 경향에는 아직 안 들어가요" : "관리자가 승인했어요"}</p>
        )}
      </header>

      {q.dup && <p className="note">이미 분석한 후기라 기존 결과를 열었어요.</p>}
      {q.saved && <p className="note ok">검수 완료로 저장했어요. 경향 분석에 바로 반영돼요.{r.status !== "검수 완료" ? " 이어서 이 후기를 검수해 주세요." : ""}</p>}
      {(q.own || mine) && <p className="note warn">내가 코딩한 후기라 다른 팀원이 원문과 대조해 검수해야 해요. 같은 사람이 코딩과 검수를 하면 실수를 잡기 어려워요.</p>}
      {contrib?.story && (
        <details className="card" open={r.status !== "검수 완료"}>
          <summary><b>사용자가 쓴 후기 원문</b> <span className="small muted">관리자가 승인·반려하면 지워져요</span></summary>
          <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{contrib.story}</p>
        </details>
      )}
      {fromSheet && r.status !== "검수 완료" && <p className="note">수집 시트에서 가져온 <b>시드 점수</b>예요. 근거 문장이 없으니 <a href={r.meta.url} target="_blank" rel="noreferrer">원문을 열어</a> 점수와 결과 단계를 대조해 주세요.</p>}
      {q.aierror && <p className="note warn">AI 호출이 실패해서 규칙 기반 초안으로 저장했어요. 점수를 꼭 직접 확인해 주세요.</p>}
      {rules && !q.aierror && <p className="note warn">AI 키가 없어서 단서 단어로 매긴 <b>규칙 기반 초안</b>이에요. 정확도가 낮으니 점수를 하나씩 확인해 주세요.</p>}

      <form action={verifyReviewAction} className="grid" style={{ gap: 20 }}>
        <input type="hidden" name="id" value={r.id} />
        <section className="card">
          <div className="row between">
            <h2>코드별 점수</h2>
            <span className="small muted">AI 점수와 근거를 보고, 다르면 고쳐 주세요</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>코드</th><th>AI 근거</th><th style={{ textAlign: "right" }}>AI</th><th>검수 점수</th></tr></thead>
              <tbody>
                {trends.CODES.map((code) => {
                  const b = trends.CODEBOOK[code];
                  const changed = r.human && r.human.scores[code] !== r.ai.scores[code];
                  return (
                    <tr key={code}>
                      <td style={{ minWidth: 150 }}>
                        <b>{code} {b.name}</b>
                        <details className="small muted"><summary>기준</summary>— 언급 없음 (평균에서 뺌)<br />0 {b.s0}<br />1 {b.s1}<br />2 {b.s2}</details>
                      </td>
                      <td style={{ minWidth: 220 }}>{r.ai.evidence[code]}</td>
                      <td className="num" style={{ textAlign: "right" }}>{trends.markText(r.ai.scores[code])}</td>
                      <td style={{ minWidth: 140 }}>
                        <select name={code} defaultValue={cur[code] === null || cur[code] === undefined ? "-" : String(cur[code])} aria-label={`${code} 검수 점수`} style={changed ? { borderColor: "var(--ink)", background: "var(--hlbg)" } : undefined}>
                          {SCORE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid g2" style={{ alignItems: "start" }}>
          <div className="card">
            <h2>요약과 팁 (우리 말)</h2>
            {r.ai.summary ? <p style={{ margin: 0 }}>{r.ai.summary}</p> : <p className="muted" style={{ margin: 0 }}>AI 요약이 없어요 (규칙 기반).</p>}
            {r.ai.tip && <blockquote className="quote">{r.ai.tip}</blockquote>}
            <div className="row">{r.ai.keywords.map((k) => <span key={k} className="tag">{k}</span>)}</div>
            <div className="row">{r.ai.processKeywords.map((k) => <span key={k} className="tag k-check">{k}</span>)}</div>
            {r.ai.formats.length > 0 && <p className="small muted" style={{ margin: 0 }}>언급된 포맷: {r.ai.formats.join(", ")}</p>}
            {r.cross?.ok && (
              <p className="small" style={{ margin: 0 }}>
                <b>AI 교차 검수</b> ({r.cross.model}) {trends.CROSS_LABEL[r.cross.verdict]} — {trends.CODES.map((k) => `${k} ${trends.markText(r.ai.scores[k])}→${r.cross!.ok ? trends.markText((r.cross as Extract<trends.CrossCheck, { ok: true }>).scores[k]) : "-"}`).join(" · ")}
                {r.cross.diff.length > 0 && <span className="red"> · 다른 코드: {r.cross.diff.join(", ")}</span>}
              </p>
            )}
            {r.cross && !r.cross.ok && <p className="small muted" style={{ margin: 0 }}>AI 교차 검수: {r.cross.error}</p>}
            {r.sheet?.interviewSummary && !/^(언급 없음|확인 필요|-)$/.test(r.sheet.interviewSummary) && <p className="small" style={{ margin: 0 }}><b>면접 질문 요약</b> {r.sheet.interviewSummary}</p>}
            {r.sheet && <p className="small muted" style={{ margin: 0 }}>사전미션 {r.sheet.preMission ?? "-"} · 면접 {r.sheet.interview ?? "-"} · 새 계정 {r.sheet.newAccount ?? "-"}</p>}
          </div>
          <div className="card">
            <h2>활동 정보</h2>
            <div className="grid g2">
              <label>주최사<input type="text" name="org" defaultValue={c.org} /></label>
              <label>활동명·기수<input type="text" name="activity" defaultValue={c.activity} /></label>
              <label>분야<input type="text" name="field" defaultValue={c.field === "확인 필요" ? "" : c.field} placeholder="예: F&B·식품" /></label>
              <label>결과
                <select name="result" defaultValue={c.result}>
                  {["최종 합격", "서류 합격", "불합격", "확인 필요"].map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {r.human ? `${r.human.reviewer}님이 ${r.human.reviewedAt.slice(0, 10)}에 검수했어요.` : "아직 검수 전이에요."} · 분석: {rules ? "규칙 기반" : fromSheet ? "수집 시트 (시드)" : `${r.ai.model} (입력 ${r.ai.inputTokens} · 출력 ${r.ai.outputTokens} 토큰)`}
            </p>
          </div>
        </section>

        <div className="row">
          {mine ? (
            <span className="small muted">다른 팀원의 검수를 기다리고 있어요.</span>
          ) : (
            <>
              {left > 0 && <button className="btn pri" formAction={verifyAndNextAction}>검수 완료 · 다음 후기 → <span className="small">(남은 {left}건)</span></button>}
              <SubmitButton pendingText="저장하는 중…">{r.human ? "검수 점수 다시 저장" : "검수 완료로 저장"}</SubmitButton>
            </>
          )}
          <Link className="btn" href="/reviews">목록으로</Link>
        </div>
      </form>
    </>
  );
}
