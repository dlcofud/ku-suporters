import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeNotice, toActionGuides, findDates, analyzeNoticeWithLLM } from "../src/notice/index.js";
import { MockLLM } from "../src/llm/index.js";

const text = readFileSync(new URL("./fixtures/notice.txt", import.meta.url), "utf8");

describe("notice", () => {
  it("날짜 형식을 여러 가지로 찾는다", () => {
    expect(findDates("2026.12.04까지, 발표 12월 18일", 2026)).toEqual(["2026-12-04", "2026-12-18"]);
  });

  it("공고에서 마감일·발표일·우대사항·문항을 뽑는다", () => {
    const a = analyzeNotice(text, { referenceYear: 2026 });
    expect(a.deadline).toBe("2026-12-04");
    expect(a.announcementDate).toBe("2026-12-18");
    expect(a.preferred).toHaveLength(3);
    expect(a.questions).toHaveLength(3);
    expect(a.submissions).toEqual(expect.arrayContaining(["application", "portfolio", "sns_link", "pre_mission"]));
    expect(a.stages).toEqual(expect.arrayContaining(["document", "interview", "pre_mission"]));
    expect(a.benefits.join(" ")).toContain("20만원");
  });

  it("우대사항을 행동 지침으로 바꾼다", () => {
    const g = toActionGuides(analyzeNotice(text, { referenceYear: 2026 }));
    const kws = g.map((x) => x.keyword);
    expect(kws).toEqual(expect.arrayContaining(["#성과수치", "#툴능력", "#분야경험", "#포폴압축"]));
  });

  it("규칙으로 충분하면 LLM을 부르지 않는다", async () => {
    let called = false;
    const llm = new MockLLM(() => {
      called = true;
      return "{}";
    });
    const r = await analyzeNoticeWithLLM(text, llm, { referenceYear: 2026 });
    expect(called).toBe(false);
    expect(r.usage.inputTokens).toBe(0);
  });

  it("규칙으로 못 찾은 항목만 LLM으로 채운다", async () => {
    const llm = new MockLLM(() => '```json\n{"deadline":"2026-12-10","preferred":["SNS 운영자"],"questions":["지원 동기"]}\n```');
    const r = await analyzeNoticeWithLLM("짧은 공고", llm, { referenceYear: 2026 });
    expect(r.analysis.deadline).toBe("2026-12-10");
    expect(r.analysis.preferred).toEqual(["SNS 운영자"]);
    expect(r.usage.inputTokens).toBeGreaterThan(0);
  });
});
