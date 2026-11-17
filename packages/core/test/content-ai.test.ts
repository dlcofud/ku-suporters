import { describe, expect, it } from "vitest";
import { MockLLM, type LLMRequest } from "../src/llm/index.js";
import { planScenesAI, captionAI, suggestTopicsAI, inventedNumbers, normalizeScenes, planScenes, type ContentBrief } from "../src/content/index.js";

const brief: ContentBrief = {
  activityName: "갤럭시 대학생 서포터즈",
  format: "reels",
  title: "하루 루틴 속 브랜드",
  purpose: "내 생활에 브랜드를 녹여요",
  product: "갤럭시 버즈",
  idea: "도서관 가는 길에 노이즈 캔슬링 켜는 순간",
  notice: { activities: ["인스타그램 릴스 제작"], preferred: ["영상 편집 가능자"], signalKeywords: ["콘텐츠 제작"] },
};

const scenesJson = (n: number, dur = 4) =>
  JSON.stringify({
    scenes: Array.from({ length: n }, (_, i) => ({ role: i === 0 ? "context" : "demo", shot: i % 2 ? "selfie" : "nope", durationSec: dur, what: `장면 ${i + 1}`, onScreenText: `자막 ${i + 1}`, tip: "팁" })),
  });

describe("AI 장면 기획", () => {
  it("모델 장면을 받아 처음은 훅, 끝은 마무리, 길이 합은 목표로 맞춘다", async () => {
    let seen: LLMRequest | undefined;
    const llm = new MockLLM((req) => ((seen = req), scenesJson(5, 7)), "local");
    const r = await planScenesAI(llm, brief, { targetSec: 20 });
    expect(r.source).toBe("ai");
    expect(r.value[0]!.role).toBe("hook");
    expect(r.value.at(-1)!.role).toBe("cta");
    expect(r.value.reduce((s, x) => s + x.durationSec, 0)).toBe(20);
    expect(r.value.every((s) => s.durationSec >= 1.5 && (s.durationSec * 2) % 1 === 0)).toBe(true);
    expect(r.value[0]!.shot).toBe("medium"); // 모르는 구도는 상반신으로
    expect(seen!.user).toContain("노이즈 캔슬링"); // 사용자 아이디어를 프롬프트에 넣는다
    expect(seen!.schema).toBeTruthy();
  });

  it("장면이 3개 미만이거나 깨진 응답이면 규칙 기반 틀로 대신한다", async () => {
    const r1 = await planScenesAI(new MockLLM(() => scenesJson(2)), brief);
    expect(r1.source).toBe("rules");
    expect(r1.note).toBeTruthy();
    const r2 = await planScenesAI(new MockLLM(() => "음... 장면은요"), brief);
    expect(r2.source).toBe("rules");
    expect(normalizeScenes({ scenes: "x" }, 15)).toBeUndefined();
  });

  it("규칙 기반 틀은 특정 제품군(과자) 문구가 없다", () => {
    for (const style of ["review", "challenge", "routine"] as const) {
      const text = planScenes({ title: "t", product: "갤럭시 버즈", style }).map((s) => s.what + s.onScreenText + s.tip).join(" ");
      expect(text).not.toMatch(/편의점|식감|간식|한 입|바삭/);
      expect(text).toContain("갤럭시 버즈");
    }
  });
});

describe("AI 캡션", () => {
  const scenes = planScenes({ title: brief.title, product: brief.product });

  it("경험이 없으면 모델을 부르지 않고 질문을 돌려준다", async () => {
    let called = false;
    const r = await captionAI(new MockLLM(() => ((called = true), "{}")), brief, scenes, "  ", ["서포터즈"]);
    expect(called).toBe(false);
    expect(r.value.question).toContain("있었던 일");
    expect(r.value.caption).toContain("[여기에 내 경험");
  });

  it("경험으로 쓴 캡션을 받고, 해시태그가 빠졌으면 붙인다", async () => {
    const llm = new MockLLM(() => JSON.stringify({ caption: "도서관 가는 길, 버즈를 켜는 순간 조용해져요.", question: "" }), "local");
    const r = await captionAI(llm, brief, scenes, "도서관 가는 길에 노이즈 캔슬링 켜면 집중이 잘 돼요", ["서포터즈", "#갤럭시"]);
    expect(r.source).toBe("ai");
    expect(r.value.caption).toMatch(/#서포터즈 #갤럭시$/);
  });

  it("사용자가 말하지 않은 숫자를 넣으면 쓰지 않는다", async () => {
    const llm = new MockLLM(() => JSON.stringify({ caption: "하루 8시간 공부할 때 버즈와 함께, 조회수 1,000 돌파!", question: "" }));
    const r = await captionAI(llm, brief, scenes, "시험 기간에 도서관에서 버즈를 썼어요", []);
    expect(r.source).toBe("rules");
    expect(r.note).toContain("8");
    expect(r.value.caption).toContain("시험 기간에 도서관에서 버즈를 썼어요");
  });

  it("inventedNumbers: 쉼표 표기와 출처에 있는 숫자는 괜찮다", () => {
    expect(inventedNumbers("조회수 3,000회, 7기", ["3000회 나왔어요", "서포터즈 7기"])).toEqual([]);
    expect(inventedNumbers("별점 4.5", ["별점은 몰라요"])).toEqual(["4.5"]);
  });
});

describe("AI 캘린더 주제", () => {
  const slots = [
    { id: "p1", date: "2026-11-18", format: "reels" as const, title: "신제품 3초 리뷰" },
    { id: "p2", date: "2026-11-21", format: "cardnews" as const, title: "공식 SNS 분석" },
    { id: "p3", date: "2026-11-24", format: "post" as const, title: "직접 찍은 사진 기록" },
  ];

  it("슬롯 id에 맞는 주제만 받고, 모르는 id·겹치는 제목은 버린다", async () => {
    const llm = new MockLLM(() =>
      JSON.stringify({
        topics: [
          { id: "p1", title: "도서관 가는 길 버즈 루틴", purpose: "일상 속 활용" },
          { id: "p2", title: "도서관 가는 길 버즈 루틴", purpose: "중복" },
          { id: "p9", title: "없는 슬롯", purpose: "" },
          { id: "p3", title: "갤럭시 캠퍼스 사진", purpose: "" },
        ],
      }),
    );
    const r = await suggestTopicsAI(llm, { activityName: brief.activityName, notice: brief.notice }, slots);
    expect(r.source).toBe("ai");
    expect(Object.keys(r.value).sort()).toEqual(["p1", "p3"]);
    expect(r.value.p3!.purpose).toBeTruthy();
    expect(r.note).toContain("1개");
  });

  it("깨진 응답이면 아무것도 바꾸지 않는다", async () => {
    const r = await suggestTopicsAI(new MockLLM(() => "no"), { activityName: "x" }, slots);
    expect(r.value).toEqual({});
    expect(r.source).toBe("rules");
  });
});
