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
  ["/skeleton", "지원서 뼈대", I(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>)],
  ["/", "콘텐츠 캘린더", I(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>)],
  ["/feedback", "성과 피드백", I(<><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></>)],
];

/** 그 밖의 도구 */
const TOOLS: [string, string][] = [
  ["/studio", "콘텐츠 제작"],
  ["/account", "계정 만들기"],
  ["/contribute", "합격 경험 공유"],
  ["/admin", "검수 (관리자)"],
];

export function Nav({ hasActivity }: { hasActivity: boolean }) {
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
        {TOOLS.map(([href, label]) => (
          <Link key={href} href={href} className={isOn(href) ? "nav sm on" : "nav sm"} aria-current={isOn(href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
