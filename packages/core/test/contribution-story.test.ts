import { describe, expect, it } from "vitest";
import { CreditLedger, MemoryCreditStore } from "../src/credits/index.js";
import { newContribution, recordConsents, validateForSubmit, computeReward, submit, startReview, decide, checksNeeded, STORY_MIN, CONSENT_VERSION } from "../src/contribution/index.js";
import { buildTrendReport, type CuratedReview } from "../src/trends/index.js";

const allConsents = { copyright_use: true, personal_info: true, withdrawal_info: true, own_work: true };
const t = "2026-11-20T10:00:00.000Z";
const story = "동아리 인스타 계정을 1년 동안 운영하면서 팔로워를 300명에서 1,000명으로 늘린 경험을 지원 동기에 썼어요. ".repeat(3);

function storyOnly(result: "final_pass" | "fail" = "final_pass") {
  const c = { ...newContribution("c2", "u2", "crown-12", "크라운제과 서포터즈 12기"), result, story, field: "F&B·식품" };
  return recordConsents(c, allConsents, t);
}

describe("후기만 써서 공유하기", () => {
  it("인스타 연결 없이 후기만 있어도 낼 수 있고, 증빙은 선택이다", () => {
    expect(story.length).toBeGreaterThanOrEqual(STORY_MIN);
    expect(validateForSubmit(storyOnly())).toEqual([]);
    expect(CONSENT_VERSION).toBe("2026-11-v2");
  });
  it("후기가 짧거나, 게시물도 후기도 없으면 막는다", () => {
    expect(validateForSubmit({ ...storyOnly(), story: "짧아요" })[0]).toContain(`${STORY_MIN}자 이상`);
    expect(validateForSubmit({ ...storyOnly(), story: undefined })[0]).toContain("게시물을 고르거나");
    expect(validateForSubmit({ ...storyOnly(), selectedMediaIds: ["m1"] })).toContain("게시물을 공유하려면 인스타그램 계정을 연결해 주세요");
  });
  it("후기 보상 +20, 증빙까지 내면 +40", () => {
    expect(computeReward(storyOnly())).toMatchObject({ total: 20 });
    expect(computeReward({ ...storyOnly(), proofUploadRef: "p.png" }).total).toBe(40);
  });
  it("체크리스트는 낸 것에 맞춰서만 묻는다", () => {
    expect(checksNeeded(storyOnly())).toEqual(["story_is_own", "not_duplicate"]);
    expect(checksNeeded({ ...storyOnly(), proofUploadRef: "p.png", selectedMediaIds: ["m"] })).toEqual([
      "proof_matches_activity", "proof_shows_result", "personal_info_hidden", "media_owned_by_account", "story_is_own", "not_duplicate",
    ]);
  });
  it("승인하면 크레딧이 확정되고 후기 원문은 지운다", async () => {
    const l = new CreditLedger(new MemoryCreditStore());
    let c = await submit(storyOnly(), l, t);
    expect(await l.balance("u2")).toMatchObject({ incoming: 20 });
    c = startReview(c, "admin", t);
    await expect(decide(c, { reviewerId: "admin", checks: { not_duplicate: true }, decision: "approve" }, l, t)).rejects.toThrow(/본인 경험/);
    c = await decide(c, { reviewerId: "admin", checks: { story_is_own: true, not_duplicate: true }, decision: "approve" }, l, t);
    expect(c.story).toBeUndefined();
    expect(c.rewardTotal).toBe(20);
    expect(await l.balance("u2")).toMatchObject({ posted: 20, incoming: 0 });
  });
});

describe("합격 경향은 불합격 후기를 뺀다", () => {
  it("불합격 행은 표본에 들어가지 않는다", () => {
    const base = { sourceType: "", sourceCitation: "", org: "A", activity: "1기", field: "F", scores: { E1: 2 }, formats: "", keywords: [], processKeywords: [], tip: "", reliability: "", reviewStatus: "AI 초안" };
    const rows = [
      { ...base, id: "a", url: "u1", result: "최종 합격" },
      { ...base, id: "b", url: "u2", result: "불합격" },
    ] as CuratedReview[];
    expect(buildTrendReport(rows).sampleSize).toBe(1);
  });
});
