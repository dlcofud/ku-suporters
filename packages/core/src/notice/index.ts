/**
 * 공고 분석("요강 역설계").
 *
 * 사용자가 모집 공고 텍스트를 붙여넣으면
 *  1) 규칙 기반으로 마감일·우대사항·제출물·전형·혜택을 뽑고 (토큰 0)
 *  2) 우대사항을 "지원자가 할 일"로 바꾼 행동 지침을 만든다.
 *  3) 필요할 때만 LLM으로 보강한다(analyzeNoticeWithLLM).
 *
 * 저작권: 공고 원문은 저장하지 않는다. 뽑아낸 사실(날짜, 항목)과 원문 링크만 남긴다.
 */

import type { ISODate } from "../shared.js";
import { toISODate } from "../shared.js";
import type { LLMClient } from "../llm/index.js";
import { extractJson } from "../llm/index.js";

export type Submission = "application" | "portfolio" | "sns_link" | "intro_video" | "content_plan" | "pre_mission";
export type Stage = "document" | "interview" | "pre_mission" | "video";

export interface NoticeAnalysis {
  title?: string;
  deadline?: ISODate;
  announcementDate?: ISODate;
  preferred: string[];
  activities: string[];
  benefits: string[];
  submissions: Submission[];
  stages: Stage[];
  /** 지원서 문항으로 보이는 줄 */
  questions: string[];
  /** 표준 합격 키워드(trends 모듈과 같은 표기) 중 공고에서 신호가 보이는 것 */
  signalKeywords: string[];
  sourceUrl?: string;
}

export interface ActionGuide {
  from: string;
  action: string;
  keyword: string;
}

const SUBMISSION_PATTERNS: [Submission, RegExp][] = [
  ["application", /지원서|신청서|구글\s*폼|google\s*form/i],
  ["portfolio", /포트폴리오|작업물/],
  ["sns_link", /SNS\s*(계정|주소|링크)|인스타(그램)?\s*(계정|주소|링크)|블로그\s*(주소|링크)/i],
  ["intro_video", /자기\s*소개\s*영상|소개\s*영상/],
  ["content_plan", /콘텐츠\s*기획(서|안)|기획안/],
  ["pre_mission", /사전\s*(미션|과제)/],
];

const STAGE_PATTERNS: [Stage, RegExp][] = [
  ["document", /서류/],
  ["interview", /면접/],
  ["pre_mission", /사전\s*(미션|과제)/],
  ["video", /영상\s*(심사|평가)/],
];

const SECTION_HEADERS = {
  preferred: /우대\s*(사항|조건)?/,
  activities: /(주요\s*)?활동\s*(내용|사항)/,
  benefits: /혜택|활동\s*비|지원\s*사항/,
  questions: /지원서\s*문항|자기\s*소개서\s*문항|문항/,
};

/** "2026.12.04", "2026-12-04", "12월 4일", "12/4" 형태의 날짜를 찾는다. 연도가 없으면 referenceYear를 쓴다. */
export function findDates(text: string, referenceYear: number): ISODate[] {
  const out: ISODate[] = [];
  const full = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g;
  const short = /(?<![\d.])(\d{1,2})\s*(?:월\s*|\/)(\d{1,2})\s*일?/g;
  let m: RegExpExecArray | null;
  const taken: [number, number][] = [];
  while ((m = full.exec(text))) {
    out.push(toISODate(new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))));
    taken.push([m.index, m.index + m[0].length]);
  }
  while ((m = short.exec(text))) {
    const idx = m.index;
    if (taken.some(([a, b]) => idx >= a && idx < b)) continue;
    const mo = +m[1]!;
    const d = +m[2]!;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.push(toISODate(new Date(Date.UTC(referenceYear, mo - 1, d))));
  }
  return out;
}

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 제목 줄 다음에 나오는 목록 줄들을 모은다. 다음 섹션 제목이 나오면 멈춘다. */
function collectSection(lines: string[], header: RegExp): string[] {
  const out: string[] = [];
  let on = false;
  for (const line of lines) {
    const isListItem = /^[-•·*▪◦○]\s*|^\d+[.)]\s+/.test(line);
    const isHeader =
      !isListItem &&
      (/^[\[【■▶●◆#]/.test(line) ||
        (line.length <= 16 && /(사항|내용|혜택|문항|조건|대상|일정|방법|절차|기간)\s*[:：]?$/.test(line)));
    if (isHeader && header.test(line)) {
      on = true;
      const after = line.split(/[:：]/)[1]?.trim();
      if (after) out.push(after);
      continue;
    }
    if (on && isHeader) break;
    if (on) out.push(line.replace(/^[-•·*▪◦○●]\s*|^\d+[.)]\s*/, ""));
  }
  return out.filter((l) => l.length > 1).slice(0, 12);
}

