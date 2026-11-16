import { describe, expect, it } from "vitest";
import { CreditLedger, MemoryCreditStore, creditsForUsage, InsufficientCreditsError, CREDIT_POLICY } from "../src/credits/index.js";

describe("credits", () => {
  it("가입 보너스는 한 번만 지급된다", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    await l.grantSignupBonus("u1");
    await l.grantSignupBonus("u1");
    expect((await l.balance("u1")).available).toBe(CREDIT_POLICY.signupBonus);
  });

  it("예약 후 실제 사용량만큼만 차감하고 나머지는 풀어 준다", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    await l.grantSignupBonus("u1");
    const hold = await l.hold("u1", "skeleton", "job1");
    expect((await l.balance("u1")).available).toBe(50 - 8);
    const { charged } = await l.settle(hold, { inputTokens: 1500, outputTokens: 300 });
    expect(charged).toBe(3); // (1500 + 300*4) / 1000 = 2.7 → 3
    const b = await l.balance("u1");
    expect(b).toMatchObject({ posted: 47, held: 0, available: 47 });
  });

  it("실제 사용량이 상한을 넘어도 보여준 상한까지만 받는다", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    await l.grantSignupBonus("u1");
    const hold = await l.hold("u1", "notice_analysis", "job2");
    const { charged } = await l.settle(hold, { inputTokens: 50_000, outputTokens: 10_000 });
    expect(charged).toBe(6);
  });

  it("로컬 모델 사용은 0 크레딧", () => {
    expect(creditsForUsage({ inputTokens: 9999, outputTokens: 9999 }, "local")).toBe(0);
  });

  it("잔액이 부족하면 예약이 거절된다", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    await expect(l.hold("u2", "reels_plan", "x")).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});
