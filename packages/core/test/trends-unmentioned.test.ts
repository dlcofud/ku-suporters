import { describe, expect, it } from "vitest";
import { buildTrendReport, blankLegacyZeros, parseCuratedCsv, type CuratedReview } from "../src/trends/index.js";
import { clampMark, upgradeCoded, toCurated, compareScores, codeReviewByRules, markSum, type CodedReview } from "../src/trends/coding.js";
import { checkSheet, REQUIRED_HEADERS } from "../src/trends/sheet.js";

const row = (scores: CuratedReview["scores"]): CuratedReview => ({
  id: "x", sourceType: "", url: "https://e.x/" + Math.random(), sourceCitation: "", org: "A", activity: "", field: "", result: "최종 합격",
  scores, formats: "", keywords: [], processKeywords: [], tip: "", reliability: "", reviewStatus: "",
});

describe("언급 없음은 평가에서 뺀다", () => {
  it("빈칸(언급 없음)은 평균·2점 비율·n에서 빠지고, 0점(언급만 함)은 들어간다", () => {
    const r = buildTrendReport([row({ E1: 2 }), row({ E1: 0 }), row({}), row({})]);
    const e1 = r.elementAverages.find((e) => e.code === "E1")!;
    expect(e1).toMatchObject({ n: 2, avg: 1, strongShare: 0.5, rate: 0.5 });
    // 예전처럼 언급 없음을 0으로 셌다면 평균 0.5였다
  });
  it("점수 글자: 2·1·0은 점수, '-'·빈칸·null은 언급 없음", () => {
    expect([2, "1", 0, "0", "-", "", null, undefined, "3"].map(clampMark)).toEqual([2, 1, 0, 0, null, null, null, null, null]);
    expect(markSum({ E1: 2, E2: null, E3: 0 })).toBe(2);
  });
  it("규칙 기반 초안은 단서가 없으면 언급 없음", () => {
    const c = codeReviewByRules("팀 활동이 있었어요");
    expect(c.scores.E7).toBe(1);
    expect(c.scores.E1).toBeNull();
    expect(c.evidence.E1).toBe("언급 없음");
  });
  it("언급 없음 ↔ 0점도 다른 점수로 본다", () => {
    const a = { E1: null, E2: 1, E3: 1, E4: 1, E5: 1, E6: 1, E7: 1, E8: 1 } as const;
    expect(compareScores({ ...a }, { ...a, E1: 0 })).toEqual({ verdict: "near", diff: ["E1"] });
    expect(compareScores({ ...a }, { ...a, E1: 2 }).verdict).toBe("differ");
  });
});

describe("코드북 1판 데이터 읽기 (0점 = 언급 없음이었다)", () => {
  const old: CodedReview = {
    id: "rv1", meta: { url: "https://e.x/1", sourceName: "링커리어" }, status: "검수 완료", createdBy: "u", createdAt: "2026-11-01",
    ai: { scores: { E1: 0, E2: 1, E3: 0, E4: 2, E5: 0, E6: 0, E7: 0, E8: 1 }, evidence: { E1: "", E2: "", E3: "", E4: "", E5: "", E6: "", E7: "", E8: "" }, summary: "", keywords: [], processKeywords: [], formats: [], tip: "", detected: { org: "", activity: "", result: "" }, model: "m", inputTokens: 0, outputTokens: 0, codedAt: "" },
    human: { scores: { E1: 0, E2: 2, E3: 0, E4: 2, E5: 0, E6: 0, E7: 0, E8: 1 }, reviewer: "팀", reviewedAt: "" },
  };
  it("0을 언급 없음으로 바꾸고, 경향에는 언급된 점수만 넘긴다", () => {
    const up = upgradeCoded(old);
    expect(up.codebook).toBe(2);
    expect(up.human!.scores.E1).toBeNull();
    expect(up.ai.evidence.E1).toBe("언급 없음");
    expect(toCurated(up).scores).toEqual({ E2: 2, E4: 2, E8: 1 });
    expect(upgradeCoded(up)).toBe(up); // 2판은 그대로
  });
  it("1판 시트 CSV: 점수 칸의 0만 빈칸으로", () => {
    const csv = 'ID,URL,E1 SNS 운영 성과,E2 사전 제작 콘텐츠,비고\nL-1,https://a,0,2,"0, 그대로"\n';
    const out = blankLegacyZeros(csv);
    expect(parseCuratedCsv(out)[0]!.scores).toEqual({ E2: 2 });
    expect(out).toContain('"0, 그대로"');
  });
  it("시트 검사: '-'·'언급 없음'은 빈칸으로 받고, 그 밖의 글자는 오류", () => {
    const header: string[] = [...REQUIRED_HEADERS];
    const at = (h: string) => header.indexOf(h);
    const raw = header.map(() => "");
    Object.assign(raw, { [at("ID")]: "L-1", [at("URL")]: "https://a", [at("E1 SNS 운영 성과")]: "-", [at("E2 사전 제작 콘텐츠")]: "언급 없음", [at("E4 분야 연결 경험")]: "0", [at("E7 협업 경험")]: "—", [at("E8 진정성·스토리")]: "x" });
    const r = checkSheet({ header, rows: [raw] });
    expect(["E1 SNS 운영 성과", "E2 사전 제작 콘텐츠", "E3 툴 활용", "E4 분야 연결 경험", "E7 협업 경험"].map((h) => r.rows[0]![at(h)])).toEqual(["", "", "", "0", ""]);
    expect(r.errors.join()).toContain("E8");
  });
});
