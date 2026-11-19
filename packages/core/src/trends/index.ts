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
  /** 아래는 수집 시트에만 있는 칸 (팀이 화면에서 코딩한 후기에는 없을 수 있다) */
  activityType?: string;
  /** "Y" | "N" | "언급 없음" */
  preMission?: string;
  interview?: string;
  newAccount?: string;
  /** 면접 질문 요약 (팀이 자기 말로 정리) */
  interviewSummary?: string;
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
  activityType: "활동 유형",
  preMission: "사전미션",
  interview: "면접",
  newAccount: "신규 계정으로 지원",
  interviewSummary: "면접 질문 요약 (내 말로)",
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
        activityType: get(r, COLS.activityType) || undefined,
        preMission: get(r, COLS.preMission) || undefined,
        interview: get(r, COLS.interview) || undefined,
        newAccount: get(r, COLS.newAccount) || undefined,
        interviewSummary: get(r, COLS.interviewSummary) || undefined,
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
  /** 결과 단계별 건수 (최종 합격 · 서류 합격 · 확인 필요) */
  byResult: Record<string, number>;
  /** 16점 만점 평균 총점 (점수가 있는 후기만) */
  avgTotal: number;
  /** 콘텐츠 포맷 언급 (숏폼·카드뉴스·블로그 …, 언급한 후기 수 기준) */
  formatMentions: { format: string; count: number }[];
  formatMentionedIn: number;
  /** Y/N으로 언급한 후기만 센다: 언급 없음은 모름으로 본다 */
  preMission: { yes: number; mentioned: number };
  interview: { yes: number; mentioned: number };
  newAccount: { yes: number; mentioned: number };
  /** 팀이 자기 말로 정리한 팁·면접 질문 (원문 아님) */
  tips: { text: string; org: string; activity: string; url: string }[];
  interviewQuestions: { text: string; org: string; url: string }[];
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
    byResult: countBy(rows.map((r) => r.result || "확인 필요")),
    avgTotal: avgTotal(rows),
    ...formatStats(rows),
    preMission: yn(rows.map((r) => r.preMission)),
    interview: yn(rows.map((r) => r.interview)),
    newAccount: yn(rows.map((r) => r.newAccount)),
    tips: rows.filter((r) => r.tip && r.tip !== "확인 필요").map((r) => ({ text: r.tip, org: r.org, activity: r.activity, url: r.url })),
    interviewQuestions: rows
      .filter((r) => r.interviewSummary && !/^(언급 없음|확인 필요|-)$/.test(r.interviewSummary))
      .map((r) => ({ text: r.interviewSummary!, org: r.org, url: r.url })),
  };
}

function countBy(xs: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return m;
}

function avgTotal(rows: CuratedReview[]): number {
  const totals = rows
    .map((r) => Object.values(r.scores))
    .filter((v) => v.length === SCORE_COLS.length)
    .map((v) => v.reduce((a, b) => a + (b ?? 0), 0));
  return totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0;
}

function yn(vals: (string | undefined)[]): { yes: number; mentioned: number } {
  const m = vals.filter((v) => v === "Y" || v === "N");
  return { yes: m.filter((v) => v === "Y").length, mentioned: m.length };
}

