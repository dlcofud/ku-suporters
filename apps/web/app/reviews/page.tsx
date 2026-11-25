import Link from "next/link";
import { trends, skeleton } from "@supportlab/core";
import { requireRole } from "@/lib/session";
import { repo } from "@/lib/repo";
import { AutoReviewRunner } from "@/components/AutoReviewRunner";
import { llmStatus } from "@/lib/llm";
import { AiCheck } from "@/components/AiCheck";
import { SharedApprovals } from "@/components/SharedApprovals";

const STATUS: Record<string, string> = { done: "검수 완료", todo: "자동 검수 대기", "needs-human": "관리자 확인 필요" };
const VIA: Record<string, string> = { "": "사람", auto: "두 AI 일치", "ai-judge": "AI 판정", bulk: "일괄" };

/** 8개 코드의 '정확히 같은 점수' 비율 평균 */
const pct = (rows: trends.AgreementRow[]) => `${Math.round((rows.reduce((s, r) => s + r.exact, 0) / Math.max(rows.length, 1)) * 100)}%`;


export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ imported?: string; alldone?: string; shareError?: string }> }) {
  const me = await requireRole("admin");
  const { imported, alldone, shareError } = await searchParams;
  const raw = await repo.listCodedReviews();
  // 검수 대기 먼저, 그다음 최근 것
  const list = [...raw].sort((a, b) => Number(a.status === "검수 완료") - Number(b.status === "검수 완료") || b.createdAt.localeCompare(a.createdAt));
  const done = list.filter((r) => r.status === "검수 완료");
  const todo = list.filter((r) => trends.autoState(r) === "todo");
  const needs = list.filter((r) => trends.autoState(r) === "needs-human");
  const next = trends.nextToVerify(needs, me.id);
  const byVia = (v: string | undefined) => done.filter((r) => (r.human?.via ?? "") === (v ?? "")).length;
  const crossAg = trends.agreementCross(list);
  const crossN = crossAg[0]?.n ?? 0;
  const ag = trends.agreementByCode(list);
  const n = ag[0]?.n ?? 0;
  const ai = llmStatus();
  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <div className="row between" style={{ alignItems: "center", gap: 8 }}>
          <span className="eyebrow">관리자 · 합격 경향에 들어갈 후기 확인</span>
          <div className="row" style={{ gap: 6, alignItems: "center", marginLeft: "auto" }}>
            <span className={ai.mode === "demo" ? "tag" : "tag k-post"} title="apps/web/.env.local 의 GEMINI_API_KEY (또는 ANTHROPIC_API_KEY · OLLAMA_URL)">{ai.label}</span>
            <AiCheck />
          </div>
        </div>
        <h1>검수</h1>
        <p className="lede" style={{ margin: 0 }}>후기 점수는 AI가 자동으로 검수해요. 관리자는 <b>AI가 처리하지 못한 후기</b>와 <b>사용자가 공유한 합격 경험 승인</b>만 보면 돼요. 새 후기는 <Link href="/upload">업로드</Link>에서 넣어요.</p>
      </header>

      {imported && <p className="note ok" role="status">시트에서 {imported}건을 가져왔어요. 지금 자동 검수하고 있어요.</p>}
      {alldone && <p className="note ok" role="status">관리자가 확인할 후기를 모두 처리했어요. 수고했어요!</p>}

      <section className="card hi verify-queue">
        <div className="row between">
          <div className="grid" style={{ gap: 2 }}>
            <h2 style={{ margin: 0 }}>자동 검수</h2>
            <span className="small muted">이 화면을 열면 아직 처리하지 않은 후기를 바로 자동 검수해요. 매일 새벽 3시에도 한 번 돌아요. 원문은 다시 읽기만 하고 저장하지 않아요.</span>
          </div>
          {next ? <Link className="btn pri" href={`/reviews/${next.id}`}>관리자 확인 시작 →</Link> : <span className="tag k-post">관리자가 볼 후기가 없어요</span>}
        </div>
        <div className="progress" aria-label={`검수 완료 ${done.length} / ${list.length}`}><i style={{ width: `${list.length ? (done.length / list.length) * 100 : 0}%` }} /></div>
        <div className="row small" style={{ gap: 14 }}>
          <span>검수 완료 <b>{done.length}</b> / {list.length}</span>
          <span className="muted">두 AI 일치로 완료 {byVia("auto")} · AI 판정으로 완료 {byVia("ai-judge")} · 사람이 저장 {byVia(undefined)}{byVia("bulk") ? ` · 예전 일괄 ${byVia("bulk")}` : ""}</span>
        </div>
        <AutoReviewRunner key={todo.map((r) => r.id).join(",")} ids={todo.map((r) => r.id)} auto label="자동 검수 시작" />
        {needs.length > 0 && (
          <div className="grid" style={{ gap: 6 }}>
            <b className="small">관리자 확인 필요 {needs.length}건 · AI가 원문을 읽지 못했거나 답하지 못한 후기예요</b>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {needs.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link href={`/reviews/${r.id}`}>{r.meta.org ?? r.meta.title ?? r.id} {r.meta.activity ?? ""}</Link> <span className="muted">· {trends.autoProblem(r)}</span>
                </li>
              ))}
              {needs.length > 8 && <li className="muted">그 밖에 {needs.length - 8}건</li>}
            </ul>
            <AutoReviewRunner key={"retry" + needs.map((r) => r.id).join(",")} ids={needs.map((r) => r.id)} label="AI로 다시 시도" />
          </div>
        )}
      </section>

      <SharedApprovals error={shareError} />

      <section className="grid g4">
        <div className="card stat"><span className="small muted">분석한 후기</span><span className="num big">{list.length}건</span></div>
        <div className="card stat"><span className="small muted">검수 완료</span><span className="num big">{done.length}건</span></div>
        <div className="card stat"><span className="small muted">관리자 확인 필요</span><span className="num big">{needs.length}건</span></div>
        {n ? (
          <div className="card stat"><span className="small muted">사람-AI 같은 점수 (사람이 고친 {n}건)</span><span className="num big">{pct(ag)}</span></div>
        ) : (
          <div className="card stat"><span className="small muted">두 AI 같은 점수 (교차 검수 {crossN}건)</span><span className="num big">{crossN ? pct(crossAg) : "-"}</span></div>
        )}
      </section>

      <section>

        <div className="card">
          <div className="row between">
            <h2>코드별 일치도</h2>
            <span className="small muted">{n ? `사람이 고친 ${n}건 · ` : ""}교차 검수 {crossN}건</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            같은 후기를 둘이 따로 채점했을 때 코드마다 얼마나 같은 점수가 나왔는지예요. κ(카파)는 우연히 맞을 확률을 뺀 값이라, 0.6 이상이면 믿을 만하고 0.4 이하면 그 코드는 기준이 흔들린다는 뜻이에요.
          </p>
          <table>
            <thead>
              <tr><th>코드</th><th style={{ textAlign: "right" }}>두 AI</th>{n > 0 && <th style={{ textAlign: "right" }}>사람-AI</th>}<th>해석</th></tr>
            </thead>
            <tbody>
              {crossAg.map((x, i) => {
                const h = ag[i]!;
                const main = n ? h : x;
                return (
                  <tr key={x.code}>
                    <td>{x.code} {skeleton.RUBRIC[x.code]}</td>
                    <td className="num" style={{ textAlign: "right" }} title={x.kappa === undefined ? undefined : `κ ${x.kappa.toFixed(2)}`}>{crossN ? `${Math.round(x.exact * 100)}%` : "-"}</td>
                    {n > 0 && <td className="num" style={{ textAlign: "right" }} title={h.kappa === undefined ? undefined : `κ ${h.kappa.toFixed(2)}`}>{Math.round(h.exact * 100)}%</td>}
                    <td className={main.kappa !== undefined && main.kappa <= 0.4 ? "red" : undefined} style={{ fontWeight: 700 }}>{main.label}{main.kappa !== undefined ? ` (κ ${main.kappa.toFixed(2)})` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted" style={{ margin: 0 }}>
            <b>두 AI</b>: 기존 점수(시트·AI 초안)와 교차 검수 AI가 같은 점수를 준 비율. 다른 코드는 AI 판정이 정해요.
            {n > 0 ? " " : " "}<b>사람-AI</b>: 관리자가 결과를 열어 직접 고쳐 저장한 후기에서, AI 점수가 사람 점수와 같았던 비율. {n ? "해석은 사람-AI 기준이에요." : "아직 사람이 고친 후기가 없어서 비어 있어요. 몇 건을 열어 확인·저장하면 AI를 얼마나 믿어도 되는지 보여요."}
            {" "}낮은 코드는 코드북 설명을 다듬을 후보예요.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h2>검수한 후기</h2>
          <div className="row">
            <a className="btn" href="/api/reviews/export?status=done" download>검수 완료만 CSV</a>
            <a className="btn" href="/api/reviews/export" download>전체 CSV</a>
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>CSV는 수집 시트(저장소 <code>data/수집시트.xlsx</code>)의 &apos;수집&apos; 탭과 열 순서가 같아요. 그대로 아래에 붙여넣으면 돼요.</p>
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>아직 없어요. <Link href="/upload">업로드</Link>에서 첫 후기를 넣어 보세요.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>상태</th><th>활동</th><th>결과</th><th style={{ textAlign: "right" }}>총점</th><th>교차 검수 · 판정</th><th></th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const c = trends.toCurated(r);
                  const st = trends.autoState(r);
                  const total = trends.CODES.reduce((s, k) => s + (c.scores[k] ?? 0), 0);
                  return (
                    <tr key={r.id}>
                      <td><span className={r.status === "검수 완료" ? "tag k-post" : st === "needs-human" ? "tag red" : "tag k-hl"}>{STATUS[st]}{r.human ? ` · ${VIA[r.human.via ?? ""]}` : ""}</span></td>
                      <td><b>{c.org}</b> {c.activity}</td>
                      <td>{c.result}</td>
                      <td className="num" style={{ textAlign: "right" }}>{total} / 16</td>
                      <td className="small">
                        {r.judge?.ok ? (
                          <span>AI 판정 · {r.judge.codes.join(" ")}</span>
                        ) : r.cross?.ok ? (
                          <span className={r.cross.verdict === "differ" ? "red" : undefined}>
                            {trends.CROSS_LABEL[r.cross.verdict]}{r.cross.diff.length ? ` · ${r.cross.diff.join(" ")}` : ""}
                          </span>
                        ) : r.cross ? (
                          <span className="muted" title={r.cross.error}>못 읽음</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td><Link href={`/reviews/${r.id}`}>{st === "needs-human" && trends.canVerify(r, me.id) ? "확인하기" : "보기"}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
