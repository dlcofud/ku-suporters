"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const I = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/**
 * 메뉴 구조 (B안: 서포터즈를 고르면 그 안에서 탭)
 *  사이드바: 홈 / 내 서포터즈(목록 · 새 서포터즈 추가) / 내 SNS(모든 서포터즈 공통) / 참고
 *  서포터즈 안: 화면 위 ActHeader의 탭 — 업로드 일정 · 지원서 · 콘텐츠 · 공고 요약
 *  휴대폰 아래 탭: 홈 · SNS · 합격 경향 · 더보기
 */
const HOME: [string, string, ReactNode] = ["/", "홈", I(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>)];
/** 서포터즈 안 화면 (ActHeader 탭). 이 화면에 있으면 사이드바의 그 서포터즈 카드와 휴대폰 홈 탭이 켜진다 */
export const IN_ACT: [string, string][] = [
  ["/calendar", "업로드 일정"],
  ["/skeleton", "지원서"],
  ["/studio", "콘텐츠"],
  ["/notice/result", "공고 요약"],
];
const SNS_ICON = I(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></>);
/** 내 SNS: 계정·성과는 서포터즈와 상관없이 하나라서 서포터즈 밖에 둔다 */
const SNS: [string, string, ReactNode][] = [
  ["/account", "계정 관리", SNS_ICON],
  ["/feedback", "업로드 성과", I(<><path d="M4 19h16" /><path d="M6 15l4-4 3 3 5-6" /></>)],
];
const TRENDS: [string, string, ReactNode] = ["/trends", "합격 경향", I(<><path d="M4 19h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></>)];
/** 휴대폰 더보기에 들어가는 화면 (사이드바 아래쪽: 크레딧 · 계정 · 릴리즈 노트 · 새 서포터즈) */
const MORE_PATHS = ["/credits", "/settings", "/releases", "/contribute", "/notice"];

/** 관리자만 */
const ADMIN: [string, string][] = [
  ["/reviews", "후기 검수"],
  ["/admin", "공유 승인"],
  ["/admin/sheet", "후기 시트 (엑셀)"],
];

/** roles: 서버에서 정한 권한. 메뉴만 숨기는 것이고, 실제 막는 건 각 페이지·액션의 requireRole.
 *  children: 내 서포터즈 목록 · 새 서포터즈 추가 (서버에서 만든 것) */
export function Nav({ roles = [], children }: { roles?: ("admin" | "team")[]; children?: ReactNode }) {
  const path = usePathname();
  const all = [...SNS.map(([h]) => h), TRENDS[0], ...ADMIN.map(([h]) => h)];
  // 더 긴 메뉴 주소가 맞으면 그쪽만 켠다 (/admin 과 /admin/sheet)
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) && !all.some((h) => h.length > href.length && h.startsWith(href) && path.startsWith(h)));
  const big = ([href, label, icon]: [string, string, ReactNode]) => (
    <Link key={href} href={href} className={isOn(href) ? "nav on" : "nav"} aria-current={isOn(href) ? "page" : undefined}>
      <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>{icon}{label}</span>
    </Link>
  );
  const small = (href: string, label: string) => (
    <Link key={href} href={href} className={isOn(href) ? "nav sm on" : "nav sm"} aria-current={isOn(href) ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <>
      <nav className="navgroup homenav" aria-label="홈">{big([HOME[0], "홈 · 이번 주 할 일", HOME[2]])}</nav>
      {children}
      <nav className="navgroup snsnav" aria-label="내 SNS">
        <span className="navlabel">내 SNS · 모든 서포터즈 공통</span>
        {SNS.map(big)}
      </nav>
      <nav className="navgroup refnav" aria-label="참고">
        <span className="navlabel">참고</span>
        {big(TRENDS)}
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

/** 서포터즈 안 화면 위: ← 내 서포터즈 · 이름 · 마감 · D-day + 탭 (업로드 일정 · 지원서 · 콘텐츠 · 공고 요약) */
export function ActHeader({ act }: { act: { name: string; stage: string; dday: string; hot: boolean; due: string } }) {
  const path = usePathname();
  const on = IN_ACT.find(([h]) => path.startsWith(h))?.[0];
  if (!on) return null;
  return (
    <header className="acthead">
      <Link href="/" className="acthead-back">← 내 서포터즈</Link>
      <div className="acthead-top">
        <div className="acthead-name">
          <b>{act.name}</b>
          <span>{act.due} · {act.stage}</span>
        </div>
        <span className={act.hot ? "acthead-dd hot" : "acthead-dd"}>{act.dday}</span>
      </div>
      <nav className="acttabs" aria-label={`${act.name} 메뉴`}>
        {IN_ACT.map(([href, label]) => (
          <Link key={href} href={href} className={on === href ? "on" : undefined} aria-current={on === href ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}

const T = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/** 모바일 아래 탭: 홈(서포터즈 안 화면 포함) · SNS · 합격 경향 · 더보기(사이드바 아래쪽으로 내려간다) */
const TABS: [string, string, ReactNode, string[]?][] = [
  [HOME[0], HOME[1], HOME[2], ["/", ...IN_ACT.map(([h]) => h)]],
  ["/account", "SNS", SNS_ICON, SNS.map(([h]) => h)],
  TRENDS,
  ["#more", "더보기", I(<><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>), MORE_PATHS],
];

export function MobileTabs() {
  const path = usePathname();
  // '/'는 정확히 같을 때만, /notice 는 /notice/result 를 빼고, 나머지는 앞부분이 같으면 켠다
  const match = (h: string) => (h === "/" ? path === "/" : h === "/notice" ? path === "/notice" : path.startsWith(h));
  const isOn = (href: string, also?: string[]) => (also ?? [href]).some((h) => !h.startsWith("#") && match(h));
  return (
    <nav className="tabs" aria-label="빠른 메뉴">
      {TABS.map(([href, label, icon, also]) =>
        href.startsWith("#") ? (
          <a key={href} href={href} className={isOn(href, also) ? "on" : undefined}>{icon}<span>{label}</span></a>
        ) : (
          <Link key={href} href={href} className={isOn(href, also) ? "on" : undefined} aria-current={isOn(href, also) ? "page" : undefined}>{icon}<span>{label}</span></Link>
        ),
      )}
    </nav>
  );
}
