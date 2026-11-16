/**
 * 역산 업로드 캘린더.
 *
 * 마감일에서 거꾸로 계산해 콘텐츠 업로드 일정을 만든다.
 * - 콘텐츠는 2~3일 간격으로 나눠 올린다(한 번에 몰아 올리면 'AI 티'가 나고 운영 이력도 보이지 않는다).
 * - 마감 3일 전 포트폴리오 정리, 1일 전 지원서 최종 점검을 고정으로 넣는다.
 * - 중간에 '성과 점검'을 넣어 feedback 모듈의 제안을 남은 일정에 반영한다.
 * - 날짜를 조작하는 기능은 만들지 않는다. 실제로 꾸준히 운영하도록 돕는 것이 원칙이다.
 */

import type { ContentFormat, ISODate } from "../shared.js";
import { addDays, diffDays, FORMAT_LABEL } from "../shared.js";

export type PlanItemKind = "content" | "checkpoint" | "portfolio" | "final_check" | "deadline";
export type PlanItemStatus = "past" | "today" | "upcoming";

export interface PlanItem {
  id: string;
  date: ISODate;
  kind: PlanItemKind;
  format: ContentFormat | null;
  title: string;
  purpose: string;
  checklist: string[];
  /** 남은 일수 (마감 기준) */
  dMinus: number;
  status: PlanItemStatus;
}

export interface Plan {
  deadline: ISODate;
  start: ISODate;
  gapDays: number;
  items: PlanItem[];
}

export interface PlanOptions {
  today: ISODate;
  deadline: ISODate;
  /** 포맷 비율. 경향 분석 결과로 조정한다. 기본: 릴스 50%, 카드뉴스 30%, 게시물 20% */
  mix?: Partial<Record<Exclude<ContentFormat, "check">, number>>;
  minGapDays?: number;
  maxGapDays?: number;
  maxContents?: number;
  /** 아직 활동용 계정이 없으면 첫 콘텐츠를 계정 오픈용 자기소개로 만든다 */
  newAccount?: boolean;
  /** 활동 이름(제목 문구에 사용) */
  activityName?: string;
}

export const DEFAULT_CHECKLIST = [
  "직접 찍은 사진·영상 1개 이상",
  "캡션에 내 경험 한 줄 넣기",
  "지난 게시물과 템플릿 색·구도 바꾸기",
  "내 말투로 마지막 문장 고치기",
];

const IDEAS: Record<Exclude<ContentFormat, "check">, { title: string; purpose: string }[]> = {
  reels: [
    { title: "신제품 3초 리뷰", purpose: "첫 3초에 제품을 바로 보여주는 숏폼 훅 연습. 조회수 성과를 만들기 좋아요." },
    { title: "제품 활용 챌린지", purpose: "참여형 포맷으로 공유 수를 노려요. 성과는 지원서 성과 문항에 그대로 써요." },
    { title: "하루 루틴 속 브랜드", purpose: "내 생활에 브랜드를 자연스럽게 녹여 진정성을 보여줘요." },
  ],
  cardnews: [
    { title: "공식 SNS 분석", purpose: "면접 단골 질문인 공식 SNS 장단점을 미리 정리해 두는 콘텐츠예요." },
    { title: "경쟁 브랜드 SNS 비교", purpose: "다른 브랜드 사례를 분석해 브랜드 이해를 보여줘요." },
    { title: "만들고 싶은 콘텐츠 미리보기", purpose: "지원서의 콘텐츠 제안 문항을 실제로 만들어 링크로 첨부해요." },
  ],
  post: [
    { title: "언박싱·첫인상 기록", purpose: "일상 게시물로 계정 분위기를 만들어요." },
    { title: "직접 찍은 사진 기록", purpose: "직접 찍은 사진이 핵심이에요. AI 티를 줄여 줘요." },
  ],
};

/** 비율에 맞춰 n개의 포맷을 고르게 섞어 배치한다(가장 많이 뒤처진 포맷을 다음에 놓는 방식). */
export function distributeFormats(n: number, mix: Record<Exclude<ContentFormat, "check">, number>): Exclude<ContentFormat, "check">[] {
  const keys = (Object.keys(mix) as Exclude<ContentFormat, "check">[]).filter((k) => mix[k] > 0);
  const total = keys.reduce((s, k) => s + mix[k], 0);
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
  const out: Exclude<ContentFormat, "check">[] = [];
  for (let i = 0; i < n; i++) {
    let best = keys[0]!;
    let bestDeficit = -Infinity;
    for (const k of keys) {
      const deficit = ((i + 1) * mix[k]) / total - (counts[k] ?? 0);
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = k;
      }
    }
    counts[best] = (counts[best] ?? 0) + 1;
    out.push(best);
  }
  return out;
}

function statusOf(date: ISODate, today: ISODate): PlanItemStatus {
  const d = diffDays(today, date);
  return d < 0 ? "past" : d === 0 ? "today" : "upcoming";
}

