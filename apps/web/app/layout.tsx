import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav, MobileTabs } from "@/components/Nav";
import { currentUser, currentActivity, rolesOf } from "@/lib/session";
import { repo, todayISO } from "@/lib/repo";
import { logout } from "@/lib/actions";
import { SideActs, type SideAct } from "@/components/SideActs";
import { summarize, goHref } from "@/lib/overview";
import { syncSubscription } from "@/lib/billing";
import { credits } from "@supportlab/core";
import { dday } from "@/lib/format";
import { APP_VERSION } from "@/lib/releases";

export const metadata = { title: "서포트랩", description: "대학생 서포터즈 지원·활동 AI 매니저" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  // 구독 갱신일이 지났으면 먼저 이번 달 크레딧을 채운다 (같은 달은 한 번만)
  const sub = user ? await syncSubscription(user.id).catch(() => undefined) : undefined;
  const bal = user ? await repo.ledger.balance(user.id) : undefined;
  const planName = sub?.status === "active" ? (sub.planId === "pro" ? "프로" : "베이직") : "무료";
  const acts = user ? await repo.listActivities(user.id) : [];
  const cur = user ? await currentActivity(user.id) : undefined;
  const today = todayISO();
  const sideActs: SideAct[] = summarize(acts, today).map((a) => ({
    id: a.id,
    name: a.name,
    stage: a.stage,
    dday: a.daysLeft === undefined ? "분석 중" : a.daysLeft < 0 ? "마감" : dday(a.daysLeft),
    hot: a.daysLeft !== undefined && a.daysLeft >= 0 && a.daysLeft <= 7,
    href: goHref(a.id, "/calendar"),
  }));
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
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>+</span> 새 서포터즈 추가
              </Link>
            )}

            {user && <SideActs acts={sideActs} currentId={cur?.id} />}

            {user && <Nav hasActivity={!!cur} roles={rolesOf(user)} />}

            {user && bal && (
              <div className="sidefoot">
                <div className="card credit">
                  <div className="row between">
                    <span className="small muted">남은 크레딧</span>
                    <Link href="/credits" className="tag k-hl" style={{ textDecoration: "none" }} title="요금제">{planName}</Link>
                  </div>
                  <span className="num huge">{bal.available}</span>
                  {bal.incoming > 0 && <span className="small" style={{ fontWeight: 800 }}>지급 예정 +{bal.incoming}</span>}
                  <div className="bar thin"><i style={{ width: `${fill}%` }} /></div>
                  <div className="row between small">
                    <Link href="/credits" style={{ fontWeight: 800 }}>충전 · 내역</Link>
                    <Link href="/contribute">공유하고 받기</Link>
                  </div>
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