const KEYWORD_SIGNALS: [string, RegExp][] = [
  ["#개인SNS운영", /SNS\s*(운영|채널)|인스타|블로그|유튜브|틱톡/i],
  ["#툴능력", /포토샵|프리미어|일러스트|캔바|미리캔버스|편집\s*(툴|프로그램|가능)/],
  ["#분야경험", /경험(이|자)?\s*(있는|우대)|관련\s*(활동|경험)/],
  ["#숏폼", /숏폼|릴스|쇼츠|숏츠/],
  ["#기획안구조", /기획(서|안)/],
  ["#브랜드분석", /브랜드|제품|서비스\s*(에|를)?\s*(관심|이해)/],
  ["#협업", /팀\s*(활동|미션|프로젝트)|협업/],
  ["#자기소개영상", /자기\s*소개\s*영상/],
];

/** 규칙 기반 분석. LLM을 쓰지 않으므로 비용이 0이다. */
export function analyzeNotice(text: string, opts: { referenceYear?: number; sourceUrl?: string } = {}): NoticeAnalysis {
  const year = opts.referenceYear ?? new Date().getUTCFullYear();
  const lines = linesOf(text);

  let deadline: ISODate | undefined;
  let announcementDate: ISODate | undefined;
  for (const line of lines) {
    const dates = findDates(line, year);
    if (!dates.length) continue;
    if (!deadline && /(모집|접수|지원)\s*(기간|마감)|마감|~|까지/.test(line)) {
      deadline = dates[dates.length - 1];
    } else if (!announcementDate && /발표|합격자/.test(line)) {
      announcementDate = dates[0];
    }
  }

  const submissions = SUBMISSION_PATTERNS.filter(([, re]) => re.test(text)).map(([s]) => s);
  const stages = STAGE_PATTERNS.filter(([, re]) => re.test(text)).map(([s]) => s);
  const signalKeywords = KEYWORD_SIGNALS.filter(([, re]) => re.test(text)).map(([k]) => k);

  return {
    title: lines[0]?.slice(0, 80),
    deadline,
    announcementDate,
    preferred: collectSection(lines, SECTION_HEADERS.preferred),
    activities: collectSection(lines, SECTION_HEADERS.activities),
    benefits: collectSection(lines, SECTION_HEADERS.benefits),
    questions: collectSection(lines, SECTION_HEADERS.questions),
    submissions,
    stages,
    signalKeywords,
    sourceUrl: opts.sourceUrl,
  };
}

