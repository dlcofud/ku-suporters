/**
 * 합격자 자료 업로드 → 검수 → 크레딧 보상.
 *
 * 흐름: draft → submitted → in_review → approved | rejected
 *       (어느 단계에서든 사용자가 철회하면 withdrawn, 데이터 삭제 대상)
 *
 * 동의 4종(모두 필수, 버전과 시각을 기록)
 *  - copyright_use   : 저작물 이용 동의 (고른 게시물의 지표·주제를 익명 통계로 쓰는 것)
 *  - personal_info   : 개인정보 수집·이용 동의
 *  - withdrawal_info : 철회 방법 안내 확인
 *  - own_work        : 본인이 만든 저작물임을 확인
 *
 * 보상: 계정 연결·게시물 선택 10 / 합격 증빙 +20 / 지원서 구조 공유 +20 / 합격 후기 직접 쓰기 +20
 *  - 게시물을 고르거나(인스타 연결) 후기를 쓰거나, 둘 중 하나만 있어도 낼 수 있다.
 *  - 후기는 코드북으로 코딩해 승인되면 합격 경향에 들어간다. 후기 원문은 결정 뒤 지운다(점수·요약만 남김).
 *  - 합격 증빙은 선택: 있으면 +20이고, 경향에서 '결과 확인된 합격'으로 센다.
 *  - 불합격 결과도 받는다(비교 기준이 되므로). 이 경우 합격 증빙 보상은 없다.
 *  - 검수 전에는 '지급 예정(pending)', 승인 시 확정, 반려 시 취소.
 *  - 같은 사용자·같은 활동은 한 번만.
 */

import { CREDIT_POLICY, type CreditLedger, type LedgerEntry } from "../credits/index.js";

export type ConsentKind = "copyright_use" | "personal_info" | "withdrawal_info" | "own_work";
export const REQUIRED_CONSENTS: ConsentKind[] = ["copyright_use", "personal_info", "withdrawal_info", "own_work"];

/** 화면에 보여줄 동의 문구. 문구를 바꾸면 CONSENT_VERSION도 올린다. */
export const CONSENT_VERSION = "2026-11-v2";
export const CONSENT_TEXT: Record<ConsentKind, string> = {
  copyright_use:
    "선택한 게시물의 조회수·좋아요·저장 수와 주제, 직접 쓴 합격 후기의 요약·점수를 익명 통계로 이용하는 데 동의합니다. 사진·영상·캡션 원본과 후기 원문은 검수 후 저장하지 않습니다.",
  personal_info:
    "인스타그램 계정 식별자(연결한 경우), 활동명, 결과(합격/불합격), 업로드한 증빙 이미지를 검수와 통계 목적으로 수집·이용하는 데 동의합니다. 증빙 이미지는 검수 후 삭제합니다.",
  withdrawal_info:
    "설정 > 데이터 공유에서 언제든 공유를 철회할 수 있고, 철회하면 제가 제공한 데이터가 삭제된다는 안내를 확인했습니다. 이미 지급된 크레딧은 회수되지 않습니다.",
  own_work: "선택한 게시물과 제출하는 자료(후기 포함)가 제가 직접 만든 저작물이고, 남의 개인정보가 들어 있지 않음을 확인합니다.",
};

export type ContributionStatus = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "withdrawn";
export type ApplicationResult = "final_pass" | "document_pass" | "fail";

export interface ConsentRecord {
  kind: ConsentKind;
  agreed: boolean;
  version: string;
  at: string;
}

export interface Contribution {
  id: string;
  userId: string;
  /** 활동 식별자 (예: "dalkom-supporters-13") */
  activityId: string;
  activityName: string;
  result?: ApplicationResult;
  /** 연결한 인스타 계정 ID (OAuth로 받은 값) */
  igAccountId?: string;
  /** 지원할 때 쓴 게시물만 선택 */
  selectedMediaIds: string[];
  /** 합격 증빙 이미지의 저장 위치 (검수 후 삭제) */
  proofUploadRef?: string;
  /** 증빙에서 이름·연락처를 가렸다고 사용자가 확인했는지 */
  proofRedacted?: boolean;
  /** 지원서 구조 공유 (문항별로 무엇을 강조했는지만, 원문 아님) */
  structure?: { question: string; emphasis: string[] }[];
  /** 직접 쓴 합격 후기 (검수가 끝나면 지운다) */
  story?: string;
  /** 후기를 코딩한 결과(CodedReview)의 id */
  storyReviewId?: string;
  /** 분야 (예: F&B·식품) — 경향 분석에서 분야별로 보기 위해 */
  field?: string;
  consents: ConsentRecord[];
  status: ContributionStatus;
  review?: ReviewRecord;
  rewardEntryIds: string[];
  /** 제출할 때 계산한 보상 합계 (후기·증빙을 지운 뒤에도 보여 주려고 남긴다) */
  rewardTotal?: number;
  history: { at: string; from: ContributionStatus; to: ContributionStatus; by: string; note?: string }[];
}

