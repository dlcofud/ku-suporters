import Link from "next/link";
import { requireUser, currentActivity } from "@/lib/session";
import { repo } from "@/lib/repo";
import { AccountPanel } from "@/components/AccountPanel";
import { SnsTabs } from "@/components/SnsTabs";

/** SNS 관리 → 계정 관리: 이미 쓰는 인스타 계정 연결 · 프로필 점검 · 추천 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ acct?: string; ig?: string }> }) {
  const { acct, ig } = await searchParams;
  const user = await requireUser();
  const act = await currentActivity(user.id);
  if (!act) return <div className="card"><h1>먼저 지원할 서포터즈를 추가해 주세요</h1><Link className="btn pri" href="/notice">새 서포터즈 추가</Link></div>;
  const others = (await repo.listActivities(user.id)).filter((a) => a.id !== act.id);
  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <span className="eyebrow">{act.name} · SNS 관리</span>
        <h1>계정 관리</h1>
      </header>
      <SnsTabs on="account" />
      <AccountPanel user={user} act={act} others={others} msg={ig ?? acct} />
    </>
  );
}
