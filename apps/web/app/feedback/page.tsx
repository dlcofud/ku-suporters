import Link from "next/link";
import { requireUser, currentActivity } from "@/lib/session";
import { todayISO } from "@/lib/repo";
import { feedback, shared } from "@supportlab/core";
import { myMedia } from "@/lib/media";
import { fmtLabel } from "@/lib/format";
import { SuggestionCard } from "@/components/SuggestionCard";
import { CopyButton } from "@/components/CopyButton";
import { addMediaAction, removeMediaAction } from "@/lib/actions";
import { SubmitButton } from "@/components/Pending";

const SUG_TAG: Record<feedback.Suggestion["kind"], [string, string]> = {
  switch_format: ["일정 조정 제안", "k-reels"],
  keep_format: ["포맷 인사이트", "k-cardnews"],
  post_more: ["업로드 제안", "k-post"],
  add_hook: ["콘텐츠 팁", "k-check"],
};
const dot = (iso: string) => `${Number(iso.slice(5, 7))}.${iso.slice(8, 10)}`;
const n = (v: number) => Math.round(v).toLocaleString("ko-KR");

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string }> }) {
  const { error, added } = await searchParams;
  const user = await requireUser();
  const act = await currentActivity(user.id);
  if (!act?.plan) return <div className="card"><h1>먼저 업로드 일정을 만들어 주세요</h1><Link className="btn pri" href="/">콘텐츠 캘린더</Link></div>;
  const today = todayISO();
  const { media, source, igError } = await myMedia(user);
  const manual = source === "manual";
  const s = feedback.summarize(media);
  const sug = feedback.suggest(s, act.plan);
  const start = media.map((m) => m.date).sort()[0] ?? today;
  const sentence = feedback.achievementSentence(s, start, today);
  const maxViews = Math.max(1, ...s.byFormat.map((f) => f.avgViews));
  const rows = [...media].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end" }}>
        <div>
          <span className="eyebrow">{act.name} · 성과 피드백 · {Number(today.slice(5, 7))}월 {Number(today.slice(8, 10))}일 기준</span>
          <h1>{s.topByViews ? `${fmtLabel(s.topByViews.format)} 반응이 가장 좋아요` : "아직 성과가 없어요"}</h1>
        </div>
        {manual ? <span className="tag pill" title="인스타를 연결하면 자동으로 가져와요">직접 입력</span> : <span className="tag pill k-post">인스타 연결됨</span>}
      </header>
      {igError && <div className="note warn">인스타에서 지표를 가져오지 못해 직접 입력한 숫자를 보여 줘요. 계정 연결을 다시 확인해 주세요.</div>}
      {added && <div className="note ok" role="status">게시물 성과를 더했어요.</div>}
      {media.length === 0 && (
        <div className="card hi">
          <h2>올린 게시물의 숫자를 알려 주세요</h2>
          <p style={{ margin: 0 }}>성과 피드백은 실제 숫자로만 만들어요. 두 가지 방법이 있어요.</p>
          <ul className="clean">
            <li><b>인스타 연결</b> · 조회수·좋아요·저장 수를 자동으로 가져와요 (<Link href="/account">계정 연결하기</Link>)</li>
            <li><b>직접 입력</b> · 인스타 앱의 '인사이트 보기'에 나오는 숫자를 아래에 적어 주세요</li>
          </ul>
        </div>
      )}

      <section className="grid g4">
        <div className="card stat"><span className="small muted">올린 콘텐츠</span><span className="num big">{s.count}개</span></div>
        <div className="card stat"><span className="small muted">평균 조회수</span><span className="num big">{n(s.avgViews)}</span></div>
        <div className="card stat"><span className="small muted">총 저장 수</span><span className="num big">{n(s.totalSaves)}</span></div>
        <div className="card stat dark"><span className="small" style={{ color: "#DDE1EE" }}>가장 잘 된 포맷</span><span className="num big" style={{ color: "var(--hl)" }}>{s.topByViews ? fmtLabel(s.topByViews.format) : "-"}</span></div>
      </section>

      <section className="fbwrap">
        <div className="grid" style={{ gap: 20, alignContent: "start" }}>
          <div className="card">
            <div className="row between">
              <h2 style={{ fontSize: 17 }}>포맷별 평균 조회수</h2>
              {s.topBySaves && s.topBySaves.format !== s.topByViews?.format && <span className="small muted">저장 수는 {fmtLabel(s.topBySaves.format)}가 가장 높아요</span>}
            </div>
            <div className="grid" style={{ gap: 14 }}>
              {s.byFormat.map((f) => (
                <div key={f.format} className="fbar">
                  <span>{fmtLabel(f.format)}</span>
                  <div className="bar" role="img" aria-label={`${fmtLabel(f.format)} 평균 조회수 ${n(f.avgViews)}`}>
                    <i className={f.format === s.topByViews?.format ? "top" : undefined} style={{ width: `${(f.avgViews / maxViews) * 100}%` }} />
                  </div>
                  <span className="num" style={{ textAlign: "right" }}>{n(f.avgViews)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="row between">
              <h2 style={{ fontSize: 17 }}>올린 콘텐츠</h2>
              <span className="small muted">썸네일은 저장하지 않고 원본 링크로 연결해요</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>날짜</th><th>포맷</th><th>제목</th><th style={{ textAlign: "right" }}>조회수</th><th style={{ textAlign: "right" }}>좋아요</th><th style={{ textAlign: "right" }}>저장</th><th>원본</th>{manual && <th></th>}</tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="num" style={{ fontWeight: 500 }}>{dot(m.date)}</td>
                      <td><span className={`tag k-${m.format}`}>{fmtLabel(m.format)}</span></td>
                      <td><b style={{ fontWeight: 600 }}>{m.title ?? "제목 없음"}</b>{shared.diffDays(m.date, today) >= 0 && shared.diffDays(m.date, today) < 2 && <span className="small muted"> · 집계 중</span>}</td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 500 }}>{n(m.views)}</td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 500 }}>{n(m.likes)}</td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 500 }}>{n(m.saves)}</td>
                      <td>{m.permalink ? <a href={m.permalink} target="_blank" rel="noreferrer">보기</a> : <span className="muted">-</span>}</td>
                      {manual && (
                        <td>
                          <form action={removeMediaAction}>
                            <input type="hidden" name="id" value={m.id} />
                            <button type="submit" className="link-btn small" aria-label={`${m.title ?? "게시물"} 지우기`}>지우기</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: 16, alignContent: "start" }}>
          <h2 style={{ fontSize: 17 }}>다음 행동</h2>
          {sug.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>지금 일정대로 가도 좋아요. 콘텐츠가 더 쌓이면 제안이 나와요.</p></div>}
          {sug.map((x, i) => {
            const [tag, cls] = SUG_TAG[x.kind];
            return <SuggestionCard key={i} tag={tag} tagClass={cls} title={x.title} detail={x.detail} highlight={x.kind === "switch_format"} itemId={x.planItemId} toFormat={x.toFormat} />;
          })}
          {sentence && (
            <div className="card">
              <span className="small muted" style={{ fontWeight: 600 }}>지원서용 성과 문장</span>
              <blockquote className="quote">“{sentence}”</blockquote>
              <span className="small muted">실제 숫자만 써요. 기간·숫자를 바꾸지 말고 그대로 쓰세요.</span>
              <div className="row">
                <Link className="btn pri" href={`/skeleton?achievement=${encodeURIComponent(sentence)}`}>지원서 코치에게 보내기</Link>
                <CopyButton text={sentence} />
              </div>
            </div>
          )}
          {manual && (
            <form id="add" action={addMediaAction} className="card">
              <h2 style={{ fontSize: 17 }}>게시물 성과 직접 넣기</h2>
              <p className="small muted" style={{ margin: 0 }}>인스타 앱에서 게시물 → '인사이트 보기'의 숫자를 적어 주세요. 인스타를 연결하면 자동으로 가져와요.</p>
              {error && <p className="note warn small" role="alert" style={{ margin: 0 }}>{error}</p>}
              <div className="grid g2">
                <label>올린 날짜<input type="date" name="date" required max={today} defaultValue={today} /></label>
                <label>포맷
                  <select name="format" required defaultValue="reels">
                    <option value="reels">릴스</option><option value="cardnews">카드뉴스</option><option value="post">게시물</option>
                  </select>
                </label>
              </div>
              <label>제목 (내가 알아볼 이름)<input type="text" name="title" maxLength={80} placeholder="예: 신제품 언박싱 릴스" /></label>
              <div className="grid g2">
                <label>조회수<input type="number" name="views" min={0} required inputMode="numeric" /></label>
                <label>좋아요<input type="number" name="likes" min={0} required inputMode="numeric" /></label>
                <label>댓글<input type="number" name="comments" min={0} defaultValue={0} inputMode="numeric" /></label>
                <label>저장<input type="number" name="saves" min={0} defaultValue={0} inputMode="numeric" /></label>
              </div>
              <label>원본 링크 (선택)<input type="url" name="permalink" placeholder="https://www.instagram.com/reel/…" /></label>
              <SubmitButton className="btn" pendingText="더하는 중…">성과 더하기</SubmitButton>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
