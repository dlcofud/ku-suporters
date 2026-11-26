import { describe, expect, it } from "vitest";
import { account } from "../src/index.js";
import type { LLMClient } from "../src/llm/index.js";

const ctx: account.LabContext = { activityName: "갤럭시 대학생 서포터즈", brand: "갤럭시", noticeWords: ["릴스", "카드뉴스"], trendStrong: ["분야 연결 경험"], profile: { username: "chae", name: "채령", interest: "자취 요리", source: "manual", at: "2026-11-26" } };

const fake = (answer: unknown): LLMClient => ({ model: "fake-1", tier: "paid", complete: async () => ({ text: JSON.stringify(answer), model: "fake-1", inputTokens: 10, outputTokens: 20 }) }) as LLMClient;

function filled(n: number) {
  let lab = account.emptyLab();
  for (const q of account.LAB_QUESTIONS.slice(0, n)) lab = account.addIngredient(lab, { slot: q.slot, text: `${q.slot} 답` }, "t");
  return lab;
}

describe("계정 실험실", () => {
  it("재료를 넣을수록 다음 질문으로 넘어가고 생명체가 자란다", () => {
    let lab = account.emptyLab();
    expect(account.stageOf(lab)).toBe(0);
    expect(account.nextQuestion(lab)?.slot).toBe("direction");
    lab = account.addIngredient(lab, { slot: "direction", text: "  리뷰형  " }, "t");
    expect(lab.ingredients[0]!.text).toBe("리뷰형");
    expect(account.stageOf(lab)).toBe(1);
    expect(account.nextQuestion(lab)?.slot).toBe("audience");
    expect(lab.chat.map((c) => c.role)).toEqual(["lab", "me"]);
    // 같은 칸은 바꾼다
    lab = account.addIngredient(lab, { slot: "direction", text: "공감형" }, "t");
    expect(lab.ingredients).toHaveLength(1);
    expect(account.canBrew(lab)).toBe(false);
    expect(account.canBrew(filled(3))).toBe(true);
    expect(account.stageOf(filled(6))).toBe(5);
    expect(account.stageOf({ ...filled(3), brew: account.brewByRules(filled(3), ctx, "t") })).toBe(6);
    expect(account.removeIngredient(filled(2), "direction").ingredients.map((i) => i.slot)).toEqual(["audience"]);
  });

  it("규칙 기반 결과는 사용자의 말로 만들고 길이 제한을 지킨다", () => {
    let lab = account.emptyLab();
    lab = account.addIngredient(lab, { slot: "direction", text: "제품을 써 보는 리뷰형" }, "t");
    lab = account.addIngredient(lab, { slot: "audience", text: "첫 노트북을 고르는 새내기" }, "t");
    lab = account.addIngredient(lab, { slot: "message", text: "비싼 장비 없이도 충분하다" }, "t");
    const b = account.brewByRules(lab, ctx, "t");
    expect(b.identity).toContain("첫 노트북을 고르는 새내기");
    expect(b.bios).toHaveLength(3);
    for (const x of b.bios) expect(x.text.length).toBeLessThanOrEqual(150);
    for (const n of b.names) expect(n.length).toBeLessThanOrEqual(30);
    expect(b.pillars.map((p) => p.kind)).toEqual(["teach", "relate", "show"]);
    expect(b.model).toBe("rules");
  });

  it("AI 결과를 다듬고, 빠진 칸은 기본 결과로 채운다", async () => {
    const lab = filled(3);
    const r = await account.brewWithLLM(lab, ctx, fake({ creature: "자취몬", identity: "자취 새내기에게 10분 요리를 알려 주는 계정", names: ["채령 | 자취 요리 기록", "x".repeat(50)], bios: [{ concept: "약속형", text: "가".repeat(200), why: "이유" }], pillars: [], steps: [], expand: { threads: "질문을 던져요", blog: "" }, fit: "연결돼요" }), "t");
    expect(r.value.creature).toBe("자취몬");
    expect(r.value.names[1]!.length).toBe(30);
    expect(r.value.bios[0]!.text.length).toBe(150);
    expect(r.value.pillars).toHaveLength(3); // 3개가 아니면 기본 기둥
    expect(r.value.steps.length).toBeGreaterThan(0);
    expect(r.value.expand.blog).not.toBe("");
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it("대화: 바꿨을 때만 결과를 돌려준다", async () => {
    const lab = { ...filled(3), brew: account.brewByRules(filled(3), ctx, "t") };
    const same = await account.labChatWithLLM(lab, ctx, "왜 이 이름이야?", fake({ reply: "검색 키워드라서요", changed: false, brew: {} }), "t");
    expect(same.value.brew).toBeUndefined();
    const changed = await account.labChatWithLLM(lab, ctx, "더 유쾌하게", fake({ reply: "말투를 바꿨어요", changed: true, brew: { ...lab.brew, identity: "유쾌한 계정" } }), "t");
    expect(changed.value.brew?.identity).toBe("유쾌한 계정");
    expect(changed.value.reply).toBe("말투를 바꿨어요");
  });
});

describe("회차마다 다른 생명체", () => {
  it("seed로 종류와 색이 정해지고 4종 × 5색이 모두 나온다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const v = account.variantOf(i);
      seen.add(`${v.species}-${v.hue}`);
    }
    expect(seen.size).toBe(20);
    expect(account.variantOf(undefined)).toEqual(account.variantOf(0));
    expect(account.stageName(4, "cactus")).toBe("어린 선인장");
    expect(account.stageName(6, "slime")).toBe("왕관 슬라임");
    expect(account.stageName(1, "mushroom")).toBe("씨앗");
  });

  it("초안 비교는 공백 차이를 무시한다", () => {
    expect(account.sameField("자취 요리 \n기록 ", "자취 요리\n기록")).toBe(true);
    expect(account.sameField(undefined, "")).toBe(true);
    expect(account.sameField("a", "b")).toBe(false);
  });
});
