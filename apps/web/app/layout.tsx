import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav, MobileTabs } from "@/components/Nav";
import { currentUser, currentActivity } from "@/lib/session";
import { repo, todayISO } from "@/lib/repo";
import { selectActivityAction, logout } from "@/lib/actions";
import { credits, shared } from "@supportlab/core";
import { dday } from "@/lib/format";
import { APP_VERSION } from "@/lib/releases";

export const metadata = { title: "서포트랩", description: "대학생 서포터즈 지원·활동 AI 매니저" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const bal = user ? await repo.ledger.balance(user.id) : undefined;
  const acts = user ? await repo.listActivities(user.id) : [];
  const cur = user ? await currentActivity(user.id) : undefined;
  const today = todayISO();
  // 크레딧 막대: 가입 보너스 대비 남은 양 (보너스보다 많으면 가득)
  const fill = bal ? Math.min(100, (bal.available / Math.max(credits.CREDIT_POLICY.signupBonus, bal.available)) * 100) : 0;
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Gothic+A1:wght@400;500;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="shell">
          <aside className={user ? "side" : "side guest"} id="menu" aria-label="메뉴">
            <Link href="/" className="logo">
              <i>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1C2140" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17l5-5 4 4 7-8" /><path d="M15 8h5v5" /></svg>
              </i>
              서포트랩
            </Link>

            {user && (
              <Link href="/notice" className="btn newact">
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>+</span> 새 활동 분석하기
              </Link>
            )}

            {acts.length > 0 && (
              <div className="navgroup">
                <span className="navlabel">내 활동</span>
                {acts.map((a) => {
                  const d = a.plan ? shared.diffDays(today, a.plan.deadline) : a.analysis.deadline ? shared.diffDays(today, a.analysis.deadline) : undefined;
                  const on = a.id === cur?.id;
                  return (
                    <form key={a.id} action={selectActivityAction}>
                      <input type="hidden" name="activityId" value={a.id} />
                      <input type="hidden" name="next" value="/" />
                      <button type="submit" className={on ? "nav act on" : "nav act"} aria-current={on ? "true" : undefined}>
                        <span className="actname">{a.name}</span>
                        <span className={on && d !== undefined && d <= 21 ? "dd hot" : "dd"}>{d === undefined ? "분석 중" : d < 0 ? "마감" : dday(d)}</span>
                      </button>
                    </form>
                  );
                })}
              </div>
            )}

            {user && <Nav hasActivity={!!cur} />}

            {user && bal && (
              <div className="sidefoot">
                <div className="card credit">
                  <div className="row between">
                    <span className="small muted">남은 크레딧</span>
                    <span className="tag k-hl">무료</span>
                  </div>
                  <span className="num huge">{bal.available}</span>
                  {bal.incoming > 0 && <span className="small" style={{ fontWeight: 800 }}>지급 예정 +{bal.incoming}</span>}
                  <div className="bar thin"><i style={{ width: `${fill}%` }} /></div>
                  <Link href="/contribute" className="small">합격 경험 공유하고 크레딧 받기</Link>
                </div>
                {!user.loginId && <Link href="/settings" className="side-warn">아이디·비밀번호를 정해 주세요 →</Link>}
                <div className="account">
                  <Link href="/settings" className="acc-name" title="계정 설정"><i aria-hidden="true">{user.nickname.slice(0, 1)}</i><span>{user.nickname}{user.loginId && <small>@{user.loginId}</small>}</span></Link>
                  <form action={logout}><button type="submit" className="acc-out">로그아웃</button></form>
                </div>
                <Link href="/releases" className="small muted" style={{ padding: "0 8px" }}>릴리즈 노트 · v{APP_VERSION}</Link>
              </div>
            )}
            {!user && (
              <div className="sidefoot">
                <Link href="/login" className="btn newact">로그인</Link>
                <Link href="/" className="small" style={{ padding: "0 8px", color: "#C3C8DD" }}>처음이라면 회원가입</Link>
              </div>
            )}
          </aside>
          <main className="main">{children}</main>
        </div>
        {user && cur && <MobileTabs />}
      </body>
    </html>
  );
}