const GUIDE_RULES: { test: RegExp; keyword: string; action: string }[] = [
  { test: /SNS|인스타|블로그|채널/i, keyword: "#성과수치", action: "운영 중인 SNS의 성과를 숫자로 정리하세요 (최고 조회수, n주 만의 팔로워 증가 등). 계정이 없다면 지금 열고 마감 전까지 콘텐츠를 채우세요." },
  { test: /편집|포토샵|프리미어|툴|디자인/, keyword: "#툴능력", action: "툴 이름만 적지 말고, 그 툴로 만든 결과물 링크를 포트폴리오에 넣으세요. 실력은 과장하지 않고 실제 수준대로 표기하세요." },
  { test: /영상|숏폼|릴스|쇼츠/, keyword: "#숏폼", action: "지원 전에 활동 주제로 짧은 릴스를 1~2개 미리 만들어 두세요. 지원서의 '만들고 싶은 콘텐츠'를 실제로 올리면 증거가 됩니다." },
  { test: /경험|활동\s*이력|대외활동/, keyword: "#분야경험", action: "같은 분야 경험을 활동 내용과 직접 연결해 쓰세요. 경험이 적으면 교내 활동·개인 블로그도 '이 활동에 어떻게 도움이 되는지'로 연결하면 됩니다." },
  { test: /관심|애정|팬|이용/, keyword: "#브랜드분석", action: "공식 SNS를 팔로우하고 장단점, 인상 깊은 콘텐츠, 경쟁 브랜드와의 차이를 3줄씩 정리해 두세요. 면접 단골 질문이에요." },
  { test: /기획|아이디어/, keyword: "#기획안구조", action: "아이디어는 타겟 → 기획 의도 → 형식 → 기대 효과 순서로 1~2문장씩 쓰세요." },
  { test: /팀|협업|오프라인/, keyword: "#협업", action: "팀 프로젝트에서 맡은 역할과 결과를 한 문장으로 정리해 두세요." },
  { test: /성실|꾸준|책임/, keyword: "#꾸준함", action: "꾸준함은 말 대신 업로드 기록으로 보여주세요. 역산 캘린더로 마감 전까지 2~3일 간격 업로드를 지키면 됩니다." },
];

/** 우대사항·활동 내용을 지원자가 할 일로 바꾼다. */
export function toActionGuides(a: NoticeAnalysis): ActionGuide[] {
  const sources = [...a.preferred, ...a.activities];
  const guides: ActionGuide[] = [];
  const used = new Set<string>();
  for (const src of sources) {
    for (const rule of GUIDE_RULES) {
      if (rule.test.test(src) && !used.has(rule.keyword)) {
        guides.push({ from: src, action: rule.action, keyword: rule.keyword });
        used.add(rule.keyword);
      }
    }
  }
  if (a.submissions.includes("portfolio") && !used.has("#포폴압축")) {
    guides.push({ from: "제출물: 포트폴리오", keyword: "#포폴압축", action: "포트폴리오는 이 활동과 맞는 대표 경험 5개 안팎으로 압축하고, 각 경험에 성과 숫자를 붙이세요." });
  }
  return guides;
}

/** 규칙으로 못 잡은 부분만 LLM으로 보강한다. 공고 원문은 이 호출에만 쓰이고 저장하지 않는다. */
export async function analyzeNoticeWithLLM(text: string, llm: LLMClient, opts: { referenceYear?: number; sourceUrl?: string } = {}) {
  const base = analyzeNotice(text, opts);
  const needs = !base.deadline || base.preferred.length === 0 || base.questions.length === 0;
  if (!needs) return { analysis: base, usage: { inputTokens: 0, outputTokens: 0 }, tier: llm.tier };
  const res = await llm.complete({
    system:
      "너는 대학생 대외활동 모집 공고에서 사실만 뽑는 도우미야. 공고에 없는 내용은 만들지 말고 빈 배열이나 null로 둬. JSON 하나만 출력해.",
    user: `다음 공고에서 deadline(YYYY-MM-DD), announcementDate, preferred(우대사항 배열), activities, benefits, questions(지원서 문항 배열)를 뽑아줘.\n\n${text.slice(0, 6000)}`,
    maxOutputTokens: 600,
    json: true,
  });
  const extra = extractJson<Partial<NoticeAnalysis>>(res.text);
  const merged: NoticeAnalysis = {
    ...base,
    deadline: base.deadline ?? extra.deadline ?? undefined,
    announcementDate: base.announcementDate ?? extra.announcementDate ?? undefined,
    preferred: base.preferred.length ? base.preferred : extra.preferred ?? [],
    activities: base.activities.length ? base.activities : extra.activities ?? [],
    benefits: base.benefits.length ? base.benefits : extra.benefits ?? [],
    questions: base.questions.length ? base.questions : extra.questions ?? [],
  };
  return { analysis: merged, usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens }, tier: llm.tier };
}
