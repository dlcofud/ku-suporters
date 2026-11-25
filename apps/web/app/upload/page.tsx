import Link from "next/link";
import { trends } from "@supportlab/core";
import { requireRole } from "@/lib/session";
import { SubmitButton, PendingNote } from "@/components/Pending";
import { activeCsv, readPending, sheetMeta } from "@/lib/sheet";
import { activateSheetAction, applySheetAction, codeReviewAction, discardSheetAction, importSheetAction, uploadSheetAction } from "@/lib/actions";
import { repo } from "@/lib/repo";
import { loadCurated } from "@/lib/trends";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

const ERR: Record<string, string> = {
  url: "후기 주소(https://…)를 넣어 주세요. 출처 표기에 꼭 필요해요.",
  short: "본문이 너무 짧아요. 후기 본문을 80자 이상 붙여넣어 주세요.",
};

function List({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (!items.length) return null;
  return (
    <details className={`card ${tone ?? ""}`} open={items.length <= 8}>
      <summary><b>{title}</b> {items.length}건</summary>
      <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{items.slice(0, 200).map((x, i) => <li key={i}>{x}</li>)}</ul>
    </details>
  );
}

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ preview?: string; name?: string; error?: string; reviewError?: string; applied?: string; restored?: string; needConfirm?: string }> }) {
  const me = await requireRole("admin");
  const q = await searchParams;
  const [meta, active, pendingCsv, coded, sheetRows] = await Promise.all([sheetMeta(), activeCsv(), readPending(me.id), repo.listCodedReviews(), loadCurated().catch(() => [])]);
  const urls = new Set(coded.map((r) => r.meta.url));
  const notImported = sheetRows.filter((r) => r.url && !urls.has(r.url)).length;
  const current = trends.csvToTable(active.csv);
  const check = q.preview && pendingCsv ? trends.checkSheet(trends.csvToTable(pendingCsv)) : undefined;
  const diff = check && !check.errors.length ? trends.diffSheets(current, check) : undefined;
  const before = diff ? diff.removed.length + diff.changed.length + diff.unchanged : 0;
  const bigRemoval = !!diff && before > 0 && diff.removed.length / before > trends.BIG_REMOVAL;

  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <span className="eyebrow">관리자 · 합격 경향에 들어갈 후기 넣기</span>
        <h1>업로드</h1>
        <p className="lede" style={{ margin: 0 }}>후기를 하나씩 붙여넣거나, 엑셀 시트로 한꺼번에 올려요. 올린 후기는 AI가 점수를 매기고 자동 검수해요. 결과는 <Link href="/reviews">검수</Link>에서 봐요.</p>
      </header>

        <form action={codeReviewAction} className="card hi">
          <h2>후기 하나 붙여넣기</h2>
          {q.reviewError && ERR[q.reviewError] && <p className="note warn" style={{ margin: 0 }}>{ERR[q.reviewError]}</p>}
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

      <h2 style={{ margin: "8px 0 0" }}>엑셀 시트로 한꺼번에</h2>
      <p className="small muted" style={{ margin: 0 }}>GitHub 없이 엑셀로 후기를 고쳐 올려요. 올린 시트는 버전으로 쌓이고, 언제든 예전 버전으로 되돌릴 수 있어요.</p>
      {notImported > 0 && (
        <form action={importSheetAction} className="note row between" style={{ gap: 8 }}>
          <span className="small">지금 시트에는 있는데 아직 검수에 안 들어간 후기 <b>{notImported}건</b></span>
          <SubmitButton pendingText="가져오는 중…">가져와서 자동 검수</SubmitButton>
        </form>
      )}
      {q.error && <p className="note warn" role="alert">{q.error}</p>}
      {q.applied && <p className="note ok" role="status">새 시트를 적용했어요. 합격 경향에 바로 반영돼요.</p>}
      {q.restored && <p className="note ok" role="status">되돌렸어요.</p>}

      <section className="card">
        <div className="row between">
          <div className="grid" style={{ gap: 2 }}>
            <h2 style={{ margin: 0 }}>지금 쓰는 시트</h2>
            <span className="small muted">
              {active.source === "upload" && active.version
                ? `${when(active.version.at)} ${active.version.by}님이 올린 버전 · ${current.rows.length}행 · ${active.version.note}`
                : `저장소 기본 (data/curated.csv) · ${current.rows.length}행`}
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn pri" href="/api/sheet/download">엑셀 받기 (.xlsx)</a>
            <a className="btn" href="/api/sheet/download?format=csv">CSV</a>
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>받은 엑셀에는 지금 시트와 함께, 앱에서 검수한 점수와 앱에서만 코딩한 후기(승인된 사용자 후기 포함)가 모두 들어 있어요. 이 파일을 고쳐서 아래에 올리면 돼요.</p>
      </section>

      <form action={uploadSheetAction} className="card">
        <h2 style={{ margin: 0 }}>고친 시트 올리기</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>위에서 엑셀을 받아 <b>'수집' 탭의 노란 칸</b>만 고쳐요. 새 후기는 맨 아래에 이어서 써요.</li>
          <li>그대로 저장한 <b>.xlsx</b>를 올려요 (CSV UTF-8도 돼요).</li>
          <li>바로 바뀌지 않아요. 추가·변경·삭제를 먼저 보여 주고, <b>적용</b>을 눌러야 바뀌어요.</li>
        </ol>
        <div className="row">
          <input type="file" name="sheet" accept=".xlsx,.csv" required />
          <SubmitButton pendingText="읽는 중…">올리고 미리보기</SubmitButton>
        </div>
      </form>

      {q.preview && check && (
        <section className="card hi">
          <h2 style={{ margin: 0 }}>미리보기 {q.name ? <span className="small muted">· {q.name}</span> : null}</h2>
          {check.errors.length > 0 ? (
            <>
              <p className="note warn" style={{ margin: 0 }}>고칠 곳이 {check.errors.length}개 있어서 적용할 수 없어요. 엑셀에서 고친 뒤 다시 올려 주세요.</p>
              <List title="오류" items={check.errors} tone="caution" />
            </>
          ) : diff ? (
            <>
              <div className="row small" style={{ gap: 14 }}>
                <span>전체 <b>{check.rows.length}</b>행</span>
                <span>추가 <b>{diff.added.length}</b></span>
                <span>변경 <b>{diff.changed.length}</b></span>
                <span style={{ color: diff.removed.length ? "var(--red)" : undefined }}>삭제 <b>{diff.removed.length}</b></span>
                <span className="muted">그대로 {diff.unchanged}</span>
              </div>
              <List title="추가" items={diff.added} />
              <List title="변경" items={diff.changed.map((c) => `${c.id} — ${c.columns.join(", ")}`)} />
              <List title="삭제 (올린 파일에 없는 행)" items={diff.removed} tone="caution" />
              <List title="확인해 볼 것" items={check.warnings} />
              {!diff.added.length && !diff.changed.length && !diff.removed.length ? (
                <p className="small muted" style={{ margin: 0 }}>지금 시트와 달라진 곳이 없어요.</p>
              ) : (
                <form action={applySheetAction} className="grid" style={{ gap: 8 }}>
                  <label>메모 <span className="small muted">(선택 · 버전 목록에 보여요)</span><input type="text" name="note" maxLength={100} placeholder="예: 금융 분야 후기 5건 추가" /></label>
                  {bigRemoval && (
                    <label className="check" style={{ color: "var(--red)" }}>
                      <input type="checkbox" name="confirmRemoval" required={!!q.needConfirm || bigRemoval} />
                      {diff.removed.length}행이 빠져요. 일부만 들어 있는 파일을 올린 건 아닌지 확인했어요.
                    </label>
                  )}
                  <div className="row">
                    <SubmitButton pendingText="적용하는 중…">적용하기</SubmitButton>
                  </div>
                </form>
              )}
            </>
          ) : null}
          <form action={discardSheetAction}><button className="btn" type="submit">취소</button></form>
        </section>
      )}

      <section className="card">
        <h2 style={{ margin: 0 }}>버전</h2>
        <table className="table small">
          <thead><tr><th>올린 때</th><th>올린 사람</th><th className="num">행</th><th>메모</th><th></th></tr></thead>
          <tbody>
            {meta.history.map((v) => (
              <tr key={v.key}>
                <td>{when(v.at)}</td>
                <td>{v.by}</td>
                <td className="num">{v.rows}</td>
                <td>{v.note}</td>
                <td className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  <a href={`/api/sheet/download?version=${encodeURIComponent(v.key)}`}>받기</a>
                  {meta.active === v.key ? (
                    <span className="tag">사용 중</span>
                  ) : (
                    <form action={activateSheetAction}><input type="hidden" name="key" value={v.key} /><button className="btn small-btn" type="submit">이걸로 되돌리기</button></form>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>저장소 기본</td>
              <td>GitHub의 data/curated.csv</td>
              <td className="row" style={{ justifyContent: "flex-end" }}>
                {meta.active ? (
                  <form action={activateSheetAction}><input type="hidden" name="key" value="repo" /><button className="btn small-btn" type="submit">이걸로 되돌리기</button></form>
                ) : (
                  <span className="tag">사용 중</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="small muted" style={{ margin: 0 }}>올린 시트는 GitHub의 data/curated.csv를 바꾸지 않아요. 저장소에도 남기고 싶으면 'CSV'로 받아 data 폴더에 올려 주세요.</p>
      </section>
      <p className="small"><Link href="/reviews">← 검수로</Link></p>
    </>
  );
}
