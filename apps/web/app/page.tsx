import Link from "next/link";
import { currentUser } from "@/lib/session";
import { db, latestActivity, todayISO } from "@/lib/store";
import { signup, logout } from "@/lib/actions";
import { credits, shared } from "@supportlab/core";
import { dday, fmtLabel, md } from "@/lib/format";

export default async function Home() {
  const user = await currentUser();
  if (!user) {
    return (
      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="card dark" style={{ gap: 16 }}>
          <span className="eyebrow" style={{ color: "#A5A7FA" }}>서포트랩</span>
          <h1 style={{ fontSize: 34 }}>서포터즈 혜택은 많은데,<br />하기 귀찮다면?</h1>
          <p style={{ margin: 0, color: "#C9CDD8" }}>공고만 넣으면 지원서 뼈대와 업로드 일정을 만들고, 콘텐츠 촬영·편집·예약 게시까지 함께해요.</p>
        </section>
        <form action={signup} className="card">
          <h2>시작하기</h2>
          <p className="muted" style={{ margin: 0 }}>가입하면 <b>{credits.CREDIT_POLICY.signupBonus} 크레딧</b>을 무료로 드려요.</p>
          <label>
            닉네임
            <input type="text" name="nickname" placeholder="예: 채령" required maxLength={20} />
          </label>
          <button className="btn pri" type="submit">무료 크레딧 받고 시작하기</button>
          <p className="small muted" style={{ margin: 0 }}>데모 버전이라 서버를 다시 시작하면 데이터가 초기화돼요.</p>
        </form>
      </div>
    );
  }
  const act = latestActivity(user.id);
  const bal = await db.ledger.balance(user.id);
  const next = act?.plan?.items.find((i) => i.status !== "past" && i.kind !== "deadline");
  const done = act?.plan?.items.filter((i) => i.kind === "content" && i.status === "past").length ?? 0;
  const total = act?.plan?.items.filter((i) => i.kind === "content").length ?? 0;
  return (
    <>
      <header className="row between">
        <div>
          <span className="eyebrow">{user.nickname}님의 대시보드</span>
          <h1>{act ? `${act.name}` : "준비할 활동을 먼저 넣어 주세요"}</h1>
        </div>
        <form action={logout}><button className="btn" type="submit">로그아웃</button></form>
      </header>
      {!act ? (
        <div className="card hi">
          <h2>1단계: 공고 넣기</h2>
          <p className="muted" style={{ margin: 0 }}>모집 공고를 붙여넣으면 마감일, 우대사항, 지원서 문항을 뽑고 업로드 일정을 만들어요.</p>
          <Link className="btn pri" href="/notice" style={{ alignSelf: "flex-start" }}>공고 분석하기</Link>
        </div>
      ) : (
        <>
          <section className="grid g4">
            <div className="card"><span className="small muted">모집 마감</span><span className="num big" style={{ color: "var(--warn)" }}>{act.analysis.deadline ? `${md(act.analysis.deadline)} · ${dday(shared.diffDays(todayISO(), act.analysis.deadline))}` : "미정"}</span></div>
            <div className="card"><span className="small muted">콘텐츠 진행</span><span className="num big">{done} / {total}</span><div className="bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div></div>
            <div className="card"><span className="small muted">사용 가능 크레딧</span><span className="num big">{bal.available}</span></div>
            <div className="card dark"><span className="small" style={{ color: "#C9CDD8" }}>다음 할 일</span><span style={{ fontWeight: 700 }}>{next ? `${md(next.date)} · ${next.title}` : "일정 없음"}</span></div>
          </section>
          <section className="grid g3">
            {[
              ["/skeleton", "지원서 뼈대", act.skeleton ? "만들어 둠" : "아직 없음"],
              ["/account", "계정 만들기", act.accountKit ? "가이드 준비됨" : "아직 없음"],
              ["/calendar", "콘텐츠 캘린더", act.plan ? `${total}개 일정` : "마감일 필요"],
              ["/studio", "콘텐츠 제작", next?.format && next.kind === "content" ? `다음: ${fmtLabel(next.format)}` : "장면 기획·편집"],
              ["/feedback", "성과 피드백", user.ig ? "인스타 연결됨" : "데모 데이터"],
              ["/contribute", "합격 경험 공유", "크레딧 받기"],
            ].map(([href, t, s]) => (
              <Link key={href} href={href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
                <h3>{t}</h3>
                <span className="small muted">{s}</span>
              </Link>
            ))}
          </section>
        </>
      )}
    </>
  );
}
