/**
 * 서포터즈 전용 계정 생성 가이드 (요구사항 3).
 *
 * 만들어 주는 것
 *  - 계정 컨셉 3안
 *  - 아이디(사용자 이름) 후보와 규칙 검사
 *  - 프로필 소개글(150자 이내)
 *  - 하이라이트 구성
 *  - 첫 9개 게시물 그리드 기획 (planner의 첫 일정과 이어짐)
 *  - 프로페셔널 계정 전환 체크리스트 (예약 게시·인사이트 API를 쓰려면 필요)
 *
 * 실제 계정 개설은 사용자가 인스타 앱에서 직접 한다(자동 가입은 약관 위반).
 */

import type { ContentFormat } from "../shared.js";
import { FORMAT_LABEL } from "../shared.js";

export interface AccountInput {
  /** 활동 이름. 예: "달콤제과 서포터즈 13기" */
  activityName: string;
  /** 주최 브랜드 이름. 예: "달콤제과" */
  brand: string;
  /** 분야. 예: "F&B·식품" */
  field: string;
  /** 영문 닉네임 재료. 예: "chaeryeong" */
  nickname: string;
  interests?: string[];
}

export interface AccountConcept {
  name: string;
  oneLiner: string;
  tone: string;
}

export interface GridCell {
  position: number;
  format: Exclude<ContentFormat, "check">;
  title: string;
}

export interface AccountKit {
  concepts: AccountConcept[];
  usernames: string[];
  bio: string;
  highlights: string[];
  grid: GridCell[];
  professionalChecklist: { step: string; why: string }[];
}

export const USERNAME_MAX = 30;
export const BIO_MAX = 150;

/** 인스타 사용자 이름 규칙: 영문 소문자·숫자·마침표·밑줄, 30자 이하, 마침표로 시작·끝 불가, 마침표 연속 불가 */
export function validateUsername(u: string): string[] {
  const errors: string[] = [];
  if (u.length === 0 || u.length > USERNAME_MAX) errors.push(`1~${USERNAME_MAX}자여야 해요`);
  if (!/^[a-z0-9._]+$/.test(u)) errors.push("영문 소문자, 숫자, 마침표(.), 밑줄(_)만 쓸 수 있어요");
  if (u.startsWith(".") || u.endsWith(".")) errors.push("마침표로 시작하거나 끝날 수 없어요");
  if (u.includes("..")) errors.push("마침표를 연달아 쓸 수 없어요");
  return errors;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 14);
}

const FIELD_WORDS: Record<string, string[]> = {
  "F&B·식품": ["snack", "taste", "bite"],
  "뷰티·패션": ["beauty", "look", "daily"],
  "IT·테크": ["tech", "app", "lab"],
  금융: ["money", "finance", "smart"],
  "언론·미디어": ["press", "story", "news"],
  "음악·엔터": ["music", "play", "beat"],
};

export function suggestUsernames(input: AccountInput): string[] {
  const nick = slug(input.nickname) || "me";
  const words = FIELD_WORDS[input.field] ?? ["daily", "log", "note"];
  const raw = [
    `${nick}.${words[0]}`,
    `${words[1]}_with_${nick}`,
    `${nick}_${words[2]}log`,
    `${nick}.supporters`,
    `${words[0]}.${nick}.log`,
  ];
  return [...new Set(raw.map((u) => u.slice(0, USERNAME_MAX)))].filter((u) => validateUsername(u).length === 0);
}

export function buildConcepts(input: AccountInput): AccountConcept[] {
  const interest = input.interests?.[0] ?? "일상";
  return [
    {
      name: "리뷰어형",
      oneLiner: `${input.brand} 신제품을 대학생 시선으로 3초 만에 리뷰하는 계정`,
      tone: "솔직하고 빠른 말투, 결론 먼저",
    },
    {
      name: "생활 밀착형",
      oneLiner: `${interest} 속에 ${input.brand}를 자연스럽게 녹이는 대학생 일상 계정`,
      tone: "친근한 1인칭, 직접 찍은 사진 중심",
    },
    {
      name: "분석가형",
      oneLiner: `${input.field} 브랜드 SNS를 분석하고 직접 만들어 보는 예비 마케터 계정`,
      tone: "정보형 카드뉴스, 저장하고 싶은 콘텐츠",
    },
  ];
}

export function buildBio(input: AccountInput, concept: AccountConcept): string {
  const lines = [`${input.field} 좋아하는 대학생`, concept.oneLiner.replace(/하는 .*계정$/, "해요"), `📍 ${input.activityName} 준비 중`];
  let bio = lines.join("\n");
  if (bio.length > BIO_MAX) bio = bio.slice(0, BIO_MAX - 1) + "…";
  return bio;
}

/** 첫 9개 그리드. 3열 그리드에서 같은 포맷이 한 줄에 몰리지 않게 섞는다. */
export function buildGrid(input: AccountInput): GridCell[] {
  const plan: [Exclude<ContentFormat, "check">, string][] = [
    ["reels", "자기소개 · 이 계정을 만든 이유"],
    ["cardnews", `${input.brand} 공식 SNS 분석`],
    ["post", "직접 찍은 첫 언박싱"],
    ["post", "나의 최애 제품 기록"],
    ["reels", "신제품 3초 리뷰"],
    ["cardnews", "경쟁 브랜드 SNS 비교"],
    ["cardnews", "만들고 싶은 콘텐츠 미리보기"],
    ["post", "일상 속 브랜드 사진"],
    ["reels", "제품 활용 챌린지"],
  ];
  return plan.map(([format, title], i) => ({ position: i + 1, format, title }));
}

export const PROFESSIONAL_CHECKLIST: { step: string; why: string }[] = [
  { step: "설정 > 계정 유형 및 도구 > 프로페셔널 계정으로 전환 (크리에이터 추천)", why: "인사이트와 게시 API는 프로페셔널 계정에서만 쓸 수 있어요" },
  { step: "공개 계정으로 유지", why: "지원서에 링크를 넣으면 담당자가 피드를 확인해요" },
  { step: "서포트랩에서 인스타 계정 연결 (공식 로그인)", why: "예약 게시와 성과 분석에 필요한 권한을 받아요. 비밀번호는 받지 않아요" },
  { step: "프로필 사진·소개글·하이라이트 먼저 채우기", why: "첫인상이 정리된 계정이 신뢰를 줘요" },
];

export function buildAccountKit(input: AccountInput, conceptIndex = 0): AccountKit {
  const concepts = buildConcepts(input);
  const concept = concepts[conceptIndex] ?? concepts[0]!;
  return {
    concepts,
    usernames: suggestUsernames(input),
    bio: buildBio(input, concept),
    highlights: ["소개", `${input.brand} 리뷰`, "콘텐츠 기획", "활동 기록"],
    grid: buildGrid(input),
    professionalChecklist: PROFESSIONAL_CHECKLIST,
  };
}

export function describeGrid(grid: GridCell[]): string {
  return grid.map((c) => `${c.position}. [${FORMAT_LABEL[c.format]}] ${c.title}`).join("\n");
}
