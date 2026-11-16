import { trends, skeleton } from "@supportlab/core";
import { loadCurated } from "@/lib/trends";

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ field?: string; verified?: string }> }) {
  const { field, verified } = await searchParams;
  const all = await loadCurated();
  const report = trends.buildTrendReport(all, { field: field || undefined, verifiedOnly: verified === "1" });
  const fields = [...new Set(all.map((r) => r.field).filter(Boolean))];
  return (
    <>
      <header>
        <span className="eyebrow">팀이 직접 읽고 정리한 합격 후기 기준</span>
        <h1>합격 경향</h1>
      </header>
      <form className="card row" method="get">
        <label style={{ flex: 1 }}>분야
          <select name="field" defaultValue={field ?? ""}>
            <option value="">전체</option>
            {fields.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="check" style={{ alignSelf: "flex-end" }}><input type="checkbox" name="verified" value="1" defaultChecked={verified === "1"} />검수 완료만</label>
        <button className="btn" type="submit" style={{ alignSelf: "flex-end" }}>적용</button>
      </form>
      <div className="note">표본 {report.sampleSize}건 · 검수 완료 {report.verifiedCount}건. 원문은 저장하지 않고 출처·요약·점수만 씁니다.</div>
      <section className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>합격 요인 (0~2점 평균)</h2>
          {report.elementAverages.map((e) => (
            <div key={e.code} className="grid" style={{ gridTemplateColumns: "150px minmax(0,1fr) 60px", alignItems: "center" }}>
              <span className="small">{e.code} {skeleton.RUBRIC[e.code]}</span>
              <div className="bar"><i style={{ width: `${(e.avg / 2) * 100}%` }} /></div>
              <span className="num small" style={{ textAlign: "right" }}>{e.avg.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>자주 나온 키워드</h2>
          <table>
            <thead><tr><th>키워드</th><th>건수</th><th>비율</th></tr></thead>
            <tbody>
              {report.keywordFrequency.slice(0, 12).map((k) => (
                <tr key={k.keyword}><td>{k.keyword}</td><td className="num">{k.count}</td><td>{Math.round(k.share * 100)}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="card">
        <summary><b>출처 {report.citations.length}건 보기</b></summary>
        <ul className="clean small">{report.citations.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </details>
    </>
  );
}
