import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildTrendReport, trendInsights, noticeEmphasis, parseCuratedCsv, type CuratedReview } from "../src/trends/index.js";

const base = (o: Partial<CuratedReview>): CuratedReview => ({
  id: "x", sourceType: "후기", url: "https://e.x/" + Math.random(), sourceCitation: "", org: "A", activity: "1기", field: "IT", result: "최종 합격",
  /* E1·E2·E3·E7 = 언급 없음(빈칸) */ scores: { E4: 2, E5: 1, E6: 1, E8: 2 }, formats: "", keywords: [], processKeywords: [], tip: "", reliability: "", reviewStatus: "AI 초안", ...o,
});

describe("경향 리포트 확장", () => {
  const rows = [
    base({ formats: "카드뉴스, 숏츠, 영상", preMission: "Y", interview: "Y", tip: "브랜드 계정을 먼저 분석했어요", interviewSummary: "가장 좋아하는 제품을 물었어요" }),
    base({ formats: "릴스, 블로그", preMission: "N", interview: "Y", result: "서류 합격" }),
    base({ formats: "확인 필요", preMission: "언급 없음", interview: "언급 없음", result: "", tip: "확인 필요" }),
  ];
  const r = buildTrendReport(rows);

  it("포맷을 묶어서 세고, 언급 없는 후기는 분모에서 뺀다", () => {
    expect(r.formatMentionedIn).toBe(2);
    expect(r.formatMentions[0]).toEqual({ format: "숏폼(릴스·숏츠)", count: 2 });
    expect(r.formatMentions.map((f) => f.format)).toEqual(expect.arrayContaining(["카드뉴스", "블로그", "영상(유튜브)"]));
  });

  it("Y/N만 세고, 결과·총점·팁을 모은다", () => {
    expect(r.preMission).toEqual({ yes: 1, mentioned: 2 });
    expect(r.interview).toEqual({ yes: 2, mentioned: 2 });
    expect(r.byResult).toEqual({ "최종 합격": 1, "서류 합격": 1, "확인 필요": 1 }); // 결과가 빈 칸이면 확인 필요
    expect(r.avgMark).toBe(1.5); // 언급된 4개 요인(2·1·1·2)의 평균. 언급 없음은 빠진다
    expect(r.avgMentioned).toBe(4);
    expect(r.tips).toHaveLength(1);
    expect(r.interviewQuestions[0]!.text).toContain("제품");
  });

  it("결론: 강한 요인과 차별화할 틈을 숫자로 말한다", () => {
    const ins = trendInsights(r);
    expect(ins.find((i) => i.kind === "strong")!.title).toMatch(/분야 연결 경험 · 진정성·스토리/);
    // 3건은 표본이 적어 '틈' 결론을 내지 않는다 → 5건으로 늘려서 본다
    expect(ins.find((i) => i.kind === "gap")).toBeUndefined();
    const more = trendInsights(buildTrendReport([...rows, base({}), base({})]));
    expect(more.find((i) => i.kind === "gap")!.body).toMatch(/E1 5건 중 0건/);
    expect(ins.find((i) => i.kind === "format")!.title).toContain("숏폼");
    expect(trendInsights(buildTrendReport([]))).toEqual([]);
  });

  it("공고 우대사항을 요인에 이어 붙이고 평균에 맞는 조언을 준다", () => {
    const em = noticeEmphasis({ preferred: ["영상 편집 가능자", "팀 프로젝트 경험"], activities: ["브랜드 제품 체험 후 콘텐츠 제작"] }, r);
    const codes = em.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(["E3", "E7", "E5"]));
    expect(em.find((e) => e.code === "E3")!.advice).toContain("차별화");
    expect(em.find((e) => e.code === "E5")!.advice).toContain("대부분"); // E5 평균 1점
  });

  it("팀 수집 시트(data/curated.csv)에서도 새 칸을 읽는다", () => {
    const all = parseCuratedCsv(readFileSync(new URL("../../../data/curated.csv", import.meta.url), "utf8"));
    const rep = buildTrendReport(all);
    expect(rep.sampleSize).toBe(all.length);
    expect(rep.interview.mentioned).toBeGreaterThan(0);
    expect(rep.formatMentionedIn).toBeGreaterThan(0);
    expect(rep.avgMark).toBeGreaterThan(0);
    // 저장소 시트는 코드북 2판: 언급 없음은 빈칸이라 요인마다 언급 수가 전체보다 적을 수 있다
    expect(rep.elementAverages.every((e) => e.n <= rep.sampleSize)).toBe(true);
  });
});
