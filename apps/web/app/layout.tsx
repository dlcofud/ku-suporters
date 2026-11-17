import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Black_Han_Sans, Gothic_A1 } from "next/font/google";
import { Nav, TabBar } from "@/components/Nav";
import { Icon } from "@/components/icons";
import { currentUser, currentActivity } from "@/lib/session";
import { repo, todayISO } from "@/lib/repo";
import { selectActivityAction } from "@/lib/actions";
import { credits, shared } from "@supportlab/core";
import { dday } from "@/lib/format";
import { APP_VERSION } from "@/lib/releases";

// 본문 Gothic A1 + 제목·D-day 용 Black Han Sans (대외활동 포스터 같은 굵은 글씨). next/font 로 자체 호스팅, 한글은 범위가 커서 미리 불러오지 않는다
const gothic = Gothic_A1({ weight: ["400", "500", "700", "800"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-gothic" });
const poster = Black_Han_Sans({ weight: "400", subsets: ["latin"], display: "swap", preload: false, variable: "--font-poster" });

export const metadata = { title: "서포트랩", description: "대학생 서포터즈 지원·활동 AI 매니저" };
// 확대를 막지 않고, 하단 탭이 홈 인디케이터를 피하도록 안전 영역을 쓴다
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#1C2140" };
export const dynamic = "force-dynamic";

const Logo = () => (
  <Link href="/" className="logo">
    <i>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17l5-5 4 4 7-8" /><path d="M15 8h5v5" /></svg>
    </i>
    서포트랩
  </Link>
);

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const bal = user ? await repo.ledger.balance(user.id) : undefined;
  const acts = user ? await repo.listActivities(user.id) : [];
  const cur = user ? await currentActivity(user.id) : undefined;
  const today = todayISO();
  // 크레딧 막대: 가입 보너스 대비 남은 양 (보너스보다 많으면 가득)
  const fill = bal ? Math.min(100, (bal.available / Math.max(credits.CREDIT_POLICY.signupBonus, bal.available)) * 100) : 0;
  const showTabs = !!user && !!cur;
  return (
    <html lang="ko" className={`${gothic.variable} ${poster.variable}`}>
      <body>
        <a href="#main" className="skip">본문으로 건너뛰기</a>
        <div className={user ? "shell" : "shell guest"}>
          {/* 모바일 상단 바 (로그인 전에는 모든 화면에서 상단 바로 쓴다) */}
          <header className="mtop">
            <Logo />
            {user && bal && (
              <a href="#menu" className="cred" aria-label={`남은 크레딧 ${bal.available}, 메뉴 열기`}>
                {Icon.coin()}<span className="num">{bal.available}</span>
              </a>
            )}
            {!user && <a href="#signup" className="mcta">무료로 시작하기</a>}
          </header>

          {user && <aside id="menu" className={showTabs ? "side" : "side notab"} aria-label="메뉴">
            <Logo />

            {user && (
              <Link href="/notice" className="btn newact">
                {Icon.plus()} 새 활동 분석하기
              </Link>
            )}

            {acts.length > 0 && (
              <div className="navgroup" role="group" aria-label="내 활동">
                <span className="navlabel" aria-hidden="true">내 활동</span>
                {acts.map((a) => {
                  const d = a.plan ? shared.diffDays(today, a.plan.deadline) : a.analysis.deadline ? shared.diffDays(today, a.analysis.deadline) : undefined;
                  const on = a.id === cur?.id;
                  const badge = d === undefined ? "분석 중" : d < 0 ? "마감" : dday(d);
                  return (
                    <form key={a.id} action={selectActivityAction}>
                      <input type="hidden" name="activityId" value={a.id} />
                      <input type="hidden" name="next" value="/" />
                      <button type="submit" className={on ? "nav act on" : "nav act"} aria-current={on ? "true" : undefined}>
                        <span className="actname">{a.name}</span>
                        <span className={on && d !== undefined && d <= 21 ? "dd hot" : "dd"}>{badge}</span>
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
                    <span className="tag k-reels">무료</span>
                  </div>
                  <span className="num huge">{bal.available}</span>
                  {bal.incoming > 0 && <span className="small" style={{ color: "var(--hl)", fontWeight: 700 }}>지급 예정 +{bal.incoming}</span>}
                  <div className="bar thin" role="img" aria-label={`가입 보너스 대비 ${Math.round(fill)}% 남음`}><i style={{ width: `${fill}%` }} /></div>
                  <Link href="/contribute" className="small">합격 경험 공유하고 크레딧 받기</Link>
                </div>
                <Link href="/releases" className="small muted" style={{ padding: "0 8px" }}>릴리즈 노트 v{APP_VERSION}</Link>
              </div>
            )}
          </aside>}

          <main id="main" className="main" tabIndex={-1}>{children}</main>
        </div>
        {showTabs && <TabBar />}
      </body>
    </html>
  );
}