export type ReviewCheck =
  | "proof_matches_activity"
  | "proof_shows_result"
  | "personal_info_hidden"
  | "media_owned_by_account"
  | "not_duplicate"
  | "story_is_own";

export const REVIEW_CHECKS: Record<ReviewCheck, string> = {
  proof_matches_activity: "증빙의 활동명·기수가 신청한 활동과 같다",
  proof_shows_result: "증빙에 합격 사실(문자·메일)이 보인다",
  personal_info_hidden: "증빙에 이름·전화번호·이메일이 가려져 있다",
  media_owned_by_account: "선택한 게시물이 연결한 계정의 게시물이다",
  not_duplicate: "같은 사용자·같은 활동으로 이미 보상받은 기록이 없다",
  story_is_own: "후기가 본인 경험이고, 다른 글을 베끼거나 남의 개인정보를 담지 않았다",
};

/** 후기로 인정하는 최소 글자 수 */
export const STORY_MIN = 150;

export interface ReviewRecord {
  reviewerId: string;
  checks: Partial<Record<ReviewCheck, boolean>>;
  decision: "approve" | "reject";
  reason?: string;
  at: string;
}

export class ContributionError extends Error {}

const TRANSITIONS: Record<ContributionStatus, ContributionStatus[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["in_review", "withdrawn"],
  in_review: ["approved", "rejected", "withdrawn"],
  approved: ["withdrawn"],
  rejected: ["withdrawn"],
  withdrawn: [],
};

function move(c: Contribution, to: ContributionStatus, by: string, at: string, note?: string): Contribution {
  if (!TRANSITIONS[c.status].includes(to)) throw new ContributionError(`'${c.status}'에서 '${to}'로 바꿀 수 없어요`);
  return { ...c, status: to, history: [...c.history, { at, from: c.status, to, by, note }] };
}

export function newContribution(id: string, userId: string, activityId: string, activityName: string): Contribution {
  return { id, userId, activityId, activityName, selectedMediaIds: [], consents: [], status: "draft", rewardEntryIds: [], history: [] };
}

export function recordConsents(c: Contribution, agreed: Partial<Record<ConsentKind, boolean>>, at: string): Contribution {
  const consents = REQUIRED_CONSENTS.map((kind) => ({ kind, agreed: !!agreed[kind], version: CONSENT_VERSION, at }));
  return { ...c, consents };
}

/** 제출 가능 여부와 빠진 항목. UI의 '제출하기' 버튼 활성화에 쓴다. */
export function validateForSubmit(c: Contribution): string[] {
  const missing: string[] = [];
  if (!c.result) missing.push("결과(최종 합격·서류 합격·불합격)를 선택해 주세요");
  const story = (c.story ?? "").trim();
  if (story && story.length < STORY_MIN) missing.push(`합격 후기는 ${STORY_MIN}자 이상 써 주세요 (지금 ${story.length}자)`);
  if (c.selectedMediaIds.length > 0 && !c.igAccountId) missing.push("게시물을 공유하려면 인스타그램 계정을 연결해 주세요");
  if (c.selectedMediaIds.length === 0 && !story) missing.push(`지원할 때 쓴 게시물을 고르거나, 합격 후기를 ${STORY_MIN}자 이상 써 주세요`);
  if (c.proofUploadRef && !c.proofRedacted) missing.push("증빙에서 이름·연락처를 가렸는지 확인해 주세요");
  for (const kind of REQUIRED_CONSENTS) {
    const r = c.consents.find((x) => x.kind === kind);
    if (!r?.agreed) missing.push(`필수 동의가 필요해요: ${CONSENT_TEXT[kind].slice(0, 18)}…`);
    else if (r.version !== CONSENT_VERSION) missing.push("동의 문구가 바뀌었어요. 다시 동의해 주세요");
  }
  return missing;
}

