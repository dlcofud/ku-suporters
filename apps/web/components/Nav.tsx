"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const I = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/**
 * 메뉴 구조 (사이드바 = 휴대폰 아래 탭)
 *  홈(전체 일정)
 *  내 서포터즈 → 고른 서포터즈를 누르면 그 아래에: 지원서 · 콘텐츠 · SNS(계정 관리 · 업로드 성과) · 더보기(공고 요약 · 업로드 일정)
 *  참고: 합격 경향 / 크레딧 · 계정
 * 휴대폰 탭: 홈 · 지원서 · 콘텐츠 · SNS · 더보기 (고른 서포터즈 기준, 3~5개)
 */
const HOME: [string, string, ReactNode] = ["/", "홈", I(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>)];
const ACTIVITY: [string, string, ReactNode][] = [
  ["/skeleton", "지원서", I(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>)],
  ["/studio", "콘텐츠", I(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>)],
];

/** SNS: 누르면 계정 관리 · 업로드 성과 두 개로 펼쳐진다 */
const SNS_LABEL = "SNS";
const SNS_ICON = I(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></>);
const SNS: [string, string][] = [
  ["/account", "계정 관리"],
  ["/feedback", "업로드 성과"],
];

/** 서포터즈 안 더보기: 가끔 쓰는 것 */
const MORE: [string, string, ReactNode][] = [
  ["/notice/result", "공고 요약", I(<><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h3" /></>)],
  ["/calendar", "업로드 일정", I(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>)],
];

/** 서포터즈와 상관없는 참고 메뉴 */
const REFERENCE: [string, string, ReactNode][] = [
  ["/trends", "합격 경향", I(<><path d="M4 19h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></>)],
];

export interface SideAct {
  id: string;
  name: string;
  stage: string;
  dday: string;
  hot: boolean;
  href: string;
}

/** 관리자만 */
const ADMIN: [string, string][] = [
  ["/reviews", "후기 검수"],
  ["/admin", "공유 승인"],
  ["/admin/sheet", "후기 시트 (엑셀)"],
];

/** roles: 서버에서 정한 권한. 메뉴만 숨기는 것이고, 실제 막는 건 각 페이지·액션의 requireRole.
 *  children: 내 서포터즈 목록 아래에 붙는 '새 서포터즈 추가' */
export function Nav({ acts, currentId, roles = [], children }: { acts: SideAct[]; currentId?: string; roles?: ("admin" | "team")[]; children?: ReactNode }) {
  const path = usePathname();
  const home = path === "/";
  const all = [...ACTIVITY.map(([h]) => h), ...SNS.map(([h]) => h), ...MORE.map(([h]) => h), ...REFERENCE.map(([h]) => h), ...ADMIN.map(([h]) => h)];
  // 더 긴 메뉴 주소가 맞으면 그쪽만 켠다 (/admin 과 /admin/sheet)
  const isOn = (href: string) => (href === "/" ? home : path.startsWith(href) && !all.some((h) => h.length > href.length && h.startsWith(href) && path.startsWith(h)));
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
  const snsOn = SNS.some(([h]) => isOn(h));
  const [open, setOpen] = useState(snsOn);
  const shown = open || snsOn;
  return (
    <>
      <nav className="navgroup homenav" aria-label="홈">{big(HOME)}</nav>

      <nav className="navgroup" id="more" aria-label="내 서포터즈">
        <span className="navlabel">내 서포터즈</span>
        {acts.map((a) => {
          const cur = a.id === currentId;
          // 서포터즈 안 화면에 있을 때 카드가 켜진다 (홈에서는 꺼짐)
          const on = cur && !home;
          return (
            <div key={a.id} className={cur ? "actblock open" : "actblock"}>
              {/* 서포터즈를 고르는 주소(/go)는 미리 불러오면 선택이 바뀌므로 Link가 아닌 a (클릭할 때만 이동) */}
              <a href={a.href} className={on ? "nav act on" : "nav act"} aria-current={on ? "true" : undefined} aria-expanded={cur}>
                <span className="actname" style={{ display: "flex", flexDirection: "column" }}>
                  <span>{a.name}</span>
                  <small className="stage">{a.stage}</small>
                </span>
                <span className={a.hot ? "dd hot" : "dd"}>{a.dday}</span>
              </a>
              {cur && (
                <div className="actsub" aria-label={`${a.name} 메뉴`}>
                  <div className="actsub-main">
                    {ACTIVITY.map(big)}
                    <button type="button" className={snsOn ? "nav parent on-parent" : "nav parent"} aria-expanded={shown} aria-controls="nav-sns" onClick={() => setOpen((o) => !o)}>
                      <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>{SNS_ICON}{SNS_LABEL}</span>
                      <span className="caret" aria-hidden="true">{shown ? "▾" : "▸"}</span>
                    </button>
                    {shown && <div id="nav-sns" className="navsub">{SNS.map(([href, label]) => small(href, label))}</div>}
                  </div>
                  <span className="navlabel sub">더보기</span>
                  {MORE.map(big)}
                </div>
              )}
            </div>
          );
        })}
        {children}
      </nav>

      <nav className="navgroup tools" aria-label="참고">
        <span className="navlabel">참고</span>
        {REFERENCE.map(big)}
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

/** 모바일 아래 탭: 사이드바 주요 메뉴와 같은 이름·순서·아이콘 + 더보기(사이드바의 더보기 묶음으로 내려간다) */
const TABS: [string, string, ReactNode, string[]?][] = [
  HOME,
  ...ACTIVITY,
  ["/account", SNS_LABEL, SNS_ICON, SNS.map(([h]) => h)],
  ["#more", "더보기", I(<><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>), [...MORE, ...REFERENCE].map(([h]) => h)],
];

export function MobileTabs() {
  const path = usePathname();
  // 더보기(#more)는 그 안의 화면(공고 요약·업로드 일정·합격 경향)에 있을 때 켜진다
  const isOn = (href: string, also?: string[]) => (href === "/" ? path === "/" : (also ?? [href]).some((h) => !h.startsWith("#") && path.startsWith(h)));
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
