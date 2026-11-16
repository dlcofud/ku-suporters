import { describe, expect, it } from "vitest";
import { parseCsv, parseCuratedCsv, buildTrendReport, formatMixHint } from "../src/trends/index.js";

const csv = [
  'ID,URL,출처 표기 (자동),분야,E1 SNS 운영 성과,E8 진정성·스토리,합격 요인 키워드 (#태그),전형 키워드 (#태그),검수 상태',
  'L-1,https://a,"링커리어, 「후기 A」",F&B·식품,2,1,#성과수치 #숏폼,#서류 #면접,검수 완료',
  'L-2,https://b,"링커리어, 「후기 ""B""」",뷰티·패션,1,2,#진정성 #숏폼,#서류 #면접없음,원문 재확인 필요',
  ',,,,,,,,',
].join("\n");

describe("trends", () => {
  it("따옴표가 들어간 CSV를 읽는다", () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  });

  it("수집 시트를 읽어 집계한다 (태그는 정확히 일치할 때만 센다)", () => {
    const rows = parseCuratedCsv(csv);
    expect(rows).toHaveLength(2);
    const r = buildTrendReport(rows);
    expect(r.sampleSize).toBe(2);
    expect(r.keywordFrequency[0]).toMatchObject({ keyword: "#숏폼", count: 2, share: 1 });
    expect(r.processFrequency.find((k) => k.keyword === "#면접")?.count).toBe(1);
    expect(r.elementAverages.find((e) => e.code === "E1")).toMatchObject({ avg: 1.5, strongShare: 0.5 });
    expect(r.citations[1]).toBe('링커리어, 「후기 "B"」');
  });

  it("검수 완료만 보거나 분야로 거를 수 있다", () => {
    const rows = parseCuratedCsv(csv);
    expect(buildTrendReport(rows, { verifiedOnly: true }).sampleSize).toBe(1);
    expect(buildTrendReport(rows, { field: "뷰티·패션" }).sampleSize).toBe(1);
  });

  it("숏폼 언급이 많으면 릴스 비중을 올린다", () => {
    const mix = formatMixHint(buildTrendReport(parseCuratedCsv(csv)));
    expect(mix.reels).toBe(0.7);
    expect(mix.reels + mix.cardnews + mix.post).toBeCloseTo(1);
  });
});
