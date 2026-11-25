import { describe, expect, it } from "vitest";
import { trends } from "../src/index.js";
import type { LLMClient } from "../src/llm/index.js";

const sc = (o: Partial<Record<string, trends.Mark>>) =>
  Object.fromEntries(trends.CODES.map((c) => [c, c in o ? o[c]! : null])) as Record<(typeof trends.CODES)[number], trends.Mark>;

function review(ai: Record<string, trends.Mark>, cross?: Record<string, trends.Mark>): trends.CodedReview {
  const r: trends.CodedReview = {
    id: "r1",
    meta: { url: "https://x.test/1", sourceName: "x" },
    ai: { scores: sc(ai), evidence: {} as never, summary: "", keywords: [], processKeywords: [], formats: [], tip: "", detected: { org: "", activity: "", result: "" }, model: "sheet", inputTokens: 0, outputTokens: 0, codedAt: "t" },
    codebook: 2,
    status: "AI 초안",
    createdBy: "sheet",
    createdAt: "t",
  };
  if (cross) {
    const b = sc(cross);
    r.cross = { ok: true, scores: b, model: "m", at: "t", ...trends.compareScores(r.ai.scores, b) };
  }
  return r;
}

const fakeLLM = (answer: unknown): LLMClient => ({
  name: "fake",
  complete: async () => ({ text: JSON.stringify(answer), model: "judge-1", inputTokens: 1, outputTokens: 1 }),
}) as unknown as LLMClient;

describe("자동 검수", () => {
  it("교차 검수와 모두 같으면 그대로 검수 완료 (auto)", () => {
    const r = review({ E4: 2, E8: 1 }, { E4: 2, E8: 1 });
    expect(trends.autoState(r)).toBe("todo");
    expect(trends.finalizeAuto(r, "now")).toBe(true);
    expect(r.status).toBe("검수 완료");
    expect(r.human).toMatchObject({ via: "auto", reviewer: trends.AUTO_REVIEWER });
    expect(r.human!.scores.E4).toBe(2);
    expect(r.human!.scores.E1).toBeNull();
  });

  it("다르면 판정 없이는 확정하지 않는다", () => {
    const r = review({ E4: 2 }, { E4: 1, E2: 0 });
    expect(trends.finalizeAuto(r, "now")).toBe(false);
    expect(r.status).toBe("AI 초안");
  });

  it("다른 코드만 AI 판정 점수로 바꾸고 나머지는 기존 점수를 쓴다", async () => {
    const r = review({ E4: 2, E8: 2 }, { E4: 1, E2: 0, E8: 2 });
    expect(r.cross?.ok && r.cross.diff).toEqual(["E2", "E4"]);
    const llm = fakeLLM({ E2: { score: "-", reason: "콘텐츠 이야기는 없음" }, E4: { score: "1", reason: "경험은 말하지만 연결은 없음" } });
    r.judge = await trends.judgeWithLLM("본문", r.meta, ["E2", "E4"], r.ai.scores, (r.cross as { scores: Record<string, trends.Mark> }).scores as never, llm, "now");
    expect(trends.finalizeAuto(r, "now")).toBe(true);
    expect(r.human!.via).toBe("ai-judge");
    expect(r.human!.scores).toMatchObject({ E2: null, E4: 1, E8: 2 });
    expect(trends.judgeRows(r).map((x) => [x.code, x.a, x.b, x.final])).toEqual([["E2", null, 0, null], ["E4", 2, 1, 1]]);
  });

  it("판정 답에 코드가 빠지면 오류", async () => {
    const r = review({ E4: 2 }, { E4: 1 });
    await expect(trends.judgeWithLLM("본문", r.meta, ["E4"], r.ai.scores, r.ai.scores, fakeLLM({}), "now")).rejects.toThrow(/E4/);
  });

  it("원문을 못 읽었거나 판정이 실패하면 관리자 확인 필요", () => {
    const a = review({ E4: 2 });
    a.cross = { ok: false, error: "원문을 가져오지 못했어요", at: "t" };
    expect(trends.autoState(a)).toBe("needs-human");
    expect(trends.autoProblem(a)).toMatch(/원문/);
    const b = review({ E4: 2 }, { E4: 1 });
    b.judge = { ok: false, error: "AI가 답하지 못했어요", at: "t" };
    expect(trends.autoState(b)).toBe("needs-human");
  });

  it("자동·AI 판정으로 확정한 행은 사람-AI 일치도에서 뺀다", () => {
    const r = review({ E4: 2 }, { E4: 2 });
    trends.finalizeAuto(r, "now");
    expect(trends.agreementByCode([r])[0]!.n).toBe(0);
  });
});
