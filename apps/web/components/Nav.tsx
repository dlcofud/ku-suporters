"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./icons";

/** 선택한 활동 안에서 쓰는 메뉴 (스크린샷의 "이 활동") */
const ACTIVITY: [string, string, ReactNode][] = [
  ["/trends", "경향 분석", Icon.trends()],
  ["/skeleton", "지원서 뼈대", Icon.skeleton()],
  ["/", "콘텐츠 캘린더", Icon.calendar()],
  ["/feedback", "성과 피드백", Icon.feedback()],
];

/** 그 밖의 도구 */
const TOOLS: [string, string][] = [
  ["/studio", "콘텐츠 제작"],
  ["/account", "계정 만들기"],
  ["/contribute", "합격 경험 공유"],
  ["/reviews", "후기 분석 (팀)"],
  ["/admin", "검수 (관리자)"],
];

/** 모바일 하단 탭: 자주 쓰는 화면 4개 + 나머지 메뉴 (5개 이하) */
const TABS: [string, string, ReactNode][] = [
  ["/", "캘린더", Icon.calendar(22)],
  ["/studio", "제작", Icon.studio(22)],
  ["/feedback", "성과", Icon.feedback(22)],
  ["/skeleton", "지원서", Icon.skeleton(22)],
];

function useIsOn() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" || path.startsWith("/calendar") : path.startsWith(href));
}

export function Nav({ hasActivity }: { hasActivity: boolean }) {
  const isOn = useIsOn();
  return (
    <>
      {hasActivity && (
        <nav className="navgroup" aria-label="이 활동">
          <span className="navlabel">이 활동</span>
          {ACTIVITY.map(([href, label, icon]) => (
            <Link key={href} href={href} className={isOn(href) ? "nav on" : "nav"} aria-current={isOn(href) ? "page" : undefined}>
              <span className="ico">{icon}{label}</span>
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

export function TabBar() {
  const isOn = useIsOn();
  return (
    <nav className="tabbar" aria-label="주요 화면">
      {TABS.map(([href, label, icon]) => (
        <Link key={href} href={href} aria-current={isOn(href) ? "page" : undefined}>
          {icon}
          {label}
        </Link>
      ))}
      <a href="#menu">
        {Icon.menu(22)}
        메뉴
      </a>
    </nav>
  );
}
