import { shared, type planner } from "@supportlab/core";
import type { Activity } from "./repo";

/**
 * 첫 화면(모든 서포터즈 통합 캘린더)에 쓰는 데이터.
 * 서포터즈마다 일정(plan)을 따로 갖고 있으므로, 모아서 이름표만 붙인다.
 */

export interface ActSummary {
  id: string;
  name: string;
  /** 달력 칸에 붙이는 짧은 이름표 (예: 삼성전자) */
  tag: string;
  deadline?: string;
  /** 마감까지 남은 날 (마감일이 없으면 undefined, 지났으면 음수) */
  daysLeft?: number;
  stage: string;
  hasPlan: boolean;
}

export interface OverviewItem extends planner.PlanItem {
  actId: string;
  actName: string;
  tag: string;
}

/** 이름표: 첫 낱말을 6자까지. 겹치면 뒤에 번호를 붙인다 */
export function makeTags(names: string[]): string[] {
  const base = names.map((n) => [...(n.trim().split(/\s+/)[0] || "서포터즈")].slice(0, 6).join(""));
  const seen = new Map<string, number>();
  return base.map((b) => {
    const k = (seen.get(b) ?? 0) + 1;
    seen.set(b, k);
    return base.filter((x) => x === b).length > 1 ? `${b}${k}` : b;
  });
}

/** 지금 어느 단계인지 한 줄로 */
export function stageOf(a: Activity, today: string): string {
  const deadline = a.plan?.deadline ?? a.analysis.deadline;
  if (deadline && deadline < today) return "마감 지남";
  if (!a.plan) return "마감일 정하기";
  const app = a.application;
  if (app && app.questions.length) {
    const done = app.answers.filter((x) => x.text.trim().length > 0).length;
    if (done < app.questions.length) return `지원서 ${done}/${app.questions.length}`;
  } else if (a.analysis.questions.length) {
    return "지원서 시작 전";
  }
  const left = a.plan.items.filter((i) => i.kind === "content" && i.date >= today).length;
  return left ? `콘텐츠 ${left}개 남음` : "제출 준비";
}

export function summarize(acts: Activity[], today: string): ActSummary[] {
  const tags = makeTags(acts.map((a) => a.name));
  return acts.map((a, i) => {
    const deadline = a.plan?.deadline ?? a.analysis.deadline;
    return {
      id: a.id,
      name: a.name,
      tag: tags[i]!,
      deadline,
      daysLeft: deadline ? shared.diffDays(today, deadline) : undefined,
      stage: stageOf(a, today),
      hasPlan: !!a.plan,
    };
  });
}

/** 모든 서포터즈의 일정을 날짜순으로. 마감이 지난 서포터즈도 기록으로 남긴다 */
export function allItems(acts: Activity[], sums: ActSummary[]): OverviewItem[] {
  const out: OverviewItem[] = [];
  acts.forEach((a, i) => {
    for (const it of a.plan?.items ?? []) out.push({ ...it, actId: a.id, actName: a.name, tag: sums[i]!.tag });
  });
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** 둘 이상의 서포터즈 일정이 같은 날에 있는 날짜 (오늘 이후) */
export function clashDays(items: OverviewItem[], today: string): string[] {
  const byDay = new Map<string, Set<string>>();
  for (const it of items) {
    if (it.date < today) continue;
    byDay.set(it.date, (byDay.get(it.date) ?? new Set()).add(it.actId));
  }
  return [...byDay.entries()].filter(([, s]) => s.size > 1).map(([d]) => d).sort();
}

/** 일정 하나를 누르면 갈 곳 (그 서포터즈를 고른 뒤) */
export function itemTarget(it: planner.PlanItem): { href: string; cta: string } {
  if (it.kind === "content") return { href: `/studio?item=${it.id}`, cta: "만들러 가기" };
  if (it.kind === "checkpoint") return { href: "/feedback", cta: "성과 보러 가기" };
  if (it.kind === "portfolio") return { href: "/feedback", cta: "정리하러 가기" };
  return { href: "/skeleton", cta: it.kind === "deadline" ? "제출 준비 보기" : "점검하러 가기" };
}

/** 서포터즈를 고르고 next로 가는 주소 */
export const goHref = (actId: string, next: string) => `/go/${encodeURIComponent(actId)}?next=${encodeURIComponent(next)}`;
