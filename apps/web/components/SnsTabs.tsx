import Link from "next/link";

/** SNS 관리 안의 두 화면: 계정 관리 · 분석하기 */
export function SnsTabs({ on }: { on: "account" | "feedback" }) {
  return (
    <nav className="subtabs" aria-label="SNS 관리">
      <Link href="/account" className={on === "account" ? "on" : undefined} aria-current={on === "account" ? "page" : undefined}>계정 관리</Link>
      <Link href="/feedback" className={on === "feedback" ? "on" : undefined} aria-current={on === "feedback" ? "page" : undefined}>분석하기</Link>
    </nav>
  );
}
