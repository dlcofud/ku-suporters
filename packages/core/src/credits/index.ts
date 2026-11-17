/**
 * 크레딧(토큰) 원장.
 *
 * 원칙
 * - 잔액은 저장하지 않고 원장 항목의 합으로 계산한다(감사·환불 추적이 쉬움).
 * - AI 작업은 "예약(hold) → 정산(settle)" 두 단계로 차감한다.
 *   실행 전에 예상치만큼 잡아 두고, 실제 사용량이 나오면 그만큼만 확정하고 나머지는 풀어 준다.
 * - 보상(가입, 초대, 합격자 기여)은 같은 근거로 두 번 지급되지 않도록 idempotencyKey를 쓴다.
 * - 저장소는 인터페이스(CreditStore)로 분리해서, 지금은 메모리, 나중에는 Supabase로 바꿔 끼운다.
 */

export type CreditReason =
  | "signup_bonus"
  | "invite_bonus"
  | "contribution_connect"
  | "contribution_proof"
  | "contribution_structure"
  | "subscription_refill"
  | "purchase"
  | "task_hold"
  | "task_settle"
  | "task_release"
  | "admin_adjust";

export type EntryStatus = "posted" | "pending" | "void";

export interface LedgerEntry {
  id: string;
  userId: string;
  /** 양수 = 적립, 음수 = 차감 */
  amount: number;
  reason: CreditReason;
  status: EntryStatus;
  /** 같은 키로는 한 번만 기록된다. 예: "contribution:user1:activity9:proof" */
  idempotencyKey?: string;
  /** 연결된 작업·기여 등의 ID */
  refId?: string;
  memo?: string;
  createdAt: string;
}

/** 보상 정책. 숫자는 기획 단계의 가정값이라 한곳에서 바꿀 수 있게 모아 둔다. */
export const CREDIT_POLICY = {
  signupBonus: 50,
  inviteBonus: 20,
  contribution: { connect: 10, proof: 20, structure: 20 },
  subscription: { basic: 100, pro: 300 },
  /** 1 크레딧 = 상용 LLM 토큰 몇 개 분량인지 (입력·출력 가중 합 기준) */
  tokensPerCredit: 1000,
  /** 출력 토큰이 입력보다 비싸므로 가중치를 둔다 */
  outputTokenWeight: 4,
} as const;

/** 작업별 예상 크레딧(실행 전 사용자에게 보여주는 범위). */
export const TASK_ESTIMATES: Record<TaskKind, { min: number; max: number }> = {
  notice_analysis: { min: 2, max: 6 },
  skeleton: { min: 3, max: 8 },
  content_draft: { min: 2, max: 5 },
  reels_plan: { min: 5, max: 10 },
  feedback_report: { min: 2, max: 4 },
  /** 지원서 코치와 한 번 주고받기 */
  coach_turn: { min: 1, max: 3 },
};

export type TaskKind = "notice_analysis" | "skeleton" | "content_draft" | "reels_plan" | "feedback_report" | "coach_turn";

/** 상용 API 사용량을 크레딧으로 바꾼다. 로컬 모델(tier=local)은 0. */
export function creditsForUsage(
  usage: { inputTokens: number; outputTokens: number },
  tier: "local" | "paid" = "paid",
): number {
  if (tier === "local") return 0;
  if (usage.inputTokens + usage.outputTokens === 0) return 0; // 규칙 기반으로 끝난 작업은 무료
  const weighted = usage.inputTokens + usage.outputTokens * CREDIT_POLICY.outputTokenWeight;
  return Math.max(1, Math.ceil(weighted / CREDIT_POLICY.tokensPerCredit));
}

export interface CreditStore {
  list(userId: string): Promise<LedgerEntry[]>;
  findByKey(userId: string, key: string): Promise<LedgerEntry | undefined>;
  insert(entry: LedgerEntry): Promise<void>;
  update(id: string, patch: Partial<Pick<LedgerEntry, "status" | "amount" | "memo">>): Promise<void>;
}

export class MemoryCreditStore implements CreditStore {
  private entries: LedgerEntry[] = [];
  async list(userId: string) {
    return this.entries.filter((e) => e.userId === userId);
  }
  async findByKey(userId: string, key: string) {
    return this.entries.find((e) => e.userId === userId && e.idempotencyKey === key);
  }
  async insert(entry: LedgerEntry) {
    this.entries.push(entry);
  }
  async update(id: string, patch: Partial<LedgerEntry>) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) throw new Error(`원장 항목 없음: ${id}`);
    Object.assign(e, patch);
  }
}

