import { describe, expect, it } from "vitest";
import { buildShootPrompt, normalizeShoot, planShootAI, shootTargetSec, type ShootBrief } from "../src/content/ai.js";
import { cutsFromTimes, parseSceneTimes } from "../src/content/node.js";
import type { LLMClient, LLMRequest } from "../src/llm/index.js";

const brief: ShootBrief = {
  activityName: "갤럭시 서포터즈", format: "reels", title: "도서관 루틴", purpose: "일상 속 제품", product: "갤럭시 버즈",
  refLinks: ["https://www.instagram.com/reel/abc"], refCuts: [1.2, 0.8, 2, 1.5], script: "시험 기간, 이어폰 하나로 집중 모드", subject: "흰색 이어폰, 노트북",
};
const scene = (i: number, d: number) => ({ role: "demo", shot: "close_up", durationSec: d, what: `장면 ${i}`, how: "책상 위 45도에서 고정", line: i === 0 ? "시험 기간 집중 모드" : "", onScreenText: "집중 ON", props: "이어폰", light: "창가 자연광", tip: "흔들리지 않게" });

describe("촬영 가이드", () => {
  it("길이: 고른 값 → 참고 릴스 컷 합 → 15초, 5~60초", () => {
    expect(shootTargetSec({ targetSec: 20 })).toBe(20);
    expect(shootTargetSec({ refCuts: [1.2, 0.8, 2, 1.5] })).toBe(5.5);
    expect(shootTargetSec({ refCuts: [1, 1] })).toBe(5);
    expect(shootTargetSec({ refCuts: [30, 40] })).toBe(60);
    expect(shootTargetSec({})).toBe(15);
  });

  it("프롬프트에 컷 길이·대본·사진 묶음이 들어가고 베끼지 말라는 규칙이 있다", () => {
    const p = buildShootPrompt(brief, { ref: 4, mood: 2, subject: 1 });
    expect(p.user).toContain("1.2");
    expect(p.user).toContain("시험 기간");
    expect(p.user).toContain("참고 장면 (처음 4장)");
    expect(p.system).toContain("그대로 베끼지 않습니다");
  });

  it("장면 길이를 목표에 맞추고 처음은 훅·끝은 마무리, 색은 #RRGGBB만", () => {
    const r = normalizeShoot({ analysis: { pace: "빠름", hook: "클로즈업", textStyle: "가운데 큰 자막", mood: "차분", palette: ["#F2E8DC", "베이지", "#334455"], sound: "로파이", structure: "문제→해결" }, scenes: [0, 1, 2, 3].map((i) => scene(i, [1.2, 0.8, 2, 1.5][i]!)), caption: "집중 모드 ON" }, brief)!;
    expect(r.scenes.map((x) => x.role)).toEqual(["hook", "demo", "demo", "cta"]);
    expect(r.scenes.map((x) => x.durationSec)).toEqual([1.2, 0.8, 2, 1.5]);
    expect(r.scenes[0]).toMatchObject({ how: "책상 위 45도에서 고정", line: "시험 기간 집중 모드", props: "이어폰", light: "창가 자연광" });
    expect(r.scenes[1]!.line).toBeUndefined();
    expect(r.analysis.palette).toEqual(["#F2E8DC", "#334455"]);
  });

  it("사진을 함께 보내고, 지어낸 숫자가 있는 캡션은 버린다", async () => {
    const seen: LLMRequest[] = [];
    const llm: LLMClient = {
      model: "x", tier: "paid", vision: true,
      async complete(req) {
        seen.push(req);
        return { text: JSON.stringify({ analysis: { pace: "", hook: "", textStyle: "", mood: "", palette: [], sound: "", structure: "" }, scenes: [0, 1, 2].map((i) => scene(i, 2)), caption: "조회수 10000회 달성!" }), inputTokens: 1, outputTokens: 1, model: "x" };
      },
    };
    const img = { mediaType: "image/jpeg" as const, data: "AA" };
    const r = await planShootAI(llm, brief, { ref: [img, img], mood: [img], subject: [] });
    expect(seen[0]!.images).toHaveLength(3);
    expect(seen[0]!.timeoutMs).toBe(40_000);
    expect(r.source).toBe("ai");
    expect(r.value.caption).toBe("");
  });
});

describe("화면 녹화 컷 나누기", () => {
  it("showinfo 로그에서 시각을 읽고, 0.4초 미만 컷은 앞 컷에 붙인다", () => {
    expect(parseSceneTimes("n:0 pts:1 pts_time:1.2 x\nn:1 pts:2 pts_time:2.0")).toEqual([1.2, 2]);
    expect(cutsFromTimes([1.2, 2, 2.2, 4], 5.5)).toEqual([1.2, 1, 1.8, 1.5]);
    expect(cutsFromTimes([], 3)).toEqual([3]);
  });
});
