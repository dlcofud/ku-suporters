import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/session";
import { repo } from "@/lib/repo";

export const metadata = { title: "서포트랩", description: "대학생 서포터즈 지원·활동 AI 매니저" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const bal = user ? await repo.ledger.balance(user.id) : undefined;
  const act = user ? await repo.latestActivity(user.id) : undefined;
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="shell">
          <aside className="side">
            <Link href="/" className="logo">
              <i>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17l5-5 4 4 7-8" /><path d="M15 8h5v5" /></svg>
              </i>
              서포트랩
            </Link>
            {act && (
              <div className="navgroup">
                <span className="navlabel">준비 중인 활동</span>
                <Link href="/calendar" className="nav on">
                  <span>{act.name}</span>
                </Link>
              </div>
            )}
            <Nav isAdmin={!!user} />
            {user && bal && (
              <div className="card" style={{ marginTop: "auto" }}>
                <div className="row between">
                  <span className="small muted">남은 크레딧</span>
                  {bal.incoming > 0 && <span className="tag k-reels">지급 예정 +{bal.incoming}</span>}
                </div>
                <span className="num big">{bal.available}</span>
                <Link href="/contribute" className="small">크레딧 받는 방법</Link>
              </div>
            )}
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
