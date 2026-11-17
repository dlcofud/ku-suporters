import Link from "next/link";
import { requireUser, currentActivity } from "@/lib/session";
import { todayISO } from "@/lib/repo";
import { feedback, shared } from "@supportlab/core";
import { myMedia } from "@/lib/media";
import { fmtLabel } from "@/lib/format";
import { SuggestionCard } from "@/components/SuggestionCard";
import { CopyButton } from "@/components/CopyButton";

const SUG_TAG: Record<feedback.Suggestion["kind"], [string, string]> = {
  switch_format: ["일정 조정 제안", "k-reels"],
  keep_format: ["포맷 인사이트", "k-cardnews"],
  post_more: ["업로드 제안", "k-post"],
  add_hook: ["콘텐츠 팁", "k-check"],
};
const dot = (iso: string) => `${Number(iso.slice(5, 7))}.${iso.slice(8, 10)}`;
const n = (v: number) => Math.round(v).toLocaleString("ko-KR");

export default async function FeedbackPage() {
  const user = await requireUser();
  const act = await currentActivity(user.id);
  if (!act?.plan) return <div className="card"><h1>먼저 업로드 일정을 만들어 주세요</h1><Link className="btn pri" href="/">콘텐츠 캘린더</Link></div>;
  const today = todayISO();
  const { media, demo } = await myMedia(user);
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
          <h1>{s.topByViews ? `${fmtLabel(s.topByViews.format)} 반응이 가장 좋아요` : "아직 올린 콘텐츠가 없어요"}</h1>
        </div>
        {demo ? <span className="tag pill" title="인스타 계정을 연결하면 실제 지표로 바뀌어요">예시 데이터</span> : <span className="tag pill k-post">인스타 연결됨</span>}
      </header>

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
                <thead><tr><th>날짜</th><th>포맷</th><th>제목</th><th style={{ textAlign: "right" }}>조회수</th><th style={{ textAlign: "right" }}>좋아요</th><th style={{ textAlign: "right" }}>저장</th><th>원본</th></tr></thead>
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
          {demo && <div className="note small">인스타 계정을 연결하면 실제 조회수·저장 수로 바뀌어요. <Link href="/account">계정 연결하기</Link></div>}
        </div>
      </section>
    </>
  );
}
