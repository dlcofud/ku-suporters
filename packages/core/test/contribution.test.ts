import { describe, expect, it } from "vitest";
import { CreditLedger, MemoryCreditStore } from "../src/credits/index.js";
import {
  newContribution, recordConsents, validateForSubmit, computeReward, submit, startReview, decide, withdraw, ContributionError,
} from "../src/contribution/index.js";

const allConsents = { copyright_use: true, personal_info: true, withdrawal_info: true, own_work: true };
const t = "2026-12-19T10:00:00.000Z";
const passChecks = {
  proof_matches_activity: true, proof_shows_result: true, personal_info_hidden: true, media_owned_by_account: true, not_duplicate: true,
};

function ready(result: "final_pass" | "fail" = "final_pass") {
  let c = newContribution("c1", "u1", "dalkom-13", "달콤제과 서포터즈 13기");
  c = { ...c, result, igAccountId: "ig1", selectedMediaIds: ["m1", "m2"], structure: [{ question: "지원 동기", emphasis: ["E8"] }] };
  if (result !== "fail") c = { ...c, proofUploadRef: "uploads/proof.png", proofRedacted: true };
  return recordConsents(c, allConsents, t);
}

describe("contribution", () => {
  it("필수 동의가 없으면 제출할 수 없다", () => {
    const c = recordConsents({ ...ready(), consents: [] }, { copyright_use: true }, t);
    expect(validateForSubmit(c).length).toBeGreaterThanOrEqual(3);
  });

  it("합격자 보상은 10 + 20 + 20, 불합격자는 증빙 보상 없음", () => {
    expect(computeReward(ready()).total).toBe(50);
    expect(computeReward(ready("fail")).total).toBe(30);
  });

  it("제출하면 지급 예정, 승인하면 확정되고 증빙은 삭제 대상", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    let c = await submit(ready(), l, t);
    expect(await l.balance("u1")).toMatchObject({ posted: 0, incoming: 50 });
    c = startReview(c, "admin", t);
    c = await decide(c, { reviewerId: "admin", checks: passChecks, decision: "approve" }, l, t);
    expect(c.status).toBe("approved");
    expect(c.proofUploadRef).toBeUndefined();
    expect(await l.balance("u1")).toMatchObject({ posted: 50, incoming: 0 });
  });

  it("검수 항목이 빠지면 승인할 수 없고, 반려하면 보상이 취소된다", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    let c = startReview(await submit(ready(), l, t), "admin", t);
    await expect(decide(c, { reviewerId: "admin", checks: { not_duplicate: true }, decision: "approve" }, l, t)).rejects.toBeInstanceOf(ContributionError);
    c = await decide(c, { reviewerId: "admin", checks: {}, decision: "reject", reason: "활동명이 다름" }, l, t);
    expect(c.status).toBe("rejected");
    expect(await l.balance("u1")).toMatchObject({ posted: 0, incoming: 0 });
  });

  it("같은 활동으로 두 번 제출해도 보상은 한 번", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    await submit(ready(), l, t);
    await submit({ ...ready(), id: "c2" }, l, t);
    expect((await l.balance("u1")).incoming).toBe(50);
  });

  it("검수 중 철회하면 데이터를 비우고 지급 예정 보상을 취소한다", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    let c = startReview(await submit(ready(), l, t), "admin", t);
    c = await withdraw(c, l, t);
    expect(c).toMatchObject({ status: "withdrawn", selectedMediaIds: [], igAccountId: undefined });
    expect((await l.balance("u1")).incoming).toBe(0);
  });
});
