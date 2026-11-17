/**
 * 경향 분석(팀 큐레이션 데이터 집계).
 *
 * 팀원이 구글 공용 시트('수집' 탭)에 직접 정리한 합격 후기를 CSV로 내보내면
 * 여기서 읽어 합격 요인 점수·키워드 빈도·분야별 통계를 만든다.
 * 원문은 시트에도 서비스에도 없다. 시트에 있는 것은 출처, 우리 말 요약, 점수, 키워드뿐이다.
 *
 * 구글 시트 CSV 주소 예:
 *   https://docs.google.com/spreadsheets/d/<시트ID>/gviz/tq?tqx=out:csv&sheet=수집
 */

import type { RubricCode } from "../skeleton/index.js";

export interface CuratedReview {
  id: string;
  sourceType: string;
  url: string;
  sourceCitation: string;
  org: string;
  activity: string;
  field: string;
  result: string;
  scores: Partial<Record<RubricCode, number>>;
  formats: string;
  keywords: string[];
  processKeywords: string[];
  tip: string;
  reliability: string;
  reviewStatus: string;
}

/** 따옴표·쉼표·줄바꿈을 처리하는 작은 CSV 파서 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const COLS = {
  id: "ID",
  sourceType: "출처 유형",
  url: "URL",
  citation: "출처 표기 (자동)",
  org: "주최사",
  activity: "활동명·기수",
  field: "분야",
  result: "결과 단계",
  formats: "언급된 콘텐츠 포맷",
  keywords: "합격 요인 키워드 (#태그)",
  process: "전형 키워드 (#태그)",
  tip: "핵심 팁 (내 말로, 2문장 이내)",
  reliability: "신뢰도",
  review: "검수 상태",
} as const;

const SCORE_COLS: [RubricCode, string][] = [
  ["E1", "E1 SNS 운영 성과"],
  ["E2", "E2 사전 제작 콘텐츠"],
  ["E3", "E3 툴 활용"],
  ["E4", "E4 분야 연결 경험"],
  ["E5", "E5 브랜드 이해"],
  ["E6", "E6 기획안 구체성"],
  ["E7", "E7 협업 경험"],
  ["E8", "E8 진정성·스토리"],
];

export const splitTags = (s: string) => s.split(/\s+/).map((t) => t.trim()).filter((t) => t.startsWith("#"));

/** 수집 시트 CSV를 읽는다. 헤더 이름으로 열을 찾으므로 열 순서가 바뀌어도 된다. */
export function parseCuratedCsv(csv: string): CuratedReview[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const idx = (name: string) => header.findIndex((h) => h.trim() === name);
  const get = (r: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  return rows
    .filter((r) => get(r, COLS.url))
    .map((r) => {
      const scores: Partial<Record<RubricCode, number>> = {};
      for (const [code, col] of SCORE_COLS) {
        const v = get(r, col);
        if (v !== "" && !Number.isNaN(Number(v))) scores[code] = Number(v);
      }
      return {
        id: get(r, COLS.id),
        sourceType: get(r, COLS.sourceType),
        url: get(r, COLS.url),
        sourceCitation: get(r, COLS.citation),
        org: get(r, COLS.org),
        activity: get(r, COLS.activity),
        field: get(r, COLS.field),
        result: get(r, COLS.result),
        scores,
        formats: get(r, COLS.formats),
        keywords: splitTags(get(r, COLS.keywords)),
        processKeywords: splitTags(get(r, COLS.process)),
        tip: get(r, COLS.tip),
        reliability: get(r, COLS.reliability),
        reviewStatus: get(r, COLS.review),
      };
    });
}

export interface TrendReport {
  sampleSize: number;
  verifiedCount: number;
  elementAverages: { code: RubricCode; avg: number; strongShare: number }[];
  keywordFrequency: { keyword: string; count: number; share: number }[];
  processFrequency: { keyword: string; count: number; share: number }[];
  byField: Record<string, number>;
  /** 이 리포트에 쓰인 출처 목록 (화면·발표에 함께 표시) */
  citations: string[];
}

export interface TrendFilter {
  field?: string;
  org?: string;
  /** true면 '검수 완료' 행만 쓴다 */
  verifiedOnly?: boolean;
}

function freq(lists: string[][], n: number) {
  const m = new Map<string, number>();
  for (const l of lists) for (const k of new Set(l)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()]
    .map(([keyword, count]) => ({ keyword, count, share: n ? count / n : 0 }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));
}

export function buildTrendReport(all: CuratedReview[], filter: TrendFilter = {}): TrendReport {
  const rows = all.filter(
    (r) =>
      (!filter.field || r.field === filter.field) &&
      (!filter.org || r.org === filter.org) &&
      (!filter.verifiedOnly || r.reviewStatus === "검수 완료"),
  );
  const n = rows.length;
  const elementAverages = SCORE_COLS.map(([code]) => {
    const vals = rows.map((r) => r.scores[code]).filter((v): v is number => typeof v === "number");
    return {
      code,
      avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0,
      strongShare: vals.length ? vals.filter((v) => v === 2).length / vals.length : 0,
    };
  });
  const byField: Record<string, number> = {};
  for (const r of rows) byField[r.field || "확인 필요"] = (byField[r.field || "확인 필요"] ?? 0) + 1;
  return {
    sampleSize: n,
    verifiedCount: rows.filter((r) => r.reviewStatus === "검수 완료").length,
    elementAverages,
    keywordFrequency: freq(rows.map((r) => r.keywords), n),
    processFrequency: freq(rows.map((r) => r.processKeywords), n),
    byField,
    citations: rows.map((r) => r.sourceCitation || r.url),
  };
}

/** 경향 리포트에서 캘린더의 포맷 비율 힌트를 만든다(숏폼 언급이 많으면 릴스 비중을 올림). */
export function formatMixHint(report: TrendReport): { reels: number; cardnews: number; post: number } {
  const shortform = report.keywordFrequency.find((k) => k.keyword === "#숏폼")?.share ?? 0;
  const reels = Math.min(0.7, 0.4 + shortform);
  const rest = 1 - reels;
  return { reels, cardnews: rest * 0.6, post: rest * 0.4 };
}
export * from "./coding.js";
