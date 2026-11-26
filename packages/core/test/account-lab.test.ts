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
  it("재료를 넣으면 다음 질문으로 넘어가고 중요한 단어를 뽑는다", () => {
    let lab = account.emptyLab();
    expect(account.nextQuestion(lab)?.slot).toBe("direction");
    lab = account.addIngredient(lab, { slot: "direction", text: "  일상 · 성장을 기록하는 공감형  " }, "t");
    expect(lab.ingredients[0]!.text).toBe("일상 · 성장을 기록하는 공감형");
    expect(lab.ingredients[0]!.words).toEqual(["일상", "성장", "공감형"]);
    expect(account.nextQuestion(lab)?.slot).toBe("audience");
    expect(lab.chat.map((c) => c.role)).toEqual(["lab", "me"]);
    // 같은 칸은 바꾼다
    lab = account.addIngredient(lab, { slot: "direction", text: "리뷰형" }, "t");
    expect(lab.ingredients).toHaveLength(1);
    expect(account.canBrew(lab)).toBe(false);
    expect(account.canBrew(filled(3))).toBe(true);
    expect(account.removeIngredient(filled(2), "direction").ingredients.map((i) => i.slot)).toEqual(["audience"]);
  });

  it("중요한 단어: 조사 · 동사 · 흔한 말을 빼고 명사만", () => {
    expect(account.extractKeywords("컴퓨터학과인데 레시피를 손글씨로 정리해요")).toEqual(["컴퓨터학과", "레시피", "손글씨"]);
    expect(account.extractKeywords("자취 시작한 새내기")).toEqual(["자취", "새내기"]);
    expect(account.extractKeywords("사진 · 영상을 잘 찍어요")).toEqual(["사진", "영상"]);
    expect(account.extractKeywords("@cook_note 같은 밝은 분위기")).toEqual(["@cook_note", "분위기"]);
    expect(account.extractKeywords("첫 노트북을 고르는 문과 새내기")).toEqual(["노트북", "문과", "새내기"]);
    expect(account.extractKeywords("아직 잘 모르겠어요")).toEqual([]);
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
    // 대표 단어: 여러 답에 겹친 단어가 없으면 '전할 것'의 첫 단어
    expect(b.word).toBe(lab.ingredients.find((i) => i.slot === "message")!.words![0]);
  });

  it("AI 결과를 다듬고, 빠진 칸은 기본 결과로 채운다", async () => {
    const lab = filled(3);
    const r = await account.brewWithLLM(lab, ctx, fake({ word: "자취 요리", identity: "자취 새내기에게 10분 요리를 알려 주는 계정", names: ["채령 | 자취 요리 기록", "x".repeat(50)], bios: [{ concept: "약속형", text: "가".repeat(200), why: "이유" }], pillars: [], steps: [], expand: { threads: "질문을 던져요", blog: "" }, fit: "연결돼요" }), "t");
    expect(r.value.word).toBe("자취요리");
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

describe("프로필 초안", () => {
  it("초안 비교는 공백 차이를 무시한다", () => {
    expect(account.sameField("자취 요리 \n기록 ", "자취 요리\n기록")).toBe(true);
    expect(account.sameField(undefined, "")).toBe(true);
    expect(account.sameField("a", "b")).toBe(false);
  });
});
