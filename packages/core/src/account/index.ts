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

/* ------------------------------------------------------------------ */
/* 이미 있는 계정 관리: 지금 프로필 점검 + 바꿀 만한 추천                  */
/* ------------------------------------------------------------------ */

/** 지금 계정의 프로필. 인스타 연결이면 API에서, 아니면 사용자가 옮겨 적은 값 */
export interface AccountProfile {
  username?: string;
  /** 프로필 이름 칸 (검색에 걸리는 이름) */
  name?: string;
  bio?: string;
  website?: string;
  followers?: number;
  mediaCount?: number;
  hasPicture?: boolean;
  /** 사용자가 적은 관심 분야. 인스타에는 없는 값으로 추천에만 쓴다 */
  interest?: string;
  source: "instagram" | "manual";
  at: string;
}

/** 활동에 저장하는 계정 관리 상태. 예전 '계정 만들기' 결과(AccountKit)가 남아 있을 수 있다 */
export type AccountState = Partial<AccountKit> & { profile?: AccountProfile };

export interface ProfileCheck {
  id: "username" | "bio" | "who" | "fit" | "link" | "name" | "picture" | "posts";
  ok: boolean;
  label: string;
  /** 고칠 때 할 일 (ok면 없음) */
  tip?: string;
}

export interface ProfileContext {
  activityName: string;
  brand: string;
  /** 활동 분야나 관심사. 소개글 추천에 넣는다 */
  interests?: string[];
}

const WHO = /대학생|학생|\d{2}학번|대학교|학과|전공/;

/** 지금 프로필이 서포터즈 지원용으로 준비됐는지 항목별로 본다. 사실(글자 수·포함 여부)만 보고 판단한다 */
export function checkProfile(p: AccountProfile, ctx: ProfileContext): ProfileCheck[] {
  const bio = (p.bio ?? "").trim();
  const words = [ctx.brand, ...ctx.activityName.split(/\s+/).filter((w) => w.length >= 2 && !/서포터즈|기|모집|공식/.test(w)), ...(ctx.interests ?? [])]
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  const out: ProfileCheck[] = [];
  if (p.username !== undefined) {
    const errs = validateUsername(p.username);
    out.push({ id: "username", ok: errs.length === 0, label: "아이디 규칙", tip: errs[0] });
  }
  out.push(
    !bio
      ? { id: "bio", ok: false, label: "소개글", tip: "소개글이 비어 있어요. 아래 추천 중 하나로 시작해 보세요" }
      : bio.length > BIO_MAX
        ? { id: "bio", ok: false, label: `소개글 ${bio.length}자`, tip: `인스타는 ${BIO_MAX}자까지예요. ${bio.length - BIO_MAX}자를 줄여 주세요` }
        : { id: "bio", ok: true, label: `소개글 ${bio.length}/${BIO_MAX}자` },
  );
  out.push({ id: "who", ok: WHO.test(bio), label: "누구인지 보여요", tip: "‘대학생’, 학과·학번처럼 누구인지 한눈에 보이는 말을 넣어 주세요" });
  out.push({
    id: "fit",
    ok: words.some((w) => bio.includes(w)),
    label: "이 활동과 이어져요",
    tip: `담당자가 보고 바로 알 수 있게 ${ctx.brand ? `‘${ctx.brand}’나 ` : ""}관심 분야를 소개글에 넣어 주세요`,
  });
  out.push({ id: "link", ok: !!p.website?.trim(), label: "프로필 링크", tip: "노션 포트폴리오나 대표 콘텐츠 링크를 넣으면 지원서의 SNS 주소를 볼 때 함께 봐요" });
  out.push({ id: "name", ok: !!p.name && p.name.trim() !== p.username, label: "이름 칸", tip: "이름 칸은 검색에 걸려요. 예: ‘채령 | 대학생 리뷰’" });
  if (p.source === "instagram") {
    if (p.hasPicture !== undefined) out.push({ id: "picture", ok: p.hasPicture, label: "프로필 사진", tip: "얼굴이나 계정 분위기가 보이는 사진을 올려 주세요" });
    if (p.mediaCount !== undefined) out.push({ id: "posts", ok: p.mediaCount >= 3, label: `게시물 ${p.mediaCount}개`, tip: "피드를 볼 때 비어 보이지 않게 3개 이상 올려 두세요. 업로드 일정의 첫 콘텐츠부터 올리면 돼요" });
  }
  return out;
}

export interface ProfileSuggestions {
  bios: { concept: string; text: string }[];
  names: string[];
  highlights: string[];
  links: string[];
}

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** 바꿀 만한 소개글·이름·하이라이트·링크 추천. 지어낸 수치나 경력은 넣지 않는다 */
export function suggestProfile(p: AccountProfile, ctx: ProfileContext): ProfileSuggestions {
  const interest = ctx.interests?.[0] ?? "일상";
  const brand = ctx.brand || "브랜드";
  const first = (p.name ?? p.username ?? "").split(/[\s|·_.]/)[0] || "이름";
  const bios = [
    { concept: "리뷰어형", text: `${interest} 좋아하는 대학생\n${brand} 신제품, 대학생 시선으로 솔직하게 리뷰해요\n📍 ${ctx.activityName} 준비 중` },
    { concept: "생활 밀착형", text: `${interest} 기록하는 대학생 🎒\n하루 속에 ${brand}를 자연스럽게 담아요\n📍 ${ctx.activityName} 준비 중` },
    { concept: "분석가형", text: `예비 마케터 · 대학생\n${brand} SNS를 분석하고 직접 만들어 봐요\n📍 ${ctx.activityName} 준비 중` },
  ].map((b) => ({ ...b, text: clip(b.text, BIO_MAX) }));
  return {
    bios,
    names: [`${first} | 대학생 ${interest}`, `${first} · ${brand} 리뷰`, `${first} | 콘텐츠 기록`].map((n) => clip(n, 30)),
    highlights: ["소개", `${brand} 리뷰`, "콘텐츠 기획", "활동 기록"],
    links: ["노션 포트폴리오 (지원서·만든 콘텐츠 모음)", "가장 반응 좋았던 릴스 링크", "링크 모음 페이지 (블로그·유튜브가 더 있다면)"],
  };
}
