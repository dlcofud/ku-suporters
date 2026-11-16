import Link from "next/link";
import { requireUser } from "@/lib/session";
import { repo, todayISO } from "@/lib/repo";
import { applySuggestionAction } from "@/lib/actions";
import { feedback } from "@supportlab/core";
import { myMedia } from "@/lib/media";
import { fmtLabel, md } from "@/lib/format";

export default async function FeedbackPage() {
  const user = await requireUser();
  const act = await repo.latestActivity(user.id);
  if (!act?.plan) return <div className="card"><h1>먼저 업로드 일정을 만들어 주세요</h1><Link className="btn pri" href="/calendar">콘텐츠 캘린더</Link></div>;
  const { media, demo } = await myMedia(user);
  const s = feedback.summarize(media);
  const sug = feedback.suggest(s, act.plan);
  const start = media.map((m) => m.date).sort()[0] ?? todayISO();
  const sentence = feedback.achievementSentence(s, start, todayISO());
  const maxViews = Math.max(1, ...s.byFormat.map((f) => f.avgViews));
  return (
    <>
      <header className="row between">
        <div>
          <span className="eyebrow">{act.name} · 성과 피드백</span>
          <h1>{s.topByViews ? `${fmtLabel(s.topByViews.format)} 반응이 가장 좋아요` : "아직 올린 콘텐츠가 없어요"}</h1>
        </div>
        {demo && <span className="tag">예시 데이터 · 인스타 연결 전</span>}
      </header>
      <section className="grid g4">
        <div className="card"><span className="small muted">올린 콘텐츠</span><span className="num big">{s.count}개</span></div>
        <div className="card"><span className="small muted">평균 조회수</span><span className="num big">{s.avgViews.toLocaleString("ko-KR")}</span></div>
        <div className="card"><span className="small muted">총 저장 수</span><span className="num big">{s.totalSaves}</span></div>
        <div className="card dark"><span className="small" style={{ color: "#C9CDD8" }}>가장 잘 된 포맷</span><span className="big" style={{ fontWeight: 700 }}>{s.topByViews ? fmtLabel(s.topByViews.format) : "-"}</span></div>
      </section>
      <section className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>포맷별 평균 조회수</h2>
          {s.byFormat.map((f) => (
            <div key={f.format} className="grid" style={{ gridTemplateColumns: "80px minmax(0,1fr) 70px", alignItems: "center" }}>
              <b>{fmtLabel(f.format)}</b><div className="bar"><i style={{ width: `${(f.avgViews / maxViews) * 100}%` }} /></div><span className="num" style={{ textAlign: "right" }}>{f.avgViews.toLocaleString("ko-KR")}</span>
            </div>
          ))}
          <table>
            <thead><tr><th>날짜</th><th>포맷</th><th>제목</th><th>조회</th><th>좋아요</th><th>저장</th></tr></thead>
            <tbody>{media.map((m) => <tr key={m.id}><td>{md(m.date)}</td><td>{fmtLabel(m.format)}</td><td>{m.permalink ? <a href={m.permalink}>{m.title ?? "보기"}</a> : m.title}</td><td className="num">{m.views.toLocaleString("ko-KR")}</td><td>{m.likes}</td><td>{m.saves}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="grid">
          <h2>다음 행동</h2>
          {sug.map((x, i) => (
            <div key={i} className={x.kind === "switch_format" ? "card hi" : "card"}>
              <h3>{x.title}</h3>
              <p className="muted" style={{ margin: 0 }}>{x.detail}</p>
              {x.kind === "switch_format" && x.planItemId && x.toFormat && (
                <form action={applySuggestionAction}>
                  <input type="hidden" name="itemId" value={x.planItemId} /><input type="hidden" name="to" value={x.toFormat} />
                  <button className="btn pri" type="submit">캘린더에 반영</button>
                </form>
              )}
            </div>
          ))}
          {sentence && (
            <div className="card">
              <span className="small muted">지원서용 성과 문장 (실제 숫자만 사용)</span>
              <div className="note">“{sentence}”</div>
              <Link className="btn" href="/skeleton" style={{ alignSelf: "flex-start" }}>지원서 뼈대로 가기</Link>
            </div>
          )}
          <div className="note small">주최사 공식 계정 비교(Business Discovery)는 Facebook 로그인 방식의 Instagram API에서 제공돼요. 앱 설정 후 연결할 수 있어요.</div>
        </div>
      </section>
    </>
  );
}
