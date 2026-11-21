import { describe, expect, it } from "vitest";
import { buildTrendReport, canVerify, fromCurated, nextToVerify, SHEET_AUTHOR, toCurated, toSheetCsv, type CodedReview, type CuratedReview } from "../src/trends/index.js";

const sheetRow: CuratedReview = {
  id: "L-007",
  sourceType: "링커리어 후기",
  url: "https://community.linkareer.com/x/7",
  sourceCitation: "링커리어 커뮤니티, 「크라운제과 12기 최종합격 후기」, 게시일 미상, https://community.linkareer.com/x/7 (확인일 2026.11.16)",
  org: "크라운제과",
  activity: "공식 서포터즈 12기",
  field: "F&B·식품",
  result: "확인 필요",
  scores: { E1: 2, E2: 1, E3: 0, E4: 2, E5: 1, E6: 0, E7: 0, E8: 1 },
  formats: "카드뉴스, 숏츠",
  keywords: ["#성과수치"],
  processKeywords: ["#서류", "#면접"],
  tip: "숫자로 성과를 보여 줘요",
  reliability: "중",
  reviewStatus: "원문 재확인 필요",
  preMission: "Y",
  interview: "Y",
  interviewSummary: "공식 SNS 장단점",
};

describe("시트 행을 검수 대기로", () => {
  const now = "2026-11-19T07:00:00.000Z";
  const r = fromCurated(sheetRow, now);

  it("시트 점수를 AI 자리에 두고, 출처 표기·면접·사전미션 칸을 지킨다", () => {
    expect(r).toMatchObject({ id: "sh_L-007", status: "AI 초안", createdBy: SHEET_AUTHOR });
    expect(r.meta).toMatchObject({ sourceName: "링커리어 커뮤니티", title: "크라운제과 12기 최종합격 후기", org: "크라운제과", result: undefined });
    expect(r.ai.scores.E1).toBe(2);
    expect(r.ai.model).toBe("sheet");
    expect(r.ai.formats).toEqual(["카드뉴스", "숏츠"]);
    const c = toCurated(r);
    expect(c.sourceCitation).toBe(sheetRow.sourceCitation);
    expect(c).toMatchObject({ preMission: "Y", interview: "Y", interviewSummary: "공식 SNS 장단점", result: "확인 필요" });
    // 경향 계산에 그대로 들어간다
    expect(buildTrendReport([c]).interview).toEqual({ yes: 1, mentioned: 1 });
  });

  it("CSV로 내보내면 시트 ID를 그대로 쓴다", () => {
    expect(toSheetCsv([r]).split("\n")[1]!.startsWith("L-007,수집 시트,")).toBe(true);
  });
});

describe("검수 순서와 두 사람 원칙", () => {
  const mk = (id: string, createdBy: string, createdAt: string, status: CodedReview["status"] = "AI 초안"): CodedReview => ({
    ...fromCurated({ ...sheetRow, id, url: `https://e.x/${id}` }, createdAt),
    id,
    createdBy,
    status,
  });
  const list = [mk("c", "u1", "2026-11-03"), mk("a", "u2", "2026-11-01"), mk("b", SHEET_AUTHOR, "2026-11-02"), mk("d", "u2", "2026-10-01", "검수 완료")];

  it("직접 코딩한 후기는 검수하지 못한다", () => {
    expect(canVerify(list[0]!, "u1")).toBe(false);
    expect(canVerify(list[0]!, "u2")).toBe(true);
    expect(canVerify(list[2]!, "u1")).toBe(true);
  });
  it("다음 후기: 검수 대기 중 오래된 것부터, 내 것과 방금 본 것은 빼고", () => {
    expect(nextToVerify(list, "u1")!.id).toBe("a");
    expect(nextToVerify(list, "u2")!.id).toBe("b");
    expect(nextToVerify(list, "u1", "a")!.id).toBe("b");
    expect(nextToVerify(list.slice(0, 1), "u1")).toBeUndefined();
  });
});

import { agreementByCode, agreementCross, compareScores } from "../src/trends/index.js";

describe("AI 교차 검수", () => {
  const s = (v: number[]) => Object.fromEntries(v.map((x, i) => [`E${i + 1}`, x])) as Record<"E1", 0 | 1 | 2>;
  it("모두 같으면 일치, 1점 차이 2개 이하면 거의 일치, 2점 차이나 3개 이상이면 불일치", () => {
    expect(compareScores(s([1, 1, 1, 1, 1, 1, 1, 1]), s([1, 1, 1, 1, 1, 1, 1, 1]))).toEqual({ verdict: "match", diff: [] });
    expect(compareScores(s([1, 1, 1, 1, 1, 1, 1, 1]), s([2, 0, 1, 1, 1, 1, 1, 1]))).toEqual({ verdict: "near", diff: ["E1", "E2"] });
    expect(compareScores(s([0, 1, 1, 1, 1, 1, 1, 1]), s([2, 1, 1, 1, 1, 1, 1, 1])).verdict).toBe("differ");
    expect(compareScores(s([1, 1, 1, 1, 1, 1, 1, 1]), s([2, 2, 2, 1, 1, 1, 1, 1])).verdict).toBe("differ");
  });
  it("교차 일치도는 교차 검수한 후기로, 사람-AI 일치도에서는 한꺼번에 검수한 후기를 뺀다", () => {
    const base = fromCurated(sheetRow, "2026-11-21");
    const crossed = { ...base, id: "x1", cross: { ok: true as const, scores: { ...base.ai.scores }, model: "g", at: "", verdict: "match" as const, diff: [] } };
    const bulk = { ...base, id: "x2", status: "검수 완료" as const, human: { scores: { ...base.ai.scores }, reviewer: "a", reviewedAt: "", via: "bulk" as const } };
    expect(agreementCross([crossed, bulk])[0]!.n).toBe(1);
    expect(agreementByCode([crossed, bulk])[0]!.n).toBe(0);
    expect(toCurated(crossed).crossChecked).toBe(true);
    expect(buildTrendReport([toCurated(crossed)]).crossCheckedCount).toBe(1);
  });
});
