import Link from "next/link";
import { notFound } from "next/navigation";
import { trends } from "@supportlab/core";
import { requireUser } from "@/lib/session";
import { repo } from "@/lib/repo";
import { verifyReviewAction } from "@/lib/actions";
import { SubmitButton, PendingNote } from "@/components/Pending";

const SCORE_LABEL = ["0 · 없음", "1 · 언급", "2 · 구체적"];

export default async function ReviewDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dup?: string; saved?: string; aierror?: string }> }) {
  await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const r = await repo.getCodedReview(id);
  if (!r) notFound();
  const c = trends.toCurated(r);
  const cur = trends.finalScores(r);
  const rules = r.ai.model === "rules";
  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <span className="eyebrow"><Link href="/reviews">합격 후기 분석</Link> · {r.status}</span>
        <h1>{c.org !== "확인 필요" ? `${c.org} ${c.activity !== "확인 필요" ? c.activity : ""}` : r.meta.title || "활동 정보 확인 필요"}</h1>
        <p className="small muted" style={{ margin: 0 }}>출처: <a href={r.meta.url} target="_blank" rel="noreferrer">{r.meta.sourceName}{r.meta.title ? ` 「${r.meta.title}」` : ""}</a></p>
      </header>

      {q.dup && <p className="note">이미 분석한 후기라 기존 결과를 열었어요.</p>}
      {q.saved && <p className="note ok">검수 완료로 저장했어요. 경향 분석에 바로 반영돼요.</p>}
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
                        <details className="small muted"><summary>기준</summary>0 {b.s0}<br />1 {b.s1}<br />2 {b.s2}</details>
                      </td>
                      <td style={{ minWidth: 220 }}>{r.ai.evidence[code]}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.ai.scores[code]}</td>
                      <td style={{ minWidth: 140 }}>
                        <select name={code} defaultValue={String(cur[code])} aria-label={`${code} 검수 점수`} style={changed ? { borderColor: "var(--ink)", background: "var(--hlbg)" } : undefined}>
                          {SCORE_LABEL.map((l, i) => <option key={i} value={i}>{l}</option>)}
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
              {r.human ? `${r.human.reviewer}님이 ${r.human.reviewedAt.slice(0, 10)}에 검수했어요.` : "아직 검수 전이에요."} · 분석: {rules ? "규칙 기반" : `${r.ai.model} (입력 ${r.ai.inputTokens} · 출력 ${r.ai.outputTokens} 토큰)`}
            </p>
          </div>
        </section>

        <div className="row">
          <SubmitButton pendingText="저장하는 중…">{r.human ? "검수 점수 다시 저장" : "검수 완료로 저장"}</SubmitButton>
          <Link className="btn" href="/reviews">목록으로</Link>
        </div>
      </form>
    </>
  );
}
