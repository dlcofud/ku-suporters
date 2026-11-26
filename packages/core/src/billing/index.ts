/**
 * 크레딧 충전과 구독 (수익 모델).
 *
 * - 크레딧 묶음: 한 번 사면 바로 적립 (원장 reason: "purchase")
 * - 구독: 매달 정해진 크레딧을 적립 (원장 reason: "subscription_refill").
 *   갱신일이 지나면 renewIfDue가 지난 달 수만큼 적립할 기간을 돌려주고, 같은 기간은 두 번 적립하지 않는다(idempotencyKey).
 * - 결제는 PaymentProvider로 분리했다. 지금은 테스트 결제(실제 돈이 나가지 않음)만 있고,
 *   나중에 토스페이먼츠 같은 결제사를 같은 인터페이스로 붙인다.
 *
 * 가격은 기획 단계의 가정값이다 (한곳에서 바꿀 수 있게 모아 둠).
 */
import { CREDIT_POLICY } from "../credits/index.js";
import type { ISODate } from "../shared.js";

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  /** 원 (부가세 포함) */
  price: number;
  badge?: string;
}

export interface SubscriptionPlan {
  id: "basic" | "pro";
  name: string;
  monthlyCredits: number;
  /** 월 요금 (원) */
  price: number;
  perks: string[];
  badge?: string;
}

export const PACKS: CreditPack[] = [
  { id: "pack_50", name: "가볍게", credits: 50, price: 3_900 },
  { id: "pack_150", name: "지원 시즌", credits: 150, price: 9_900, badge: "인기" },
  { id: "pack_400", name: "여러 활동 동시에", credits: 400, price: 22_000, badge: "크레딧당 가장 저렴" },
];

export const PLANS: SubscriptionPlan[] = [
  {
    id: "basic",
    name: "베이직",
    monthlyCredits: CREDIT_POLICY.subscription.basic,
    price: 6_900,
    perks: ["매달 100 크레딧", "공고 분석·지원서 코치·콘텐츠 기획에 사용", "언제든 해지"],
  },
  {
    id: "pro",
    name: "프로",
    monthlyCredits: CREDIT_POLICY.subscription.pro,
    price: 14_900,
    perks: ["매달 300 크레딧", "활동 여러 개를 동시에 준비할 때", "언제든 해지"],
    badge: "추천",
  },
];

export const findPack = (id: string) => PACKS.find((p) => p.id === id);
export const findPlan = (id: string) => PLANS.find((p) => p.id === id);
/** 크레딧 1개당 가격 (원, 소수 첫째 자리) */
export const perCredit = (price: number, credits: number) => Math.round((price / credits) * 10) / 10;

export type PayMethod = "card" | "kakaopay" | "tosspay";
export const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "card", label: "신용·체크카드" },
  { id: "kakaopay", label: "카카오페이" },
  { id: "tosspay", label: "토스페이" },
];

export interface Order {
  id: string;
  userId: string;
  kind: "pack" | "subscription";
  /** pack id 또는 plan id */
  item: string;
  itemName: string;
  amount: number;
  credits: number;
  method: PayMethod;
  provider: "test";
  status: "paid" | "failed";
  /** 결제사 승인 번호 */
  approvalId?: string;
  createdAt: string;
}

export interface Subscription {
  userId: string;
  planId: SubscriptionPlan["id"];
  status: "active" | "canceled";
  startedAt: ISODate;
  /** 이번 기간이 끝나는 날 = 다음 적립일 */
  currentPeriodEnd: ISODate;
  canceledAt?: string;
}

/** 결제사 연결부. 실제 결제사는 같은 모양으로 만든다. */
export interface PaymentProvider {
  readonly id: Order["provider"];
  readonly isTest: boolean;
  charge(req: { orderId: string; amount: number; method: PayMethod; itemName: string }): Promise<{ ok: true; approvalId: string } | { ok: false; reason: string }>;
}

/** 테스트 결제: 실제로 돈이 나가지 않는다. 금액이 0 이하면 거절한다. */
export class TestPaymentProvider implements PaymentProvider {
  readonly id = "test" as const;
  readonly isTest = true;
  async charge(req: { orderId: string; amount: number }) {
    if (req.amount <= 0) return { ok: false as const, reason: "결제 금액이 올바르지 않아요" };
    return { ok: true as const, approvalId: `TEST-${req.orderId}` };
  }
}

/** 날짜에 한 달을 더한다 (1월 31일 + 1달 = 2월 마지막 날) */
export function addMonth(d: ISODate, n = 1): ISODate {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

export function startSubscription(userId: string, planId: SubscriptionPlan["id"], today: ISODate): Subscription {
  return { userId, planId, status: "active", startedAt: today, currentPeriodEnd: addMonth(today) };
}

/**
 * 갱신일이 지났으면 적립할 기간들을 돌려주고 다음 갱신일을 옮긴다.
 * 오래 접속하지 않았으면 지난 달 수만큼(최대 12번) 돌려준다. 해지한 구독은 갱신하지 않는다.
 * 돌려준 periodStart로 idempotencyKey를 만들면 두 번 적립되지 않는다.
 */
export function renewIfDue(sub: Subscription, today: ISODate): { sub: Subscription; periods: ISODate[] } {
  if (sub.status !== "active") return { sub, periods: [] };
  const periods: ISODate[] = [];
  let end = sub.currentPeriodEnd;
  while (end <= today && periods.length < 12) {
    periods.push(end);
    end = addMonth(end);
  }
  return { sub: { ...sub, currentPeriodEnd: end }, periods };
}

/** 해지: 이번 기간 끝까지는 쓰고, 다음 적립은 하지 않는다 */
export function cancelSubscription(sub: Subscription, now: Date): Subscription {
  return { ...sub, status: "canceled", canceledAt: now.toISOString() };
}

/** 원장 항목을 사람이 읽는 말로 */
export function ledgerLabel(reason: string, memo?: string): string {
  const base: Record<string, string> = {
    signup_bonus: "가입 축하 크레딧",
    invite_bonus: "친구 초대 보상",
    contribution_connect: "합격 경험 공유 · 게시물 연결",
    contribution_proof: "합격 경험 공유 · 합격 증빙",
    contribution_structure: "합격 경험 공유 · 지원서 구조",
    subscription_refill: "구독 월간 크레딧",
    purchase: "크레딧 충전",
    task_hold: "작업 중 (잠시 잡아 둔 크레딧)",
    task_settle: "AI 사용",
    task_release: "남은 크레딧 돌려받음",
    admin_adjust: "운영진 조정",
  };
  const task: Record<string, string> = {
    notice_analysis: "공고 분석",
    skeleton: "지원서",
    coach_turn: "지원서 코치",
    content_draft: "콘텐츠 초안",
    reels_plan: "릴스 기획",
    feedback_report: "성과 리포트",
    account_lab: "계정 실험실",
  };
  const t = memo ? Object.entries(task).find(([k]) => memo.includes(k))?.[1] : undefined;
  if ((reason === "task_settle" || reason === "task_hold") && t) return `${base[reason]} · ${t}`;
  if ((reason === "purchase" || reason === "subscription_refill") && memo) return `${base[reason]} · ${memo}`;
  return base[reason] ?? reason;
}
