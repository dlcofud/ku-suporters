"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: [string, string][] = [
  ["/", "대시보드"],
  ["/notice", "공고 분석"],
  ["/trends", "합격 경향"],
  ["/skeleton", "지원서 뼈대"],
  ["/account", "계정 만들기"],
  ["/calendar", "콘텐츠 캘린더"],
  ["/studio", "콘텐츠 제작"],
  ["/feedback", "성과 피드백"],
];

export function Nav({ isAdmin }: { isAdmin?: boolean }) {
  const path = usePathname();
  const items = [...ITEMS, ["/contribute", "합격 경험 공유"] as [string, string], ...(isAdmin ? ([["/admin", "검수 (관리자)"]] as [string, string][]) : [])];
  return (
    <nav className="navgroup" aria-label="주요 메뉴">
      <span className="navlabel">메뉴</span>
      {items.map(([href, label]) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={on ? "nav on" : "nav"} aria-current={on ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