/** 보상 계산 (순수 함수). 화면의 '받을 수 있는 크레딧'과 실제 지급이 같은 계산을 쓴다. */
export function computeReward(c: Pick<Contribution, "result" | "selectedMediaIds" | "proofUploadRef" | "structure" | "story">) {
  const p = CREDIT_POLICY.contribution;
  const parts: { key: "connect" | "proof" | "structure" | "story"; label: string; amount: number }[] = [];
  if (c.selectedMediaIds.length > 0) parts.push({ key: "connect", label: "계정 연결 · 게시물 선택", amount: p.connect });
  if (c.result && c.result !== "fail" && c.proofUploadRef) parts.push({ key: "proof", label: "합격 증빙", amount: p.proof });
  if (c.structure && c.structure.length > 0) parts.push({ key: "structure", label: "지원서 구조 공유", amount: p.structure });
  if ((c.story ?? "").trim().length >= STORY_MIN) parts.push({ key: "story", label: "합격 후기 쓰기", amount: p.story });
  return { parts, total: parts.reduce((s, x) => s + x.amount, 0) };
}

const rewardKey = (c: Contribution, part: string) => `contribution:${c.userId}:${c.activityId}:${part}`;

/** 제출: 상태를 바꾸고 보상을 '지급 예정'으로 기록한다. */
export async function submit(c: Contribution, ledger: CreditLedger, at: string): Promise<Contribution> {
  const missing = validateForSubmit(c);
  if (missing.length) throw new ContributionError(missing.join("\n"));
  let next = move(c, "submitted", c.userId, at);
  const entries: LedgerEntry[] = [];
  for (const part of computeReward(c).parts) {
    const reason =
      part.key === "connect" ? "contribution_connect" : part.key === "proof" ? "contribution_proof" : part.key === "story" ? "contribution_story" : "contribution_structure";
    entries.push(
      await ledger.grant(c.userId, part.amount, reason, {
        idempotencyKey: rewardKey(c, part.key),
        refId: c.id,
        memo: `${c.activityName} · ${part.label}`,
        pending: true,
      }),
    );
  }
  next = { ...next, rewardEntryIds: entries.map((e) => e.id), rewardTotal: computeReward(c).total };
  return next;
}

/** 이 공유를 승인하려면 확인해야 하는 항목 (낸 것에 맞춰서만 묻는다) */
export function checksNeeded(c: Pick<Contribution, "result" | "selectedMediaIds" | "proofUploadRef" | "story">): ReviewCheck[] {
  const out: ReviewCheck[] = [];
  if (c.proofUploadRef && c.result !== "fail") out.push("proof_matches_activity", "proof_shows_result", "personal_info_hidden");
  if (c.selectedMediaIds.length > 0) out.push("media_owned_by_account");
  if ((c.story ?? "").trim()) out.push("story_is_own");
  out.push("not_duplicate");
  return out;
}

export function startReview(c: Contribution, reviewerId: string, at: string): Contribution {
  return move(c, "in_review", reviewerId, at);
}

/**
 * 검수 결정. 승인하려면 해당하는 검수 항목이 모두 통과해야 한다.
 * - 불합격 결과(fail)는 증빙 관련 항목을 보지 않는다.
 */
export async function decide(
  c: Contribution,
  review: Omit<ReviewRecord, "at">,
  ledger: CreditLedger,
  at: string,
): Promise<Contribution> {
  const needed = checksNeeded(c);
  if (review.decision === "approve") {
    const failed = needed.filter((k) => !review.checks[k]);
    if (failed.length) throw new ContributionError(`승인하려면 확인이 필요해요: ${failed.map((k) => REVIEW_CHECKS[k]).join(", ")}`);
  } else if (!review.reason) {
    throw new ContributionError("반려 사유를 적어 주세요");
  }
  const to = review.decision === "approve" ? "approved" : "rejected";
  const next = move(c, to, review.reviewerId, at, review.reason);
  for (const id of c.rewardEntryIds) {
    if (to === "approved") await ledger.confirmPending(id);
    else await ledger.voidPending(id, `검수 반려: ${review.reason}`);
  }
  // 증빙 이미지와 후기 원문은 결정 직후 지운다 (증빙 파일 실제 삭제는 저장소 쪽에서 처리)
  return { ...next, review: { ...review, at }, proofUploadRef: undefined, story: undefined };
}

/**
 * 철회: 데이터 삭제 대상으로 표시한다.
 * 아직 확정되지 않은 보상은 취소하고, 이미 확정된 보상은 회수하지 않는다(동의 문구에 안내).
 */
export async function withdraw(c: Contribution, ledger: CreditLedger, at: string): Promise<Contribution> {
  const next = move(c, "withdrawn", c.userId, at);
  if (c.status === "submitted" || c.status === "in_review") {
    for (const id of c.rewardEntryIds) await ledger.voidPending(id, "사용자 철회");
  }
  return { ...next, selectedMediaIds: [], structure: undefined, proofUploadRef: undefined, igAccountId: undefined, story: undefined };
}
