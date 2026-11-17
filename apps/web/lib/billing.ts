import { billing } from "@supportlab/core";
import { repo, todayISO } from "./repo";

/** 결제사: 지금은 테스트 결제만 (실제 돈이 나가지 않는다) */
export const payments: billing.PaymentProvider = new billing.TestPaymentProvider();

/**
 * 구독 갱신일이 지났으면 지난 달 수만큼 월간 크레딧을 적립한다.
 * 페이지를 열 때마다 불러도 같은 기간은 한 번만 적립된다 (idempotencyKey).
 */
export async function syncSubscription(userId: string): Promise<billing.Subscription | undefined> {
  const sub = await repo.getSubscription(userId);
  if (!sub) return undefined;
  const { sub: next, periods } = billing.renewIfDue(sub, todayISO());
  if (!periods.length) return sub;
  const plan = billing.findPlan(sub.planId);
  for (const p of periods) {
    if (plan) await repo.ledger.grant(userId, plan.monthlyCredits, "subscription_refill", { idempotencyKey: `sub:${userId}:${p}`, memo: `${plan.name} ${p.slice(0, 7)}` });
  }
  await repo.saveSubscription(next);
  return next;
}