export function planSchedule(opts: PlanOptions): Plan {
  const minGap = opts.minGapDays ?? 2;
  const maxGap = opts.maxGapDays ?? 3;
  const maxContents = opts.maxContents ?? 10;
  const mix = { reels: 0.5, cardnews: 0.3, post: 0.2, ...opts.mix };
  const { today, deadline } = opts;

  const daysLeft = diffDays(today, deadline);
  if (daysLeft < 2) throw new Error("마감까지 이틀 이상 남아야 일정을 짤 수 있어요");

  const items: Omit<PlanItem, "status" | "dMinus" | "id">[] = [];
  const contentEnd = addDays(deadline, -4);
  const windowDays = Math.max(0, diffDays(today, contentEnd));

  // 간격: 최대 개수를 넘지 않는 선에서 가능한 한 촘촘하게(최소 minGap, 최대 maxGap)
  const gap = Math.min(maxGap, Math.max(minGap, Math.ceil(windowDays / Math.max(1, maxContents - 1))));
  const contentDates: ISODate[] = [];
  if (diffDays(today, contentEnd) >= 0) {
    for (let d = 0; d <= windowDays && contentDates.length < maxContents; d += gap) contentDates.push(addDays(today, d));
  } else {
    contentDates.push(today); // 마감이 아주 가까우면 오늘 하나만
  }

  const formats = distributeFormats(contentDates.length, mix);
  const used: Record<string, number> = {};
  contentDates.forEach((date, i) => {
    let fmt = formats[i]!;
    let idea: { title: string; purpose: string };
    if (i === 0 && opts.newAccount) {
      fmt = "reels";
      idea = { title: "계정 오픈 · 자기소개 릴스", purpose: "왜 이 활동에 관심이 생겼는지 15초로 보여주는 첫 콘텐츠예요." };
    } else {
      const list = IDEAS[fmt];
      const k = used[fmt] ?? 0;
      used[fmt] = k + 1;
      idea = list[k % list.length]!;
    }
    items.push({ date, kind: "content", format: fmt, title: idea.title, purpose: idea.purpose, checklist: DEFAULT_CHECKLIST });
  });

  // 중간 성과 점검: 콘텐츠가 3개 이상일 때, 가운데 콘텐츠 다음 날
  if (contentDates.length >= 3) {
    const mid = contentDates[Math.floor(contentDates.length / 2)]!;
    const checkDate = addDays(mid, 1);
    if (!contentDates.includes(checkDate) && diffDays(checkDate, contentEnd) >= 0) {
      items.push({
        date: checkDate,
        kind: "checkpoint",
        format: "check",
        title: "성과 점검 · 피드백 반영",
        purpose: "지금까지 올린 콘텐츠의 조회수·저장 수를 보고 남은 일정의 포맷을 조정해요.",
        checklist: ["포맷별 평균 조회수 비교", "남은 콘텐츠 포맷 조정", "지원서에 쓸 성과 숫자 메모"],
      });
    }
  }

  items.push({
    date: addDays(deadline, -3),
    kind: "portfolio",
    format: "check",
    title: "포트폴리오 정리",
    purpose: "대표 콘텐츠 5개 안팎을 골라 성과 숫자와 함께 묶어요.",
    checklist: ["대표 콘텐츠 고르기", "각 콘텐츠에 성과 숫자 붙이기", "링크가 모두 열리는지 확인"],
  });
  items.push({
    date: addDays(deadline, -1),
    kind: "final_check",
    format: "check",
    title: "지원서 최종 점검",
    purpose: "지원서 뼈대에 내 경험이 다 채워졌는지, 글자 수와 링크를 확인해요.",
    checklist: ["문항별 글자 수 확인", "SNS·포트폴리오 링크 확인", "맞춤법 검사"],
  });
  items.push({
    date: deadline,
    kind: "deadline",
    format: null,
    title: `${opts.activityName ?? "서류"} 제출 마감`,
    purpose: "오늘이 마감이에요. 마감 시각 전에 제출하세요.",
    checklist: [],
  });

  const sorted = items
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((it, i): PlanItem => ({
      ...it,
      id: `p${i + 1}`,
      dMinus: diffDays(it.date, deadline),
      status: statusOf(it.date, today),
    }));

  return { deadline, start: today, gapDays: gap, items: sorted };
}

/** 피드백 제안을 반영해 특정 일정의 포맷을 바꾼다(원본은 그대로 두고 새 계획을 돌려준다). */
export function changeFormat(plan: Plan, itemId: string, format: Exclude<ContentFormat, "check">): Plan {
  return {
    ...plan,
    items: plan.items.map((it) =>
      it.id === itemId && it.kind === "content"
        ? { ...it, format, title: `${it.title} (${FORMAT_LABEL[format]}로 변경)` }
        : it,
    ),
  };
}

/** 아직 오지 않은 콘텐츠 일정 수 */
export function remainingContents(plan: Plan): number {
  return plan.items.filter((i) => i.kind === "content" && i.status !== "past").length;
}
