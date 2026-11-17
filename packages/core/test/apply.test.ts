import { describe, expect, it } from "vitest";
import { MockLLM } from "../src/llm/index.js";
import type { NoticeAnalysis } from "../src/notice/index.js";
import { addQuestion, applyUserEdits, buildCoachPrompt, charCount, clampToLimit, coachTurn, coachTurnByRules, COACH_SCHEMA, seemsRelated, startApplication } from "../src/apply/index.js";

const notice: NoticeAnalysis = {
  title: "갤럭시 대학생 서포터즈",
  preferred: ["SNS 콘텐츠 제작 경험자", "영상 편집 가능자"],
  activities: ["갤럭시 제품 활용 콘텐츠 제작", "SNS 홍보"],
  benefits: [],
  submissions: [],
  stages: [],
  questions: ["갤럭시 대학생 서포터즈에 지원한 동기를 작성해 주세요. (300자)", "본인의 역량과 경험을 작성해 주세요. (500자)"],
  signalKeywords: [],
};
const ctx = { notice, activityName: "갤럭시 대학생 서포터즈" };
const fresh = () => startApplication({ activityName: ctx.activityName, notice });

describe("지원서 시작", () => {
  it("공고 문항과 글자 수로 빈 양식을 만들고 코치가 첫 질문을 한다", () => {
    const a = fresh();
    expect(a.questions.map((q) => q.charLimit)).toEqual([300, 500]);
    expect(a.questions[0]!.type).toBe("motivation");
    expect(a.answers).toHaveLength(2);
    expect(a.focus).toBe(0);
    expect(a.chat[0]!.role).toBe("coach");
    expect(a.chat[0]!.text).toContain("문항은 2개");
  });
  it("문항이 없으면 문항을 넣어 달라고 하고, 직접 더할 수 있다", () => {
    const a = startApplication({ activityName: "x", notice: { ...notice, questions: [] } });
    expect(a.focus).toBe(-1);
    expect(a.chat[0]!.text).toContain("문항 추가");
    addQuestion(a, "만들고 싶은 콘텐츠를 제안해 주세요 (200자)");
    expect(a.questions[0]).toMatchObject({ charLimit: 200, type: "content_idea" });
    expect(a.focus).toBe(0);
  });
});

describe("규칙 기반 코치", () => {
  it("관련 없어 보이는 경험은 연결 고리를 묻는다", () => {
    const a = fresh();
    const r = coachTurnByRules(a, ctx, "고등학교 때 수학 과외를 2년 했어요");
    expect(r.app.chat.at(-1)!.text).toContain("이어져 보이지 않아요");
    expect(r.app.chat.at(-1)!.text).toContain("콘텐츠 제작이나 SNS");
  });
  it("관련 있는 경험이면 결과를 묻고, 결과를 들으면 초안을 넣고 다음 문항으로 간다", () => {
    const a = fresh();
    coachTurnByRules(a, ctx, "갤럭시 폰으로 찍은 릴스를 올렸어요");
    expect(a.chat.at(-1)!.text).toContain("결과");
    const r = coachTurnByRules(a, ctx, "조회수 1,200회가 나왔어요");
    expect(r.edits).toEqual([{ q: 0, change: expect.any(String) }]);
    expect(r.app.answers[0]!.text).toContain("조회수 1,200회");
    expect(r.app.focus).toBe(1);
    expect(r.app.chat.at(-1)!.text).toContain("2번");
  });
  it("'다음'이라고 하면 넘어가고, '1번' 하면 돌아온다", () => {
    const a = fresh();
    coachTurnByRules(a, ctx, "다음");
    expect(a.focus).toBe(1);
    coachTurnByRules(a, ctx, "1번 다시");
    expect(a.focus).toBe(0);
  });
  it("관련성 판단: 공고 단어나 연결 단어가 있으면 관련 있다고 본다", () => {
    expect(seemsRelated("학생회 홍보물 제작", "지원 동기", notice, "갤럭시")).toBe(true);
    expect(seemsRelated("과외 2년", "지원 동기", notice, "갤럭시")).toBe(false);
  });
});

