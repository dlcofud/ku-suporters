"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const I = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/** 선택한 활동 안에서 쓰는 메뉴 (스크린샷의 "이 활동") */
const ACTIVITY: [string, string, ReactNode][] = [
  ["/trends", "경향 분석", I(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M3 20h18" /></>)],
  ["/skeleton", "지원서 작성", I(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>)],
  ["/", "콘텐츠 캘린더", I(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>)],
  ["/feedback", "성과 피드백", I(<><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></>)],
];

/** 그 밖의 도구 */
const TOOLS: [string, string, ("admin" | "team")?][] = [
  ["/studio", "콘텐츠 제작"],
  ["/account", "계정 만들기"],
  ["/contribute", "합격 경험 공유"],
  ["/reviews", "후기 분석 (팀)", "team"],
  ["/admin", "검수 (관리자)", "admin"],
];

/** roles: 서버에서 정한 권한. 메뉴만 숨기는 것이고, 실제 막는 건 각 페이지·액션의 requireRole */
export function Nav({ hasActivity, roles = [] }: { hasActivity: boolean; roles?: ("admin" | "team")[] }) {
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" || path.startsWith("/calendar") : path.startsWith(href));
  return (
    <>
      {hasActivity && (
        <nav className="navgroup" aria-label="이 활동">
          <span className="navlabel">이 활동</span>
          {ACTIVITY.map(([href, label, icon]) => (
            <Link key={href} href={href} className={isOn(href) ? "nav on" : "nav"} aria-current={isOn(href) ? "page" : undefined}>
              <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>{icon}{label}</span>
            </Link>
          ))}
        </nav>
      )}
      <nav className="navgroup tools" aria-label="도구">
        <span className="navlabel">도구</span>
        {TOOLS.filter(([, , need]) => !need || roles.includes(need)).map(([href, label]) => (
          <Link key={href} href={href} className={isOn(href) ? "nav sm on" : "nav sm"} aria-current={isOn(href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

const T = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/** 모바일 아래 탭 5개. 메뉴는 본문 아래에 있는 사이드바(#menu)로 내려간다 */
const TABS: [string, string, ReactNode][] = [
  ["/", "캘린더", T(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>)],
  ["/studio", "제작", T(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>)],
  ["/feedback", "성과", T(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M3 20h18" /></>)],
  ["/skeleton", "지원서", T(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>)],
  ["#menu", "메뉴", T(<><path d="M4 7h16M4 12h16M4 17h16" /></>)],
];

export function MobileTabs() {
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" || path.startsWith("/calendar") : href !== "#menu" && path.startsWith(href));
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
