"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const I = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/**
 * 고른 서포터즈 안에서 쓰는 메뉴. 지원 → 제작 → 성과 순서 그대로.
 * 업로드 일정은 사이드바의 서포터즈 카드를 누르면 열려서 여기엔 두지 않는다.
 * 이름은 화면 제목과 같게 짧게.
 */
const ACTIVITY: [string, string, ReactNode][] = [
  ["/notice/result", "공고 요약", I(<><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h3" /></>)],
  ["/skeleton", "지원서", I(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>)],
  ["/studio", "콘텐츠 만들기", I(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>)],
  ["/feedback", "성과", I(<><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></>)],
];

/** 서포터즈와 상관없이 보는 것 */
const REFERENCE: [string, string][] = [["/trends", "합격 경향"]];

/** 관리자만 */
const ADMIN: [string, string][] = [
  ["/reviews", "후기 검수"],
  ["/admin", "공유 승인"],
  ["/admin/sheet", "후기 시트 (엑셀)"],
];

/** roles: 서버에서 정한 권한. 메뉴만 숨기는 것이고, 실제 막는 건 각 페이지·액션의 requireRole */
export function Nav({ hasActivity, roles = [] }: { hasActivity: boolean; roles?: ("admin" | "team")[] }) {
  const path = usePathname();
  const all = [...ACTIVITY.map(([h]) => h), ...REFERENCE.map(([h]) => h), ...ADMIN.map(([h]) => h)];
  // 더 긴 메뉴 주소가 맞으면 그쪽만 켠다 (/admin 과 /admin/sheet)
  const isOn = (href: string) => path.startsWith(href) && !all.some((h) => h.length > href.length && h.startsWith(href) && path.startsWith(h));
  const small = (href: string, label: string) => (
    <Link key={href} href={href} className={isOn(href) ? "nav sm on" : "nav sm"} aria-current={isOn(href) ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <>
      {hasActivity && path !== "/" && (
        <nav className="navgroup" aria-label="이 서포터즈">
          <span className="navlabel">이 서포터즈</span>
          {ACTIVITY.map(([href, label, icon]) => (
            <Link key={href} href={href} className={isOn(href) ? "nav on" : "nav"} aria-current={isOn(href) ? "page" : undefined}>
              <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>{icon}{label}</span>
            </Link>
          ))}
        </nav>
      )}
      <nav className="navgroup tools" aria-label="참고">
        <span className="navlabel">참고</span>
        {REFERENCE.map(([h, l]) => small(h, l))}
      </nav>
      {roles.includes("admin") && (
        <nav className="navgroup tools" aria-label="관리자">
          <span className="navlabel">관리자</span>
          {ADMIN.map(([h, l]) => small(h, l))}
        </nav>
      )}
    </>
  );
}

const T = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/** 모바일 아래 탭 5개. 메뉴는 본문 아래에 있는 사이드바(#menu)로 내려간다 */
const TABS: [string, string, ReactNode][] = [
  ["/", "홈", T(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>)],
  ["/skeleton", "지원서", T(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>)],
  ["/calendar", "일정", T(<><path d="M8 3v4M16 3v4" /><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 13h3" /></>)],
  ["/studio", "만들기", T(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>)],
  ["#menu", "메뉴", T(<><path d="M4 7h16M4 12h16M4 17h16" /></>)],
];

export function MobileTabs() {
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" : href !== "#menu" && path.startsWith(href));
  return (
    <nav className="tabs" aria-label="빠른 메뉴">
      {TABS.map(([href, label, icon]) =>
        href.startsWith("#") ? (
          <a key={href} href={href}>{icon}{label}</a>
        ) : (
          <Link key={href} href={href} className={isOn(href) ? "on" : undefined} aria-current={isOn(href) ? "page" : undefined}>{icon}{label}</Link>
        ),
      )}
    </nav>
  );
}
