"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SideAct {
  id: string;
  name: string;
  stage: string;
  dday: string;
  hot: boolean;
  href: string;
}

/** 사이드바: 전체 일정 + 내 서포터즈 목록. 전체 일정 화면이 아니면 지금 고른 서포터즈를 표시한다 */
export function SideActs({ acts, currentId }: { acts: SideAct[]; currentId?: string }) {
  const path = usePathname();
  const home = path === "/";
  return (
    <nav className="navgroup" aria-label="내 서포터즈">
      <Link href="/" className={home ? "nav on" : "nav"} aria-current={home ? "page" : undefined}>
        <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          전체 일정
        </span>
        {acts.length > 0 && <span className="dd">{acts.length}개</span>}
      </Link>
      {acts.length > 0 && <span className="navlabel" style={{ paddingTop: 12 }}>내 서포터즈</span>}
      {acts.map((a) => {
        const on = !home && a.id === currentId;
        return (
          // 서포터즈를 고르는 주소(/go)는 미리 불러오면 선택이 바뀌므로 Link가 아닌 a (클릭할 때만 이동)
          <a key={a.id} href={a.href} className={on ? "nav act on" : "nav act"} aria-current={on ? "true" : undefined}>
            <span className="actname" style={{ display: "flex", flexDirection: "column" }}>
              <span>{a.name}</span>
              <small className="stage">{a.stage}</small>
            </span>
            <span className={a.hot ? "dd hot" : "dd"}>{a.dday}</span>
          </a>
        );
      })}
    </nav>
  );
}