/** 포맷 이름을 묶는다: 숏츠·릴스·숏폼 → 숏폼, 유튜브·영상 → 영상 … */
const FORMAT_GROUPS: [string, RegExp][] = [
  ["숏폼(릴스·숏츠)", /숏폼|숏츠|쇼츠|릴스|reels/i],
  ["카드뉴스", /카드\s*뉴스/],
  ["블로그", /블로그|blog/i],
  ["영상(유튜브)", /유튜브|영상|youtube/i],
  ["인스타 피드·매거진", /인스타\s*(그램|매거진|피드)?$|인스타그램|매거진/],
  ["인스타툰", /인스타툰|툰/],
  ["기사·리뷰", /기사|리뷰|후기/],
];
function formatStats(rows: CuratedReview[]): { formatMentions: { format: string; count: number }[]; formatMentionedIn: number } {
  const counts = new Map<string, number>();
  let mentionedIn = 0;
  for (const r of rows) {
    const parts = (r.formats || "").split(/[,·/]/).map((x) => x.trim()).filter((x) => x && !/^(확인 필요|언급 없음|SNS 콘텐츠)$/.test(x));
    if (!parts.length) continue;
    mentionedIn++;
    const groups = new Set(parts.map((p) => FORMAT_GROUPS.find(([, re]) => re.test(p))?.[0] ?? "기타"));
    for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return {
    formatMentions: [...counts.entries()].map(([format, count]) => ({ format, count })).sort((a, b) => b.count - a.count || a.format.localeCompare(b.format)),
    formatMentionedIn: mentionedIn,
  };
}

/* ------------------------------------------------------------------ */
/* 읽기 쉬운 결론 (규칙 기반, 숫자에서만 만든다)                          */
/* ------------------------------------------------------------------ */

export interface TrendInsight {
  kind: "strong" | "gap" | "process" | "format";
  title: string;
  body: string;
}

const LABEL: Record<RubricCode, string> = {
  E1: "SNS 운영 성과", E2: "사전 제작 콘텐츠", E3: "툴 활용", E4: "분야 연결 경험",
  E5: "브랜드 이해", E6: "기획안 구체성", E7: "협업 경험", E8: "진정성·스토리",
};

export function trendInsights(r: TrendReport): TrendInsight[] {
  if (!r.sampleSize) return [];
  const out: TrendInsight[] = [];
  const sorted = [...r.elementAverages].sort((a, b) => b.avg - a.avg);
  const top = sorted.slice(0, 2).filter((e) => e.avg > 0);
  if (top.length) {
    out.push({
      kind: "strong",
      title: `합격 후기에서 가장 강한 요인: ${top.map((e) => LABEL[e.code]).join(" · ")}`,
      body: top.map((e) => `${LABEL[e.code]}은 평균 ${e.avg.toFixed(2)}점, ${Math.round(e.strongShare * 100)}%가 2점(뚜렷하게 드러남)이에요`).join(". ") + ". 지원서 첫 문항에서 이 둘을 먼저 보여 주세요.",
    });
  }
  const gaps = [...r.elementAverages].sort((a, b) => a.avg - b.avg).filter((e) => e.avg < 0.5).slice(0, 2);
  if (gaps.length) {
    out.push({
      kind: "gap",
      title: `차별화할 틈: ${gaps.map((e) => LABEL[e.code]).join(" · ")}`,
      body: `합격 후기에도 드물게 나와요 (평균 ${gaps.map((e) => `${e.code} ${e.avg.toFixed(2)}`).join(", ")}). 한 줄이라도 구체적으로 쓰면 다른 지원자와 달라 보여요.`,
    });
  }
  if (r.interview.mentioned) {
    out.push({
      kind: "process",
      title: `면접을 언급한 후기 ${r.interview.mentioned}건 중 ${r.interview.yes}건이 면접을 봤어요`,
      body: `사전미션은 언급한 ${r.preMission.mentioned}건 중 ${r.preMission.yes}건. 서류에 쓴 경험을 면접에서 다시 묻는 경우가 많으니 숫자와 근거를 준비해 두세요.`,
    });
  }
  const f = r.formatMentions[0];
  if (f && r.formatMentionedIn) {
    out.push({
      kind: "format",
      title: `가장 많이 언급된 포맷: ${f.format}`,
      body: `포맷을 언급한 후기 ${r.formatMentionedIn}건 중 ${f.count}건${r.formatMentions[1] ? `, 다음은 ${r.formatMentions[1].format} ${r.formatMentions[1].count}건` : ""}. 지원 전 콘텐츠 일정에 이 포맷을 먼저 넣어요.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 내 공고에 적용: 공고가 보는 것 × 합격 후기 평균                        */
/* ------------------------------------------------------------------ */

const NOTICE_SIGNALS: [RubricCode, RegExp][] = [
  ["E1", /팔로워|SNS\s*운영|계정\s*운영|인플루언서|채널\s*운영/i],
  ["E2", /포트폴리오|제작\s*경험|콘텐츠\s*제작|사전\s*(미션|과제)/],
  ["E3", /편집|영상|디자인|포토샵|프리미어|캡컷|촬영|툴/],
  ["E4", /관심|전공|경험이\s*있는|관련\s*(활동|경험)|분야/],
  ["E5", /브랜드|제품|서비스|이해|애정/],
  ["E6", /기획|아이디어|제안|마케팅/],
  ["E7", /팀|협업|소통|커뮤니케이션|함께/],
  ["E8", /진정성|열정|스토리|성실|책임감/],
];

export interface NoticeEmphasis {
  code: RubricCode;
  label: string;
  /** 공고에서 이 요인을 떠올리게 한 문장 */
  from: string;
  avg: number;
  advice: string;
}

/** 공고의 우대사항·활동 내용에서 요인을 찾고, 합격 후기 평균과 나란히 놓는다 */
export function noticeEmphasis(notice: { preferred: string[]; activities: string[] }, r: TrendReport): NoticeEmphasis[] {
  const lines = [...notice.preferred, ...notice.activities];
  const out: NoticeEmphasis[] = [];
  for (const [code, re] of NOTICE_SIGNALS) {
    const from = lines.find((l) => re.test(l));
    if (!from) continue;
    const avg = r.elementAverages.find((e) => e.code === code)?.avg ?? 0;
    out.push({
      code,
      label: LABEL[code],
      from,
      avg,
      advice:
        avg >= 1
          ? "합격자 대부분이 갖춘 요인이에요. 빠지면 눈에 띄니 반드시 근거와 함께 쓰세요."
          : avg >= 0.5
            ? "절반쯤이 보여 준 요인이에요. 숫자나 결과물 하나로 구체적으로 쓰면 앞서요."
            : "공고는 보는데 합격 후기에는 드물어요. 한 줄만 있어도 차별화돼요.",
    });
  }
  return out.slice(0, 5);
}


/** 경향 리포트에서 캘린더의 포맷 비율 힌트를 만든다(숏폼 언급이 많으면 릴스 비중을 올림). */
export function formatMixHint(report: TrendReport): { reels: number; cardnews: number; post: number } {
  const shortform = report.keywordFrequency.find((k) => k.keyword === "#숏폼")?.share ?? 0;
  const reels = Math.min(0.7, 0.4 + shortform);
  const rest = 1 - reels;
  return { reels, cardnews: rest * 0.6, post: rest * 0.4 };
}
export * from "./coding.js";
