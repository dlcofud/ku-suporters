import { describe, expect, it } from "vitest";
import { addMonth, cancelSubscription, findPack, ledgerLabel, PACKS, perCredit, PLANS, renewIfDue, startSubscription, TestPaymentProvider } from "../src/billing/index.js";
import { CreditLedger, MemoryCreditStore } from "../src/credits/index.js";

describe("요금제", () => {
  it("묶음이 클수록 크레딧당 가격이 싸다", () => {
    const per = PACKS.map((p) => perCredit(p.price, p.credits));
    expect([...per].sort((a, b) => b - a)).toEqual(per);
    expect(findPack("pack_150")?.credits).toBe(150);
    expect(PLANS.map((p) => p.monthlyCredits)).toEqual([100, 300]);
  });
});

describe("구독 갱신", () => {
  it("한 달 더하기: 말일은 다음 달 말일로", () => {
    expect(addMonth("2026-01-31")).toBe("2026-02-28");
    expect(addMonth("2026-11-17")).toBe("2026-12-17");
    expect(addMonth("2026-12-17")).toBe("2027-01-17");
  });
  it("갱신일 전에는 적립 없음, 지나면 지난 달 수만큼, 해지하면 멈춤", () => {
    const s = startSubscription("u1", "basic", "2026-11-17");
    expect(s.currentPeriodEnd).toBe("2026-12-17");
    expect(renewIfDue(s, "2026-12-16").periods).toEqual([]);
    const r = renewIfDue(s, "2027-02-20");
    expect(r.periods).toEqual(["2026-12-17", "2027-01-17", "2027-02-17"]);
    expect(r.sub.currentPeriodEnd).toBe("2027-03-17");
    expect(renewIfDue(cancelSubscription(r.sub, new Date()), "2027-05-01").periods).toEqual([]);
  });
  it("같은 기간은 원장에 두 번 적립되지 않는다", async () => {
    const ledger = new CreditLedger(new MemoryCreditStore());
    for (let i = 0; i < 2; i++) await ledger.grant("u1", 100, "subscription_refill", { idempotencyKey: "sub:u1:2026-12-17" });
    expect((await ledger.balance("u1")).available).toBe(100);
  });
});

describe("테스트 결제와 원장 표시", () => {
  it("테스트 결제는 승인 번호를 주고, 0원은 거절한다", async () => {
    const p = new TestPaymentProvider();
    expect(await p.charge({ orderId: "o1", amount: 3900 })).toEqual({ ok: true, approvalId: "TEST-o1" });
    expect((await p.charge({ orderId: "o2", amount: 0 })).ok).toBe(false);
  });
  it("원장 항목을 사람이 읽는 말로 바꾼다", () => {
    expect(ledgerLabel("task_settle", "coach_turn (정산 완료)")).toBe("AI 사용 · 지원서 코치");
    expect(ledgerLabel("purchase", "지원 시즌 150")).toBe("크레딧 충전 · 지원 시즌 150");
    expect(ledgerLabel("signup_bonus")).toBe("가입 축하 크레딧");
  });
});
