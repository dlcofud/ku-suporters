import { describe, expect, it } from "vitest";
import { buildTrendReport, confidenceOf, trendInsights, type CuratedReview } from "../src/trends/index.js";

const row = (i: number, over: Partial<CuratedReview> = {}): CuratedReview => ({
  id: `T-${i}`,
  sourceType: "",
  url: `https://example.com/${i}`,
  sourceCitation: "",
  org: "브랜드",
  activity: "서포터즈",
  field: "F&B·식품",
  result: "최종 합격",
  scores: { E1: 2, E2: 0, E3: 1, E4: 2, E5: 1, E6: 1, E7: 0, E8: 2 },
  formats: "블로그",
  keywords: [],
  processKeywords: [],
  tip: "",
  reliability: "중",
  reviewStatus: "원문 재확인 필요",
  ...over,
});

describe("신뢰도", () => {
  it("5건 미만은 표본 적음, 검수 없으면 참고용, 20건 이상 + 절반 검수면 믿을 만함", () => {
    expect(confidenceOf(3).level).toBe("low");
    expect(confidenceOf(0).hint).toContain("없어요");
    expect(confidenceOf(25, 0)).toMatchObject({ level: "medium", label: "참고용" });
    expect(confidenceOf(25, 0).hint).toContain("검수하지 않았어요");
    expect(confidenceOf(12, 12).level).toBe("medium");
    expect(confidenceOf(20, 10).level).toBe("high");
  });

  it("리포트에 검수·결과 확인 수와 요인별 n이 들어가고, 결과 확인된 후기만 고를 수 있다", () => {
    const rows = [row(1), row(2, { result: "확인 필요" }), row(3, { result: "서류 합격", reviewStatus: "검수 완료" }), row(4, { result: "" })];
    const r = buildTrendReport(rows);
    expect(r).toMatchObject({ sampleSize: 4, verifiedCount: 1, confirmedResultCount: 2, unknownResultCount: 2 });
    expect(r.confidence.level).toBe("low");
    expect(r.elementAverages[0]!.n).toBe(4);
    expect(buildTrendReport(rows, { confirmedOnly: true }).sampleSize).toBe(2);
  });

  it("표본이 적으면 맨 앞에 주의 문구를 넣는다", () => {
    const few = trendInsights(buildTrendReport([row(1), row(2)]));
    expect(few[0]!.kind).toBe("caution");
    expect(few.some((i) => i.kind === "gap")).toBe(false);
    const many = trendInsights(buildTrendReport(Array.from({ length: 8 }, (_, i) => row(i))));
    expect(many[0]!.kind).toBe("strong");
    expect(many[0]!.body).toContain("8건 기준");
  });
});