describe("AI 코치", () => {
  it("스키마는 구조화 출력 규칙을 지킨다", () => {
    const check = (s: Record<string, unknown>) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required as string[])].sort()).toEqual(Object.keys(s.properties as object).sort());
        for (const v of Object.values(s.properties as Record<string, Record<string, unknown>>)) check(v);
      }
      if (s.type === "array") check(s.items as Record<string, unknown>);
    };
    check(COACH_SCHEMA as unknown as Record<string, unknown>);
  });

  it("프롬프트에 문항·글자 수·지금 글·공고를 넣고, 지어내지 말라고 한다. 새 메시지는 따로 넣는다", () => {
    const a = fresh();
    const p = buildCoachPrompt(a, notice, ctx.activityName, "새로운메시지123");
    expect(p.system).toContain("지어내지");
    expect(p.system).toContain("관련이 약해 보이면");
    expect(p.user).toContain("300");
    expect(p.user).toContain("SNS 콘텐츠 제작 경험자");
    expect(p.user).toContain("<사용자_새_메시지>\n새로운메시지123");
    expect(p.user.match(/새로운메시지123/g)).toHaveLength(1);
  });

  it("AI 답을 대화와 양식에 반영한다 (범위 밖 문항은 무시, 글자 수 초과는 자른다)", async () => {
    const long = "가".repeat(400) + ".";
    const llm = new MockLLM(() =>
      JSON.stringify({
        reply: "1번 초안을 써 봤어요. 결과를 숫자로 알려 주실 수 있나요?",
        focus: 0,
        updates: [{ q: 0, text: long, change: "계기 문단 추가" }, { q: 9, text: "무시", change: "x" }],
        facts: ["갤럭시 폰으로 릴스 촬영"],
      }),
    );
    const r = await coachTurn(fresh(), ctx, "갤럭시로 릴스 찍었어요", llm);
    expect(r.model).toBe("mock");
    expect(r.edits).toEqual([{ q: 0, change: "계기 문단 추가" }]);
    expect(charCount(r.app.answers[0]!.text)).toBeLessThanOrEqual(300);
    expect(r.app.answers[0]!.by).toBe("coach");
    expect(r.app.facts).toContain("갤럭시 폰으로 릴스 촬영");
    expect(r.app.chat.map((m) => m.role)).toEqual(["coach", "user", "coach"]);
    expect(r.app.chat.at(-1)!.edits).toEqual([{ q: 0, change: "계기 문단 추가" }]);
  });

  it("AI가 빈 답을 주면 규칙 기반 코치가 대신 답한다 (사용자 말은 한 번만 기록)", async () => {
    const r = await coachTurn(fresh(), ctx, "수학 과외 2년", new MockLLM(() => "{}"));
    expect(r.model).toBe("rules");
    expect(r.app.chat.filter((m) => m.role === "user")).toHaveLength(1);
    expect(r.app.chat.at(-1)!.text).toContain("이어져 보이지 않아요");
  });
});

describe("양식", () => {
  it("사용자가 고친 글은 by=user로 남는다", () => {
    const a = applyUserEdits(fresh(), [{ q: 1, text: "제가 직접 쓴 문장" }, { q: 7, text: "x" }]);
    expect(a.answers[1]).toMatchObject({ text: "제가 직접 쓴 문장", by: "user" });
  });
  it("글자 수를 넘으면 문장 끝에서 자른다", () => {
    const t = "첫 문장입니다. 둘째 문장입니다. 셋째 문장은 아주 깁니다.";
    const c = clampToLimit(t, 20);
    expect(charCount(c)).toBeLessThanOrEqual(20);
    expect(c.endsWith("다.")).toBe(true);
  });
});
