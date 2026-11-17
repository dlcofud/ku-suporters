import Link from "next/link";
import { billing, credits } from "@supportlab/core";
import { requireUser } from "@/lib/session";
import { repo } from "@/lib/repo";
import { syncSubscription } from "@/lib/billing";
import { cancelSubscriptionAction } from "@/lib/actions";
import { SubmitButton } from "@/components/Pending";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const day = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ paid?: string; canceled?: string }> }) {
  const user = await requireUser();
  const { paid, canceled } = await searchParams;
  const sub = await syncSubscription(user.id);
  const [entries, orders] = await Promise.all([repo.ledgerEntries(user.id), repo.listOrders(user.id)]);
  const bal = credits.computeBalance(entries);
  const plan = sub ? billing.findPlan(sub.planId) : undefined;
  const justPaid = paid ? orders.find((o) => o.id === paid) : undefined;
  // 사용 내역: 잡아 두었다 정산·해제된 항목(void)은 빼고, 지금 잡혀 있는 것(pending)은 보여 준다
  const history = entries.filter((e) => e.status !== "void").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 40);
  const monthUsed = entries
    .filter((e) => e.status === "posted" && e.amount < 0 && e.createdAt.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, e) => s - e.amount, 0);

  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <span className="eyebrow">{user.nickname}</span>
        <h1>크레딧</h1>
        <p className="lede" style={{ margin: 0 }}>AI 작업에 쓰는 크레딧이에요. 규칙으로 끝나는 작업과 로컬 AI는 크레딧이 들지 않아요.</p>
      </header>

      {justPaid && (
        <div className="note ok" role="status">
          <b>{justPaid.itemName}</b> 결제가 끝났어요 · {won(justPaid.amount)} · {justPaid.kind === "pack" ? `${justPaid.credits} 크레딧 적립` : `이번 달 ${justPaid.credits} 크레딧 적립`} · 승인번호 {justPaid.approvalId}
        </div>
      )}
      {canceled && <div className="note" role="status">구독을 해지했어요. {sub ? `${day(sub.currentPeriodEnd)}까지는 이번 달 크레딧을 그대로 쓸 수 있어요.` : ""}</div>}

      <section className="grid g3">
        <div className="card stat"><span className="small muted">지금 쓸 수 있는 크레딧</span><span className="num huge">{bal.available}</span></div>
        <div className="card stat"><span className="small muted">이번 달 쓴 크레딧</span><span className="num big">{monthUsed}</span></div>
        <div className="card stat">
          <span className="small muted">구독</span>
          {sub && plan ? (
            <>
              <span className="num big">{plan.name}{sub.status === "canceled" ? " (해지됨)" : ""}</span>
              <span className="small muted">{sub.status === "active" ? `다음 적립 ${day(sub.currentPeriodEnd)} · 매달 ${plan.monthlyCredits}` : `${day(sub.currentPeriodEnd)}까지 사용`}</span>
            </>
          ) : (
            <span className="num big">없음</span>
          )}
        </div>
      </section>

      <section className="grid" style={{ gap: 12 }}>
        <h2>구독 <span className="small muted" style={{ fontWeight: 500 }}>매달 크레딧이 채워져요</span></h2>
        <div className="grid g2">
          {billing.PLANS.map((p) => {
            const mine = sub?.planId === p.id && sub.status === "active";
            return (
              <div key={p.id} className={p.badge ? "card hi" : "card"}>
                <div className="row between">
                  <h3 style={{ fontSize: 20 }}>{p.name}</h3>
                  {p.badge && <span className="tag k-hl">{p.badge}</span>}
                </div>
                <div><span className="num big">{won(p.price)}</span><span className="muted"> / 월</span></div>
                <ul className="clean small">{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="small muted" style={{ margin: 0 }}>크레딧당 {billing.perCredit(p.price, p.monthlyCredits)}원</p>
                {mine ? (
                  <form action={cancelSubscriptionAction}>
                    <SubmitButton className="btn warn" pendingText="해지하는 중…">구독 해지</SubmitButton>
                  </form>
                ) : (
                  <Link className={p.badge ? "btn pri" : "btn"} href={`/credits/checkout?item=plan_${p.id}`} aria-disabled={sub?.status === "active"}>{sub?.status === "active" ? "다른 구독 중" : "구독하기"}</Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid" style={{ gap: 12 }}>
        <h2>한 번만 충전 <span className="small muted" style={{ fontWeight: 500 }}>쓸 만큼만 사요 · 기한 없음</span></h2>
        <div className="grid g3">
          {billing.PACKS.map((p) => (
            <div key={p.id} className="card">
              <div className="row between">
                <h3>{p.name}</h3>
                {p.badge && <span className="tag k-hl">{p.badge}</span>}
              </div>
              <span className="num big">{p.credits} 크레딧</span>
              <span>{won(p.price)} <span className="small muted">· 크레딧당 {billing.perCredit(p.price, p.credits)}원</span></span>
              <Link className="btn" href={`/credits/checkout?item=${p.id}`}>충전하기</Link>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>크레딧이 더 필요하면 <Link href="/contribute">합격 경험 공유</Link>로 최대 50 크레딧을 받을 수 있어요.</p>
      </section>

      <section className="card">
        <h2>사용 내역</h2>
        {history.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>아직 내역이 없어요.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>날짜</th><th>내용</th><th style={{ textAlign: "right" }}>크레딧</th></tr></thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td className="num small">{day(e.createdAt)}</td>
                    <td>{billing.ledgerLabel(e.reason, e.memo)}{e.status === "pending" && <span className="tag" style={{ marginLeft: 6 }}>{e.amount > 0 ? "지급 예정" : "진행 중"}</span>}</td>
                    <td className={e.amount < 0 ? "num" : "num"} style={{ textAlign: "right", color: e.amount > 0 ? "var(--ok)" : undefined }}>{e.amount > 0 ? `+${e.amount}` : e.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {orders.length > 0 && (
        <section className="card">
          <h2>결제 내역</h2>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>날짜</th><th>상품</th><th>결제 수단</th><th style={{ textAlign: "right" }}>금액</th><th>상태</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="num small">{day(o.createdAt)}</td>
                    <td>{o.itemName}</td>
                    <td>{billing.PAY_METHODS.find((m) => m.id === o.method)?.label}</td>
                    <td className="num" style={{ textAlign: "right" }}>{won(o.amount)}</td>
                    <td>{o.status === "paid" ? <span className="tag k-post">결제 완료{o.provider === "test" ? " · 테스트" : ""}</span> : <span className="tag">실패</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
