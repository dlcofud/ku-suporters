import Link from "next/link";
import { redirect } from "next/navigation";
import { billing } from "@supportlab/core";
import { requireUser } from "@/lib/session";
import { buyAction } from "@/lib/actions";
import { payments } from "@/lib/billing";
import { SubmitButton } from "@/components/Pending";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ item?: string; error?: string }> }) {
  await requireUser();
  const { item = "", error } = await searchParams;
  const pack = billing.findPack(item);
  const plan = item.startsWith("plan_") ? billing.findPlan(item.slice(5)) : undefined;
  if (!pack && !plan) redirect("/credits");
  const name = pack ? `${pack.name} · ${pack.credits} 크레딧` : `${plan!.name} 구독 · 매달 ${plan!.monthlyCredits} 크레딧`;
  const price = pack ? pack.price : plan!.price;
  return (
    <div className="auth-wrap">
      <form action={buyAction} className="card hi auth-card" style={{ width: "min(480px,100%)" }}>
        <span className="eyebrow"><Link href="/credits">크레딧</Link> · 결제</span>
        <h1>결제하기</h1>
        {payments.isTest && <p className="note warn" style={{ margin: 0 }}><b>테스트 결제예요.</b> 실제로 돈이 나가지 않고, 크레딧만 바로 적립돼요. 결제사를 연결하면 진짜 결제로 바뀌어요.</p>}
        {error && <p className="note warn" role="alert" style={{ margin: 0 }}>{error}</p>}
        <input type="hidden" name="item" value={item} />
        <table>
          <tbody>
            <tr><th>상품</th><td>{name}</td></tr>
            <tr><th>금액</th><td className="num">{won(price)}{plan ? " / 월" : ""} <span className="small muted">(부가세 포함)</span></td></tr>
            {plan && <tr><th>결제일</th><td className="small">오늘 결제하고, 매달 같은 날 다시 결제돼요. 언제든 해지할 수 있어요.</td></tr>}
          </tbody>
        </table>
        <fieldset className="checkbox-box">
          <legend style={{ fontWeight: 700, fontSize: 14 }}>결제 수단</legend>
          {billing.PAY_METHODS.map((m, i) => (
            <label key={m.id} className="check"><input type="radio" name="method" value={m.id} defaultChecked={i === 0} />{m.label}</label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" name="agree" required />
          <span className="small">결제 내용을 확인했어요. 쓰지 않은 충전 크레딧은 결제 후 7일 안에 환불을 요청할 수 있고, 구독은 해지해도 이번 기간 끝까지 쓸 수 있어요.</span>
        </label>
        <SubmitButton pendingText="결제하는 중…">{won(price)} 결제하기</SubmitButton>
      </form>
    </div>
  );
}
