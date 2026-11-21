import Link from "next/link";
import { trends, skeleton } from "@supportlab/core";
import { requireRole } from "@/lib/session";
import { repo } from "@/lib/repo";
import { bulkVerifyAction, codeReviewAction, importSheetAction } from "@/lib/actions";
import { CrossCheckRunner } from "@/components/CrossCheckRunner";
import { loadCurated } from "@/lib/trends";
import { llmStatus } from "@/lib/llm";
import { AiCheck } from "@/components/AiCheck";
import { SubmitButton, PendingNote } from "@/components/Pending";

const ERR: Record<string, string> = {
  url: "후기 주소(https://…)를 넣어 주세요. 출처 표기에 꼭 필요해요.",
  short: "본문이 너무 짧아요. 후기 본문을 80자 이상 붙여넣어 주세요.",
};

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ error?: string; imported?: string; alldone?: string; bulk?: string; skipped?: string }> }) {
  const me = await requireRole("admin");
  const { error, imported, alldone, bulk, skipped } = await searchParams;
  const [raw, sheet] = await Promise.all([repo.listCodedReviews(), loadCurated().catch(() => [])]);
  // 검수 대기 먼저, 그다음 최근 것
  const list = [...raw].sort((a, b) => Number(a.status === "검수 완료") - Number(b.status === "검수 완료") || b.createdAt.localeCompare(a.createdAt));
  const done = list.filter((r) => r.status === "검수 완료");
  const urls = new Set(list.map((r) => r.meta.url));
  const notImported = sheet.filter((r) => r.url && !urls.has(r.url)).length;
  const next = trends.nextToVerify(list, me.id);
  const pending = list.filter((r) => r.status !== "검수 완료");
  const crossTodo = pending.filter((r) => !r.cross?.ok).map((r) => r.id);
  const crossed = pending.filter((r) => r.cross?.ok);
  const easy = crossed.filter((r) => r.cross?.ok && r.cross.verdict !== "differ" && trends.canVerify(r, me.id));
  const crossAg = trends.agreementCross(list);
  const mineWaiting = list.filter((r) => r.status !== "검수 완료" && !trends.canVerify(r, me.id)).length;
  const ag = trends.agreementByCode(list);
  const n = ag[0]?.n ?? 0;
  const ai = llmStatus();
  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end" }}>
        <div className="grid" style={{ gap: 4 }}>
          <span className="eyebrow">팀 도구 · 경향 분석에 들어갈 데이터 만들기</span>
          <h1>합격 후기 분석</h1>
          <p className="lede" style={{ margin: 0 }}>후기를 붙여넣으면 AI가 코드북(E1~E8)으로 먼저 점수를 매기고, 사람이 검수해요.</p>
        </div>
        <div className="grid" style={{ gap: 8, justifyItems: "end" }}>
          <span className={ai.mode === "demo" ? "tag pill" : "tag pill k-post"} title="apps/web/.env.local 의 GEMINI_API_KEY (또는 ANTHROPIC_API_KEY · OLLAMA_URL)">{ai.label}</span>
          <AiCheck />
        </div>
      </header>

      {imported && <p className="note ok" role="status">시트에서 {imported}건을 검수 대기로 가져왔어요.</p>}
      {alldone && <p className="note ok" role="status">지금 검수할 수 있는 후기를 모두 검수했어요. 수고했어요!</p>}
      {bulk && <p className="note ok" role="status">{bulk}건을 검수 완료로 바꿨어요.{skipped ? ` 직접 코딩한 ${skipped}건은 다른 관리자가 검수해야 해서 건너뛰었어요.` : ""}</p>}

      <section className="card hi verify-queue">
        <div className="row between">
          <div className="grid" style={{ gap: 2 }}>
            <h2 style={{ margin: 0 }}>검수 대기열</h2>
            <span className="small muted">원문을 열어 AI(또는 시트) 점수를 대조하고, 저장하면 다음 후기로 넘어가요. 내가 코딩한 후기는 다른 팀원이 검수해요.</span>
          </div>
          {next ? <Link className="btn pri" href={`/reviews/${next.id}`}>다음 검수 시작 →</Link> : <span className="tag">검수할 후기가 없어요</span>}
        </div>
        <div className="progress" aria-label={`검수 완료 ${done.length} / ${list.length}`}><i style={{ width: `${list.length ? (done.length / list.length) * 100 : 0}%` }} /></div>
        <div className="grid" style={{ gap: 4 }}>
          <b className="small">1. AI 교차 검수</b>
          <span className="small muted">AI가 원문을 다시 읽고 점수를 새로 매겨 지금 점수와 비교해요. 일치한 후기는 아래 목록에서 한꺼번에 검수 완료할 수 있고, 불일치한 후기만 하나씩 열어 보면 돼요. 원문은 저장하지 않아요.</span>
          <CrossCheckRunner ids={crossTodo} label="AI 교차 검수 시작" />
          {crossed.length > 0 && (
            <span className="small">
              교차 검수한 대기 후기 {crossed.length}건 · 일치 {crossed.filter((r) => r.cross?.ok && r.cross.verdict === "match").length} · 거의 일치 {crossed.filter((r) => r.cross?.ok && r.cross.verdict === "near").length} · 불일치 {crossed.filter((r) => r.cross?.ok && r.cross.verdict === "differ").length}
            </span>
          )}
          <b className="small" style={{ marginTop: 6 }}>2. 일치한 후기는 아래 목록에서 골라 한꺼번에 검수 완료 · 3. 불일치한 후기는 '다음 검수 시작'으로 하나씩</b>
        </div>
        <div className="row small" style={{ gap: 14 }}>
          <span>검수 완료 <b>{done.length}</b> / {list.length}</span>
          {mineWaiting > 0 && <span className="muted">내가 코딩해서 다른 팀원을 기다리는 후기 {mineWaiting}건</span>}
          {notImported > 0 && (
            <form action={importSheetAction} className="row" style={{ gap: 8 }}>
              <span>수집 시트에만 있는 후기 <b>{notImported}건</b></span>
              <SubmitButton pendingText="가져오는 중…">검수 대기로 가져오기</SubmitButton>
            </form>
          )}
        </div>
      </section>

      <section className="grid g4">
        <div className="card stat"><span className="small muted">분석한 후기</span><span className="num big">{list.length}건</span></div>
        <div className="card stat"><span className="small muted">검수 완료</span><span className="num big">{done.length}건</span></div>
        <div className="card stat"><span className="small muted">검수 대기</span><span className="num big">{list.length - done.length}건</span></div>
        <div className="card stat"><span className="small muted">사람-AI 일치 (정확히 같은 점수)</span><span className="num big">{n ? `${Math.round((ag.reduce((s, r) => s + r.exact, 0) / ag.length) * 100)}%` : "-"}</span></div>
      </section>

      <section className="grid g2" style={{ alignItems: "start" }}>
        <form action={codeReviewAction} className="card hi">
          <h2>새 후기 분석하기</h2>
          {error && ERR[error] && <p className="note warn" style={{ margin: 0 }}>{ERR[error]}</p>}
          <label>후기 주소 (출처)<input type="url" name="url" required placeholder="https://community.linkareer.com/…" /></label>
          <div className="grid g2">
            <label>사이트 이름<input type="text" name="sourceName" placeholder="비우면 주소로 채워요" /></label>
            <label>게시물 제목<input type="text" name="title" /></label>
            <label>주최사<input type="text" name="org" placeholder="비우면 AI가 본문에서 찾아요" /></label>
            <label>활동명·기수<input type="text" name="activity" /></label>
            <label>분야<input type="text" name="field" placeholder="예: F&B·식품" list="fields" /></label>
            <label>결과
              <select name="result" defaultValue="">
                <option value="">AI가 본문에서 찾기</option>
                <option>최종 합격</option><option>서류 합격</option><option>불합격</option>
              </select>
            </label>
          </div>
          <datalist id="fields">{["F&B·식품", "뷰티·패션", "금융", "IT·전자", "공공·기관", "유통·커머스", "여행·문화"].map((f) => <option key={f} value={f} />)}</datalist>
          <label>후기 본문
            <textarea name="text" required style={{ minHeight: 220 }} placeholder="후기 페이지를 열어 본문을 복사해 붙여넣어 주세요. 분석에만 쓰고 저장하지 않아요." />
          </label>
          <SubmitButton pendingText="AI가 분석하는 중…">AI로 코딩하기</SubmitButton>
          <PendingNote steps={["후기를 읽고 있어요", "코드북 E1~E8 기준으로 점수를 매기고 있어요", "근거와 요약을 우리 말로 쓰고 있어요"]} hint="Claude는 10초 안팎, 로컬 모델(Ollama)은 30초~2분 걸릴 수 있어요." />
          <p className="small muted" style={{ margin: 0 }}>본문은 저장하지 않아요. 남는 것은 출처·우리 말 요약·점수·키워드예요. 자동 크롤링 대신 직접 열어 본 후기만 넣어 주세요.</p>
        </form>

        <div className="card">
          <div className="row between">
            <h2>코드별 사람-AI 일치도</h2>
            <span className="small muted">검수 완료 {n}건 기준</span>
          </div>
          <table>
            <thead><tr><th>코드</th><th style={{ textAlign: "right" }}>같은 점수</th><th style={{ textAlign: "right" }}>Cohen&apos;s κ</th><th>해석</th></tr></thead>
            <tbody>
              {ag.map((r) => (
                <tr key={r.code}>
                  <td>{r.code} {skeleton.RUBRIC[r.code]}</td>
                  <td className="num" style={{ textAlign: "right" }}>{n ? `${Math.round(r.exact * 100)}%` : "-"}</td>
                  <td className="num" style={{ textAlign: "right" }}>{r.kappa === undefined ? "-" : r.kappa.toFixed(2)}</td>
                  <td className={r.kappa !== undefined && r.kappa <= 0.4 ? "red" : undefined} style={{ fontWeight: 700 }}>{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ margin: 0 }}>κ가 0.4 이하인 코드는 AI와 사람이 기준을 다르게 읽고 있다는 뜻이에요. 코드북 설명을 고치거나 그 코드는 사람이 직접 매겨 주세요. 규칙 기반 초안과 한꺼번에 검수한 후기는 계산에서 빼요.</p>
          {crossAg[0]!.n > 0 && (
            <>
              <div className="row between" style={{ marginTop: 8 }}>
                <h3 style={{ margin: 0 }}>기존 점수 ↔ AI 교차 검수</h3>
                <span className="small muted">{crossAg[0]!.n}건 기준</span>
              </div>
              <table>
                <tbody>
                  {crossAg.map((r) => (
                    <tr key={r.code}>
                      <td>{r.code} {skeleton.RUBRIC[r.code]}</td>
                      <td className="num" style={{ textAlign: "right" }}>{Math.round(r.exact * 100)}%</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.kappa === undefined ? "-" : r.kappa.toFixed(2)}</td>
                      <td className={r.kappa !== undefined && r.kappa <= 0.4 ? "red" : undefined} style={{ fontWeight: 700 }}>{r.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted" style={{ margin: 0 }}>두 AI(시트 시드와 교차 검수)가 같은 코드를 얼마나 같게 읽는지예요. 낮은 코드는 사람이 꼭 확인해 주세요.</p>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h2>분석한 후기</h2>
          <div className="row">
            <a className="btn" href="/api/reviews/export?status=done" download>검수 완료만 CSV</a>
            <a className="btn" href="/api/reviews/export" download>전체 CSV</a>
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>CSV는 수집 시트(저장소 <code>data/수집시트.xlsx</code>)의 &apos;수집&apos; 탭과 열 순서가 같아요. 그대로 아래에 붙여넣으면 돼요.</p>
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>아직 없어요. 왼쪽에서 첫 후기를 분석해 보세요.</p>
        ) : (
          <form action={bulkVerifyAction} className="grid" style={{ gap: 8 }}>
          {easy.length > 0 && (
            <div className="row" style={{ gap: 10 }}>
              <SubmitButton pendingText="저장하는 중…">고른 후기 검수 완료</SubmitButton>
              <span className="small muted">AI 교차 검수에서 일치·거의 일치한 {easy.length}건을 미리 골라 뒀어요. 원문을 훑어보고 이상한 건 체크를 풀어 주세요.</span>
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th></th><th>상태</th><th>활동</th><th>결과</th><th style={{ textAlign: "right" }}>총점</th><th>AI 교차 검수</th><th></th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const c = trends.toCurated(r);
                  const total = trends.CODES.reduce((s, k) => s + (c.scores[k] ?? 0), 0);
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.status !== "검수 완료" && trends.canVerify(r, me.id) && (
                          <input type="checkbox" name="ids" value={r.id} aria-label={`${c.org} ${c.activity} 고르기`} defaultChecked={easy.includes(r)} />
                        )}
                      </td>
                      <td><span className={r.status === "검수 완료" ? "tag k-post" : "tag k-hl"}>{r.status}{r.human?.via === "bulk" ? " (일괄)" : ""}</span></td>
                      <td><b>{c.org}</b> {c.activity}</td>
                      <td>{c.result}</td>
                      <td className="num" style={{ textAlign: "right" }}>{total} / 16</td>
                      <td className="small">
                        {r.cross?.ok ? (
                          <span className={r.cross.verdict === "differ" ? "red" : undefined}>
                            {trends.CROSS_LABEL[r.cross.verdict]}{r.cross.diff.length ? ` · ${r.cross.diff.join(" ")}` : ""}
                          </span>
                        ) : r.cross ? (
                          <span className="muted" title={r.cross.error}>못 읽음</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td><Link href={`/reviews/${r.id}`}>{r.status === "검수 완료" ? "보기" : trends.canVerify(r, me.id) ? "검수하기" : "보기 (다른 팀원 검수)"}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </form>
        )}
      </section>
    </>
  );
}
