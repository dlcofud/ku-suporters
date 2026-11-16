import { describe, expect, it } from "vitest";
import { planSchedule, distributeFormats, changeFormat, remainingContents } from "../src/planner/index.js";
import { diffDays } from "../src/shared.js";

describe("planner", () => {
  const plan = planSchedule({ today: "2026-11-16", deadline: "2026-12-04", newAccount: true, activityName: "달콤제과 서포터즈 13기" });

  it("마감 전 고정 일정(포트폴리오 D-3, 최종 점검 D-1, 마감)을 넣는다", () => {
    const byKind = (k: string) => plan.items.find((i) => i.kind === k)!;
    expect(byKind("portfolio").date).toBe("2026-12-01");
    expect(byKind("final_check").date).toBe("2026-12-03");
    expect(byKind("deadline").date).toBe("2026-12-04");
  });

  it("콘텐츠는 2~3일 간격이고 첫 콘텐츠는 자기소개 릴스", () => {
    const contents = plan.items.filter((i) => i.kind === "content");
    expect(contents[0]).toMatchObject({ date: "2026-11-16", format: "reels", status: "today" });
    for (let i = 1; i < contents.length; i++) {
      const gap = diffDays(contents[i - 1]!.date, contents[i]!.date);
      expect(gap).toBeGreaterThanOrEqual(2);
      expect(gap).toBeLessThanOrEqual(3);
    }
    expect(contents.every((c) => c.date <= "2026-11-30")).toBe(true);
  });

  it("중간 성과 점검을 넣고 날짜순으로 정렬한다", () => {
    expect(plan.items.some((i) => i.kind === "checkpoint")).toBe(true);
    const dates = plan.items.map((i) => i.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("포맷 비율대로 섞는다", () => {
    const f = distributeFormats(10, { reels: 0.5, cardnews: 0.3, post: 0.2 });
    expect(f.filter((x) => x === "reels")).toHaveLength(5);
    expect(f.filter((x) => x === "cardnews")).toHaveLength(3);
    expect(f[0]).toBe("reels");
    expect(f[1]).not.toBe("reels");
  });

  it("피드백 제안으로 포맷을 바꿀 수 있다", () => {
    const target = plan.items.find((i) => i.kind === "content" && i.format === "cardnews")!;
    const next = changeFormat(plan, target.id, "reels");
    expect(next.items.find((i) => i.id === target.id)!.format).toBe("reels");
    expect(remainingContents(next)).toBe(remainingContents(plan));
  });

  it("마감이 너무 가까우면 오류", () => {
    expect(() => planSchedule({ today: "2026-12-03", deadline: "2026-12-04" })).toThrow();
  });
});
