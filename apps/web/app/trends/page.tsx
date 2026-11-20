import { trends, skeleton } from "@supportlab/core";
import Link from "next/link";
import { loadAllReviews } from "@/lib/trends";
import { currentUser, currentActivity, rolesOf } from "@/lib/session";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

const MIN = trends.MIN_SAMPLE;

/** 표본이 적은 카드 위에 붙이는 표시 */
function Thin({ n }: { n: number }) {
  return n < MIN ? <span className="tag thin-tag" title={`${MIN}건보다 적어서 한두 건에 따라 크게 바뀌어요`}>표본 적음 · {n}건</span> : null;
}

/** 가로 막대 한 줄: 이름 · 막대 · 값 */
function BarRow({ label, value, max, right, strong }: { label: string; value: number; max: number; right: string; strong?: boolean }) {
  return (
    <div className="trow">
      <span className="small" style={{ fontWeight: strong ? 800 : 500 }}>{label}</span>
      <div className="bar"><i style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>
      <span className="num small" style={{ textAlign: "right" }}>{right}</span>
    </div>
  );
}

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ field?: string; verified?: string; confirmed?: string }> }) {
  const { field, verified, confirmed } = await searchParams;
  const [all, user] = await Promise.all([loadAllReviews(), currentUser()]);
  const act = user ? await currentActivity(user.id) : undefined;
  const isTeam = user ? rolesOf(user).includes("team") : false;
  const report = trends.buildTrendReport(all, { field: field || undefined, verifiedOnly: verified === "1", confirmedOnly: confirmed === "1" });
  const insights = trends.trendInsights(report);
  const conf = report.confidence;
  const fieldCount = new Map<string, number>();
  for (const r of all) if (r.field && r.field !== "확인 필요") fieldCount.set(r.field, (fieldCount.get(r.field) ?? 0) + 1);
  const fields = [...fieldCount.keys()].sort();
  const emphasis = act ? trends.noticeEmphasis({ preferred: act.analysis.preferred ?? [], activities: act.analysis.activities ?? [] }, report) : [];
  const ranked = [...report.elementAverages].sort((a, b) => b.avg - a.avg);
  const topCodes = new Set(ranked.slice(0, 2).map((e) => e.code));
  const gapCodes = new Set(conf.level === "low" ? [] : [...report.elementAverages].sort((a, b) => a.avg - b.avg).filter((e) => e.avg < 0.5).slice(0, 2).map((e) => e.code));
  const kwMax = report.keywordFrequency[0]?.count ?? 1;
  const fieldRows = Object.entries(report.byField).sort((a, b) => b[1] - a[1]);
  const resultRows = Object.entries(report.byResult).sort((a, b) => b[1] - a[1]);
  const finalCount = report.byResult["최종 합격"] ?? 0;

  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end" }}>
        <div className="grid" style={{ gap: 4 }}>
          <span className="eyebrow">합격 후기 {report.sampleSize}건 기준{field ? ` · ${field}` : ""}</span>
          <h1>합격 경향</h1>
          <p className="lede" style={{ margin: 0 }}>{insights[0]?.title ?? "아직 후기가 없어요. 후기 분석에서 후기를 더해 주세요."}</p>
        </div>
        <form className="row filterbar" method="get" aria-label="후기 거르기">
          <label className="inline">분야
            <select name="field" defaultValue={field ?? ""}>
              <option value="">전체</option>
              {fields.map((f) => <option key={f} value={f}>{f} ({fieldCount.get(f)}건)</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" name="confirmed" value="1" defaultChecked={confirmed === "1"} />결과 확인된 합격 후기만</label>
          <label className="check"><input type="checkbox" name="verified" value="1" defaultChecked={verified === "1"} />검수 완료만</label>
          <button className="btn" type="submit">적용</button>
        </form>
      </header>

      <section className={`trust ${conf.level}`} aria-label="데이터 신뢰도">
        <span className="trust-badge">{conf.level === "high" ? "●" : conf.level === "medium" ? "◐" : "○"} 신뢰도 · {conf.label}</span>
        <span className="small">{conf.hint}</span>
        <span className="small trust-nums">
          검수 완료 <b>{report.verifiedCount}/{report.sampleSize}</b> · 결과 확인 <b>{report.confirmedResultCount}</b> · 결과 확인 필요 <b>{report.unknownResultCount}</b>
        </span>
        {isTeam ? (
          <Link className="btn small-btn" href="/reviews">검수하러 가기 →</Link>
        ) : user ? (
          <Link className="btn small-btn" href="/contribute">내 합격 경험 공유하기 →</Link>
        ) : null}
      </section>

      <section className="grid g4">
        <div className="card stat"><span className="small muted">표본</span><span className="num big">{report.sampleSize}건</span><span className="small muted">검수 완료 {report.verifiedCount}건</span></div>
        <div className="card stat"><span className="small muted">최종 합격 후기</span><span className="num big">{finalCount}건</span><span className="small muted">나머지는 서류 합격·확인 필요</span></div>
        <div className="card stat"><span className="small muted">평균 총점</span><span className="num big">{report.avgTotal} <span className="small muted">/ 16</span></span><span className="small muted">요인 8개 × 0~2점</span></div>
        <div className="card stat dark"><span className="small" style={{ color: "#DDE1EE" }}>면접까지 본 후기</span><span className="num big" style={{ color: "var(--hl)" }}>{report.interview.yes} / {report.interview.mentioned}건</span><span className="small" style={{ color: "#DDE1EE" }}>면접을 언급한 후기 중</span></div>
      </section>

      {insights.length > 0 && (
        <section className="grid insights">
          {insights.map((i, n) => (
            <div key={i.kind} className={i.kind === "caution" ? "card caution" : n === 0 || (n === 1 && insights[0]?.kind === "caution") ? "card hi" : "card"}>
              <span className={`tag ${i.kind === "caution" ? "thin-tag" : i.kind === "strong" ? "k-hl" : i.kind === "gap" ? "k-reels" : i.kind === "format" ? "k-cardnews" : "k-post"}`} style={{ alignSelf: "flex-start" }}>
                {i.kind === "caution" ? "주의" : i.kind === "strong" ? "가장 강한 요인" : i.kind === "gap" ? "차별화할 틈" : i.kind === "format" ? "포맷" : "전형"}
              </span>
              <b style={{ fontSize: 17, lineHeight: 1.4 }}>{i.title}</b>
              <p className="small" style={{ margin: 0 }}>{i.body}</p>
            </div>
          ))}
        </section>
      )}

      {act && (
        <section className="card">
          <div className="row between">
            <h2>내 공고에 적용하면 · {act.name} <Thin n={report.sampleSize} /></h2>
            <Link className="btn" href="/skeleton">지원서에 반영하기 →</Link>
          </div>
          {emphasis.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>공고의 우대사항·활동 내용에서 합격 요인과 이어지는 문장을 찾지 못했어요. 위의 '가장 강한 요인'부터 챙겨 주세요.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>공고에서</th><th>합격 요인</th><th style={{ textAlign: "right" }}>합격 후기 평균</th><th>이렇게</th></tr></thead>
                <tbody>
                  {emphasis.map((e) => (
                    <tr key={e.code}>
                      <td className="small">{e.from}</td>
                      <td><span className="tag">{e.code} {e.label}</span></td>
                      <td className="num" style={{ textAlign: "right" }}>{e.avg.toFixed(2)}</td>
                      <td className="small">{e.advice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="grid g2" style={{ alignItems: "start" }}>
        <div className={report.sampleSize < MIN ? "card thin" : "card"}>
          <h2>합격 요인 <span className="small muted" style={{ fontWeight: 500 }}>0~2점 평균 · 2점 비율 · {report.sampleSize}건</span> <Thin n={report.sampleSize} /></h2>
          {report.elementAverages.map((e) => (
            <BarRow
              key={e.code}
              label={`${e.code} ${skeleton.RUBRIC[e.code]}${topCodes.has(e.code) ? " ★" : gapCodes.has(e.code) ? " · 틈" : ""}`}
              strong={topCodes.has(e.code)}
              value={e.avg}
              max={2}
              right={`${e.avg.toFixed(2)} · ${Math.round(e.strongShare * 100)}%`}
            />
          ))}
          <p className="small muted" style={{ margin: 0 }}>★ 가장 강한 요인 · 틈: 합격 후기에도 드물어 차별화하기 좋은 요인. 2점은 후기에서 그 요인이 뚜렷하게 드러난 경우예요.</p>
        </div>
        <div className="card">
          <h2>자주 나온 합격 키워드 <span className="small muted" style={{ fontWeight: 500 }}>{report.sampleSize}건 중</span></h2>
          {report.keywordFrequency.slice(0, 10).map((k) => (
            <BarRow key={k.keyword} label={k.keyword} value={k.count} max={kwMax} right={`${k.count}건 · ${Math.round(k.share * 100)}%`} />
          ))}
          {report.keywordFrequency.length === 0 && <p className="muted" style={{ margin: 0 }}>키워드가 아직 없어요.</p>}
        </div>
      </section>

      <section className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>전형</h2>
          <div className="grid g3">
            <div className={report.preMission.mentioned < MIN ? "mini thin" : "mini"}><span className="small muted">사전미션</span><b>{report.preMission.yes} / {report.preMission.mentioned}건</b><span className="small muted">언급한 후기 중{report.preMission.mentioned < MIN ? " · 표본 적음" : ""}</span></div>
            <div className={report.interview.mentioned < MIN ? "mini thin" : "mini"}><span className="small muted">면접</span><b>{report.interview.yes} / {report.interview.mentioned}건</b><span className="small muted">언급한 후기 중{report.interview.mentioned < MIN ? " · 표본 적음" : ""}</span></div>
            <div className="mini"><span className="small muted">새 계정으로 합격</span><b>{report.newAccount.yes}건</b><span className="small muted">팔로워가 없어도 됐다는 후기</span></div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {report.processFrequency.slice(0, 10).map((p) => <span key={p.keyword} className="tag">{p.keyword} {p.count}</span>)}
          </div>
        </div>
        <div className={report.formatMentionedIn < MIN ? "card thin" : "card"}>
          <h2>후기에 나온 콘텐츠 포맷 <span className="small muted" style={{ fontWeight: 500 }}>포맷을 언급한 {report.formatMentionedIn}건 기준</span> <Thin n={report.formatMentionedIn} /></h2>
          {report.formatMentions.map((f) => (
            <BarRow key={f.format} label={f.format} value={f.count} max={report.formatMentionedIn} right={`${f.count}건 · ${pct(f.count, report.formatMentionedIn)}%`} />
          ))}
          {report.formatMentions.length === 0 && <p className="muted" style={{ margin: 0 }}>포맷을 언급한 후기가 없어요.</p>}
        </div>
      </section>

      <section className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>분야별 표본</h2>
          {fieldRows.map(([f, n]) => <BarRow key={f} label={`${f}${n < MIN ? " · 표본 적음" : ""}`} value={n} max={report.sampleSize} right={`${n}건`} />)}
          <p className="small muted" style={{ margin: 0 }}>위에서 분야를 고르면 그 분야 후기로만 다시 계산해요. {MIN}건보다 적은 분야는 참고만 해 주세요.</p>
        </div>
        <div className="card">
          <h2>결과 단계</h2>
          {resultRows.map(([r, n]) => <BarRow key={r} label={r} value={n} max={report.sampleSize} right={`${n}건`} />)}
          <p className="small muted" style={{ margin: 0 }}>'확인 필요'는 후기에서 결과를 확인하지 못한 경우예요. 위의 '결과 확인된 합격 후기만'을 켜면 빼고 계산해요.</p>
        </div>
      </section>

      {(report.tips.length > 0 || report.interviewQuestions.length > 0) && (
        <section className="grid g2" style={{ alignItems: "start" }}>
          <div className="card">
            <h2>합격자 팁 <span className="small muted" style={{ fontWeight: 500 }}>팀이 자기 말로 정리</span></h2>
            <ul className="clean tips">
              {report.tips.slice(0, 8).map((t, i) => (
                <li key={i}>
                  <span>{t.text}</span>
                  <a className="small muted" href={t.url} target="_blank" rel="noreferrer">{t.org} {t.activity}</a>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2>면접에서 나온 질문 <span className="small muted" style={{ fontWeight: 500 }}>요약</span></h2>
            {report.interviewQuestions.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>면접 질문을 정리한 후기가 아직 없어요.</p>
            ) : (
              <ul className="clean tips">
                {report.interviewQuestions.slice(0, 6).map((q, i) => (
                  <li key={i}>
                    <span>{q.text}</span>
                    <a className="small muted" href={q.url} target="_blank" rel="noreferrer">{q.org}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <div className="note small">원문은 저장하지 않고 출처·요약·점수만 써요. 팀원은 <Link href="/reviews">후기 분석</Link>에서 새 후기를 AI로 코딩하고 검수할 수 있어요.</div>
      <details className="card">
        <summary><b>출처 {report.citations.length}건 보기</b></summary>
        <ul className="clean small">{report.citations.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </details>
    </>
  );
}