export class InsufficientCreditsError extends Error {
  constructor(readonly needed: number, readonly available: number) {
    super(`크레딧이 부족해요 (필요 ${needed}, 사용 가능 ${available})`);
  }
}

export interface Balance {
  /** 확정된 잔액 */
  posted: number;
  /** 작업 중이라 잡혀 있는 크레딧 */
  held: number;
  /** 지급 예정(검수 대기 중인 보상 등) */
  incoming: number;
  /** 지금 쓸 수 있는 크레딧 = posted - held */
  available: number;
}

export function computeBalance(entries: LedgerEntry[]): Balance {
  let posted = 0;
  let held = 0;
  let incoming = 0;
  for (const e of entries) {
    if (e.status === "posted") posted += e.amount;
    else if (e.status === "pending") {
      if (e.amount < 0) held += -e.amount;
      else incoming += e.amount;
    }
  }
  return { posted, held, incoming, available: posted - held };
}

let seq = 0;
const newId = () => `cr_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export class CreditLedger {
  constructor(
    private readonly store: CreditStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async balance(userId: string): Promise<Balance> {
    return computeBalance(await this.store.list(userId));
  }

  /** 적립. 같은 idempotencyKey가 이미 있으면 새로 만들지 않고 기존 항목을 돌려준다. */
  async grant(
    userId: string,
    amount: number,
    reason: CreditReason,
    opts: { idempotencyKey?: string; refId?: string; memo?: string; pending?: boolean } = {},
  ): Promise<LedgerEntry> {
    if (amount <= 0) throw new Error("적립 금액은 0보다 커야 해요");
    if (opts.idempotencyKey) {
      const existing = await this.store.findByKey(userId, opts.idempotencyKey);
      if (existing) return existing;
    }
    const entry: LedgerEntry = {
      id: newId(),
      userId,
      amount,
      reason,
      status: opts.pending ? "pending" : "posted",
      idempotencyKey: opts.idempotencyKey,
      refId: opts.refId,
      memo: opts.memo,
      createdAt: this.now().toISOString(),
    };
    await this.store.insert(entry);
    return entry;
  }

  /** 회원가입 무료 크레딧. 사용자당 한 번만. */
  grantSignupBonus(userId: string) {
    return this.grant(userId, CREDIT_POLICY.signupBonus, "signup_bonus", {
      idempotencyKey: `signup:${userId}`,
    });
  }

  /** 지급 예정(pending) 보상을 확정한다. 검수 통과 시 호출. */
  async confirmPending(entryId: string) {
    await this.store.update(entryId, { status: "posted" });
  }

  /** 지급 예정 보상을 취소한다. 검수 반려 시 호출. */
  async voidPending(entryId: string, memo?: string) {
    await this.store.update(entryId, { status: "void", memo });
  }

  /** 작업 실행 전에 최대 예상치만큼 잡아 둔다. */
  async hold(userId: string, task: TaskKind, refId: string): Promise<LedgerEntry> {
    const need = TASK_ESTIMATES[task].max;
    const bal = await this.balance(userId);
    if (bal.available < need) throw new InsufficientCreditsError(need, bal.available);
    const entry: LedgerEntry = {
      id: newId(),
      userId,
      amount: -need,
      reason: "task_hold",
      status: "pending",
      refId,
      memo: task,
      createdAt: this.now().toISOString(),
    };
    await this.store.insert(entry);
    return entry;
  }

  /**
   * 작업이 끝나면 실제 사용량만큼만 확정 차감하고 예약은 푼다.
   * 실제 사용량이 예약보다 많으면 예약 범위(max)까지만 받는다(사용자에게 보여준 상한을 지킨다).
   */
  async settle(
    hold: LedgerEntry,
    usage: { inputTokens: number; outputTokens: number },
    tier: "local" | "paid" = "paid",
  ): Promise<{ charged: number }> {
    if (hold.reason !== "task_hold" || hold.status !== "pending") {
      throw new Error("정산할 수 있는 예약이 아니에요");
    }
    const cap = -hold.amount;
    const charged = Math.min(cap, creditsForUsage(usage, tier));
    await this.store.update(hold.id, { status: "void", memo: `${hold.memo ?? ""} (정산 완료)` });
    if (charged > 0) {
      await this.store.insert({
        id: newId(),
        userId: hold.userId,
        amount: -charged,
        reason: "task_settle",
        status: "posted",
        refId: hold.refId,
        memo: hold.memo,
        createdAt: this.now().toISOString(),
      });
    }
    return { charged };
  }

  /** 작업이 실패하면 예약을 그대로 풀어 준다. */
  async release(hold: LedgerEntry) {
    await this.store.update(hold.id, { status: "void", memo: `${hold.memo ?? ""} (실패로 해제)` });
  }
}
