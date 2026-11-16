import { describe, expect, it } from "vitest";
import { summarize, suggest, achievementSentence, type MediaMetrics } from "../src/feedback/index.js";
import { planSchedule } from "../src/planner/index.js";

const media: MediaMetrics[] = [
  { id: "a", date: "2026-11-10", format: "reels", views: 1820, likes: 96, comments: 5, saves: 12 },
  { id: "b", date: "2026-11-12", format: "cardnews", views: 640, likes: 41, comments: 2, saves: 23 },
  { id: "c", date: "2026-11-14", format: "post", views: 380, likes: 52, comments: 3, saves: 4 },
  { id: "d", date: "2026-11-16", format: "reels", views: 2380, likes: 130, comments: 9, saves: 18 },
];

describe("feedback", () => {
  const s = summarize(media);

  it("포맷별로 요약한다", () => {
    expect(s).toMatchObject({ count: 4, avgViews: 1305, totalSaves: 57 });
    expect(s.topByViews?.format).toBe("reels");
    expect(s.topBySaves?.format).toBe("cardnews");
    expect(s.byFormat.find((f) => f.format === "reels")?.avgViews).toBe(2100);
  });

  it("저장이 많은 포맷은 유지, 약한 포맷 일정은 바꾸자고 제안한다", () => {
    const plan = planSchedule({ today: "2026-11-16", deadline: "2026-12-04" });
    const sug = suggest(s, plan);
    expect(sug.some((x) => x.kind === "keep_format")).toBe(true);
    const sw = sug.find((x) => x.kind === "switch_format");
    if (sw) {
      expect(sw.toFormat).toBe("reels");
      expect(plan.items.find((i) => i.id === sw.planItemId)?.format).toBe("post");
    }
  });

  it("지원서용 성과 문장은 실제 숫자만 쓴다", () => {
    expect(achievementSentence(s, "2026-11-10", "2026-11-16")).toBe(
      "지원을 위해 연 계정에서 7일간 콘텐츠 4개를 운영했고, 릴스로 최고 조회수 2,380회를 기록했습니다.",
    );
    expect(achievementSentence(summarize([]), "2026-11-10", "2026-11-16")).toBeNull();
  });
});
