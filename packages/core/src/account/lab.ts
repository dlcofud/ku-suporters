/**
 * 계정 실험실 — 대화하며 계정 방향을 끓여 내는 곳.
 *
 * 사용자가 재료(방향 · 보여 줄 한 사람 · 전하고 싶은 것 · 특기 · 독창성 · 참고)를 하나씩 솥에 넣으면
 * 생명체(나무 정령)가 한 단계씩 자라고, '끓이기'를 하면 AI가 계정 정체성 · 이름 칸 · 소개글 · 콘텐츠 기둥 ·
 * 2주 성장 방향을 만든다. 그 뒤에는 대화로 계속 고친다.
 *
 * 만드는 원칙 (2026년 계정 성장 글들에서 공통으로 나온 것):
 *  - 위치부터: 주제 하나, 보여 줄 '딱 한 사람'을 정하면 프로필과 글이 같이 선명해진다.
 *  - 프로필은 약속: 누구인지 + 누구에게 + 무엇을 얻는지 + 다음에 뭘 하면 되는지. 추상어 대신 구체어, 검색될 키워드.
 *  - 이름 · 소개글 · 게시물 키워드가 일관돼야 알고리즘이 계정을 분류한다.
 *  - 콘텐츠 기둥 3개 (알려 주기 · 공감하기 · 보여 주기)를 번갈아 낸다. 아무 글이나 올리지 않는다.
 *  - 남이 '친구에게 보내고 싶은가'가 기준. 내 체면보다 보는 사람의 흥미 · 유익을 먼저.
 *  - 스레드는 주제를 좁히고 답글로 대화를 잇는 계정이 큰다. 맞팔로 늘린 숫자는 독이 된다.
 *  - 블로그는 메인 주제 1개 + 서브 1개, 넓은 키워드 말고 장면이 보이는 세부 키워드.
 * 없는 경력 · 숫자 · 수상은 만들지 않는다.
 */
import type { LLMClient } from "../llm/index.js";
import { extractJson } from "../llm/index.js";
import type { AccountProfile } from "./index.js";

/** 인스타 소개글 최대 길이 (index.ts의 BIO_MAX와 같다. 순환 import를 피하려고 따로 둔다) */
const BIO_MAX = 150;

export type LabSlot = "direction" | "audience" | "message" | "strength" | "unique" | "reference";

export interface LabQuestion {
  slot: LabSlot;
  /** 실험실이 묻는 말 */
  ask: string;
  /** 왜 묻는지 한 줄 */
  why: string;
  /** 눌러서 바로 넣는 답 */
  chips: string[];
  placeholder: string;
  /** 재료 이름 (솥에 들어갈 때 보이는 말) */
  potion: string;
  /** 물약 색 */
  color: string;
}

export const LAB_QUESTIONS: LabQuestion[] = [
  {
    slot: "direction",
    ask: "이 계정을 어떤 방향으로 키우고 싶나요?",
    why: "방향이 정해져야 이름 · 소개글 · 게시물이 한 줄로 이어져요.",
    chips: ["정보를 알려 주는 전문가형", "일상 · 성장을 기록하는 공감형", "제품을 써 보는 리뷰형", "아직 잘 모르겠어요"],
    placeholder: "예: 자취 요리를 쉽게 알려 주는 계정",
    potion: "방향의 물약",
    color: "#6c8cff",
  },
  {
    slot: "audience",
    ask: "딱 한 사람에게 보여 준다면, 그 사람은 누구인가요?",
    why: "보는 사람을 좁힐수록 글이 선명해지고, 그런 사람을 찾아 보여 줘요.",
    chips: ["자취 시작한 새내기", "시험 기간 대학생", "취업 준비하는 친구", "같은 취미를 가진 사람"],
    placeholder: "예: 첫 노트북을 고르는 문과 새내기",
    potion: "눈길의 물약",
    color: "#ff9f6b",
  },
  {
    slot: "message",
    ask: "이 계정에서 꼭 전하고 싶은 한 가지는 뭐예요?",
    why: "한 문장으로 말할 수 있으면 소개글 첫 줄이 돼요.",
    chips: ["돈 · 시간을 아끼는 방법", "솔직한 후기", "작은 성장의 기록", "몰랐던 재미"],
    placeholder: "예: 비싼 장비 없이도 예쁘게 찍을 수 있다",
    potion: "진심의 물약",
    color: "#ff6b9a",
  },
  {
    slot: "strength",
    ask: "나만의 특기나 장점은요? 작아도 좋아요.",
    why: "잘하는 걸 계정에 이으면 오래 꾸준히 할 수 있어요.",
    chips: ["사진 · 영상을 잘 찍어요", "정리를 잘해요", "말을 재밌게 해요", "꾸준히 기록해요"],
    placeholder: "예: 한 장으로 요약하는 걸 잘해요",
    potion: "재능의 물약",
    color: "#ffd25a",
  },
  {
    slot: "unique",
    ask: "남들과 다른 나만의 점(독창성)은 뭘까요?",
    why: "전공 · 경험 · 취미의 조합이 다른 계정과 구분되는 이유가 돼요.",
    chips: ["전공과 취미의 조합", "특이한 경험", "남다른 시선 · 말투", "꾸준한 기록 자체"],
    placeholder: "예: 컴퓨터학과인데 손글씨 다꾸를 해요",
    potion: "반짝이 가루",
    color: "#b07cff",
  },
  {
    slot: "reference",
    ask: "닮고 싶은 계정이나 참고 이미지가 있나요?",
    why: "분위기 · 말투 · 구성을 참고해서 내 것으로 바꿔요. 그대로 따라 하지는 않아요.",
    chips: ["아직 없어요"],
    placeholder: "예: @계정이름 또는 링크, '사진은 밝고 글씨는 손글씨 느낌'",
    potion: "영감의 물약",
    color: "#46c4a6",
  },
];

export interface LabIngredient {
  slot: LabSlot;
  text: string;
  /** 참고 이미지를 AI가 읽고 적은 메모 (이미지는 저장하지 않는다) */
  imageNote?: string;
  at: string;
}

export interface LabChat {
  role: "lab" | "me";
  text: string;
  at: string;
}

export interface LabBio {
  concept: string;
  text: string;
  /** 이 문구가 왜 통하는지 한 줄 */
  why: string;
}

export interface LabPillar {
  name: string;
  kind: "teach" | "relate" | "show";
  /** 바로 올릴 수 있는 글감 */
  ideas: string[];
}

export interface LabBrew {
  /** 생명체 이름 (계정 컨셉을 담은 짧은 이름) */
  creature: string;
  /** 계정 정체성 한 줄 */
  identity: string;
  names: string[];
  bios: LabBio[];
  pillars: LabPillar[];
  /** 앞으로 2주 동안 할 일 */
  steps: string[];
  /** 스레드 · 블로그로 넓힐 때 */
  expand: { threads: string; blog: string };
  /** 지원하는 서포터즈와 어떻게 이어지는지 */
  fit: string;
  model: string;
  at: string;
}

export interface LabState {
  ingredients: LabIngredient[];
  chat: LabChat[];
  brew?: LabBrew;
}

export interface LabContext {
  activityName: string;
  brand: string;
  /** 공고에서 뽑은 활동 · 우대 키워드 */
  noticeWords: string[];
  /** 합격 후기에서 강했던 요인 (예: "분야 연결 경험", "진정성 · 스토리") */
  trendStrong: string[];
  profile?: AccountProfile;
  /** 최근 게시물 요약 (예: "릴스 4개 평균 조회 820, 카드뉴스 2개") */
  mediaSummary?: string;
  blogConnected?: boolean;
}

export const emptyLab = (): LabState => ({ ingredients: [], chat: [] });

export const questionFor = (slot: LabSlot) => LAB_QUESTIONS.find((q) => q.slot === slot)!;

/** 아직 넣지 않은 다음 재료 (모두 넣었으면 undefined) */
export function nextQuestion(lab: LabState): LabQuestion | undefined {
  const has = new Set(lab.ingredients.map((i) => i.slot));
  return LAB_QUESTIONS.find((q) => !has.has(q.slot));
}

/** 끓일 수 있는지: 방향을 포함해 재료 3개 이상 */
export function canBrew(lab: LabState): boolean {
  const slots = new Set(lab.ingredients.map((i) => i.slot));
  return slots.size >= 3;
}

export const STAGES = ["빈 플라스크", "씨앗", "새싹", "떡잎 정령", "어린 나무 정령", "꽃 핀 나무 정령", "열매 맺은 나무 정령"] as const;

/** 생명체가 자란 단계 0~6: 재료 하나에 한 단계(최대 5), 끓이면 6 */
export function stageOf(lab: LabState): number {
  const n = new Set(lab.ingredients.map((i) => i.slot)).size;
  return lab.brew ? 6 : Math.min(n, 5);
}

/** 재료를 넣는다. 같은 칸이면 바꾼다 */
export function addIngredient(lab: LabState, ing: Omit<LabIngredient, "at">, at: string): LabState {
  const text = ing.text.trim().slice(0, 300);
  const rest = lab.ingredients.filter((i) => i.slot !== ing.slot);
  const q = questionFor(ing.slot);
  return {
    ...lab,
    ingredients: [...rest, { ...ing, text, at }],
    chat: [...lab.chat, { role: "lab" as const, text: q.ask, at }, { role: "me" as const, text: text + (ing.imageNote ? " (참고 이미지 1장)" : ""), at }].slice(-60),
  };
}

export function removeIngredient(lab: LabState, slot: LabSlot): LabState {
  return { ...lab, ingredients: lab.ingredients.filter((i) => i.slot !== slot) };
}

const SLOT_LABEL: Record<LabSlot, string> = {
  direction: "키우고 싶은 방향",
  audience: "보여 줄 한 사람",
  message: "전하고 싶은 것",
  strength: "특기 · 장점",
  unique: "독창성",
  reference: "참고 계정 · 이미지",
};

function ingredientsText(lab: LabState): string {
  return lab.ingredients
    .map((i) => `- ${SLOT_LABEL[i.slot]}: ${i.text}${i.imageNote ? ` / 참고 이미지 메모: ${i.imageNote}` : ""}`)
    .join("\n");
}

function contextText(ctx: LabContext): string {
  const p = ctx.profile;
  return [
    `지원하는 활동: ${ctx.activityName} (브랜드: ${ctx.brand})`,
    ctx.noticeWords.length ? `공고 키워드: ${ctx.noticeWords.slice(0, 10).join(", ")}` : "",
    ctx.trendStrong.length ? `합격 후기에서 강했던 요인: ${ctx.trendStrong.join(", ")}` : "",
    p ? `지금 프로필 — 아이디: ${p.username ?? "없음"} / 이름 칸: ${p.name ?? "비어 있음"} / 소개글: ${(p.bio ?? "").replace(/\n/g, " ⏎ ") || "비어 있음"} / 링크: ${p.website || "없음"} / 관심 분야: ${p.interest ?? "모름"}` : "",
    ctx.mediaSummary ? `최근 게시물: ${ctx.mediaSummary}` : "최근 게시물 기록 없음",
    ctx.blogConnected ? "네이버 블로그도 연결돼 있음" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const PRINCIPLES = `계정을 키우는 원칙 (꼭 지킬 것)
1. 위치부터: 주제 하나와 보여 줄 '딱 한 사람'을 분명히 한다. 넓은 말(일상, 다양한 이야기)은 쓰지 않는다.
2. 프로필은 약속이다: 누구인지 + 누구에게 + 무엇을 얻는지 + 다음 행동(링크 · 하이라이트). 추상어('성장', '열정', '진심') 대신 장면이 보이는 구체어.
3. 이름 칸과 소개글에는 사람들이 검색할 키워드를 넣고, 게시물 키워드와 일관되게 한다.
4. 콘텐츠 기둥은 3개: teach(알려 주기) · relate(공감하기) · show(보여 주기 · 과정). 기둥마다 바로 올릴 글감 2개.
5. 기준은 '보는 사람이 친구에게 보내고 싶은가'. 내 체면보다 보는 사람의 흥미 · 유익을 먼저.
6. 스레드는 주제를 좁히고 질문 · 답글로 대화를 잇는다. 맞팔로 숫자를 늘리지 않는다. 블로그는 메인 1개 + 서브 1개 주제, 세부 키워드 제목.
7. 사용자가 말하지 않은 경력 · 숫자 · 수상 · 팔로워 수는 절대 만들지 않는다. 사용자가 준 재료의 말을 살려 쓴다.
8. 서포터즈 지원과 이어지게: 담당자가 프로필을 열었을 때 '이 사람이 우리 브랜드 콘텐츠를 잘 만들겠다'가 보여야 한다. 단, 계정이 브랜드 광고판이 되면 안 된다.
9. 참고 계정 · 이미지는 분위기 · 구성만 빌리고 그대로 베끼지 않는다.
10. 한국어, 20대 대학생 말투. 이모지는 소개글 한 줄에 최대 1개.`;

const bioItem = { type: "object", properties: { concept: { type: "string" }, text: { type: "string" }, why: { type: "string" } }, required: ["concept", "text", "why"], additionalProperties: false };
const pillarItem = {
  type: "object",
  properties: { name: { type: "string" }, kind: { type: "string", enum: ["teach", "relate", "show"] }, ideas: { type: "array", items: { type: "string" } } },
  required: ["name", "kind", "ideas"],
  additionalProperties: false,
};
const BREW_PROPS = {
  creature: { type: "string" },
  identity: { type: "string" },
  names: { type: "array", items: { type: "string" } },
  bios: { type: "array", items: bioItem },
  pillars: { type: "array", items: pillarItem },
  steps: { type: "array", items: { type: "string" } },
  expand: { type: "object", properties: { threads: { type: "string" }, blog: { type: "string" } }, required: ["threads", "blog"], additionalProperties: false },
  fit: { type: "string" },
};
const BREW_SCHEMA = { type: "object", properties: BREW_PROPS, required: Object.keys(BREW_PROPS), additionalProperties: false };
const CHAT_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" }, changed: { type: "boolean" }, brew: BREW_SCHEMA },
  required: ["reply", "changed", "brew"],
  additionalProperties: false,
};

const OUTPUT_RULES = `출력 칸
- creature: 계정 컨셉을 담은 생명체 이름 (한글 2~5자, 귀엽게. 예: 자취몬, 리뷰새싹)
- identity: 계정 정체성 한 문장 ("OO에게 OO를 OO하는 계정" 꼴, 40자 안팎)
- names: 인스타 '이름 칸' 후보 3개 (각 30자 이하, 이름 + 검색 키워드. 예: "채령 | 자취 요리 기록")
- bios: 소개글 3개, 서로 다른 컨셉 (각 ${BIO_MAX}자 이하, 줄바꿈 \\n 으로 2~4줄, 마지막 줄은 다음 행동 안내). why는 이 문구가 왜 통하는지 한 줄
- pillars: 콘텐츠 기둥 정확히 3개 (teach · relate · show 하나씩), ideas는 기둥마다 바로 올릴 글감 2개
- steps: 앞으로 2주 동안 할 일 4개, 순서대로, 각각 한 문장 (주기 · 형식이 보이게)
- expand.threads: 스레드로 넓힐 때 한두 문장 / expand.blog: 블로그로 넓힐 때 한두 문장
- fit: 이 방향이 '${"{activity}"}' 지원과 어떻게 이어지는지 한두 문장`;

function sanitizeBrew(raw: Partial<LabBrew>, model: string, at: string, fallback: LabBrew): LabBrew {
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const bios = arr<LabBio>(raw.bios)
    .map((b) => ({ concept: s(b.concept, 20), text: s(b.text, BIO_MAX), why: s(b.why, 120) }))
    .filter((b) => b.text)
    .slice(0, 3);
  const pillars = arr<LabPillar>(raw.pillars)
    .map((p) => ({ name: s(p.name, 30), kind: (["teach", "relate", "show"].includes(p.kind) ? p.kind : "show") as LabPillar["kind"], ideas: arr<string>(p.ideas).map((x) => s(x, 80)).filter(Boolean).slice(0, 3) }))
    .filter((p) => p.name)
    .slice(0, 3);
  return {
    creature: s(raw.creature, 12) || fallback.creature,
    identity: s(raw.identity, 80) || fallback.identity,
    names: (() => {
      const n = arr<string>(raw.names).map((x) => s(x, 30)).filter(Boolean).slice(0, 3);
      return n.length ? n : fallback.names;
    })(),
    bios: bios.length ? bios : fallback.bios,
    pillars: pillars.length === 3 ? pillars : fallback.pillars,
    steps: (() => {
      const st = arr<string>(raw.steps).map((x) => s(x, 120)).filter(Boolean).slice(0, 5);
      return st.length ? st : fallback.steps;
    })(),
    expand: { threads: s(raw.expand?.threads, 200) || fallback.expand.threads, blog: s(raw.expand?.blog, 200) || fallback.expand.blog },
    fit: s(raw.fit, 200) || fallback.fit,
    model,
    at,
  };
}

const pick = (lab: LabState, slot: LabSlot) => lab.ingredients.find((i) => i.slot === slot)?.text ?? "";
const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/** AI 없이 재료의 말로 만드는 기본 결과 (AI가 없거나 크레딧이 모자랄 때) */
export function brewByRules(lab: LabState, ctx: LabContext, at: string): LabBrew {
  const dir = pick(lab, "direction");
  const who = pick(lab, "audience") || "같은 고민을 하는 대학생";
  const msg = pick(lab, "message") || ctx.profile?.interest || "내가 좋아하는 것";
  const strength = pick(lab, "strength");
  const unique = pick(lab, "unique");
  const topic = (ctx.profile?.interest || msg).split(/[,·]/)[0]!.trim();
  const first = ((ctx.profile?.name ?? ctx.profile?.username ?? "").split(/[\s|·_.]/)[0] || "이름").slice(0, 8);
  const kind = /리뷰/.test(dir) ? "리뷰" : /공감|기록|일상/.test(dir) ? "기록" : "꿀팁";
  return {
    creature: `${topic.slice(0, 3)}몬`,
    identity: short(`${who}에게 ${msg}을(를) 전하는 ${topic} ${kind} 계정`, 60),
    names: [`${first} | ${topic} ${kind}`, `${first} · ${short(who, 10)}의 ${topic}`, `${topic} ${kind} | ${first}`].map((x) => short(x, 30)),
    bios: [
      { concept: "약속형", text: short(`${who}를 위한 ${topic} ${kind}\n${msg}\n${strength ? strength + " → " : ""}매주 하나씩 올려요\n👇 처음이라면 고정 게시물부터`, BIO_MAX), why: "누구에게 무엇을 주는지 첫 줄에서 바로 보여요." },
      { concept: "나다움형", text: short(`${unique || topic + " 좋아하는 대학생"}\n${msg}을(를) 기록해요\n📍 ${ctx.activityName} 준비 중`, BIO_MAX), why: "다른 계정과 다른 점이 먼저 보여요." },
      { concept: "검색형", text: short(`${topic} · ${kind} · 대학생\n${who}가 저장하는 ${topic} 정리\n궁금한 건 댓글로 물어봐 주세요`, BIO_MAX), why: "검색 키워드가 앞에 와서 찾아오기 쉬워요." },
    ],
    pillars: [
      { name: `${topic} 알려 주기`, kind: "teach", ideas: [`${who}가 처음 알아야 할 ${topic} 3가지`, `${topic} 실수 모음과 고치는 법`] },
      { name: "공감 이야기", kind: "relate", ideas: [`${who}라면 공감할 장면 하나`, `내가 ${topic}을(를) 시작한 이유`] },
      { name: "과정 보여 주기", kind: "show", ideas: [`${strength || "내 방식"}으로 만드는 과정 15초`, `${ctx.brand} 제품을 내 ${topic}에 써 본 기록`] },
    ],
    steps: [
      "이름 칸과 소개글을 위 후보 중 하나로 바꾸고, 첫 줄에 보여 줄 사람을 넣어요",
      "기둥 3개를 번갈아 주 3회 올려요 (릴스 2 · 캐러셀 1)",
      "같은 주제 계정 5곳에 질문형 댓글을 남겨 대화를 시작해요",
      "2주 뒤 저장 · 공유가 많았던 기둥을 하나 더 늘려요",
    ],
    expand: { threads: `${topic} 고민을 질문으로 던지고, 달린 답글에 다시 답하며 대화를 이어 가요.`, blog: `메인은 ${topic}, 서브는 ${ctx.brand} 관련 후기. 제목에는 장면이 보이는 세부 키워드를 써요.` },
    fit: `${ctx.activityName} 담당자가 프로필을 열었을 때 '${who}에게 ${topic}을(를) 잘 전하는 사람'으로 보이면, 브랜드 콘텐츠도 같은 방식으로 만들 수 있다는 근거가 돼요.`,
    model: "rules",
    at,
  };
}

export interface LabAiResult<T> {
  value: T;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

/** 재료와 맥락으로 계정 방향을 끓인다 */
export async function brewWithLLM(lab: LabState, ctx: LabContext, llm: LLMClient, at: string): Promise<LabAiResult<LabBrew>> {
  const system = `당신은 대학생 SNS 계정을 키워 주는 '계정 실험실'의 연금술사입니다. 사용자가 솥에 넣은 재료로 계정의 방향을 끓여 냅니다.\n\n${PRINCIPLES}\n\n${OUTPUT_RULES.replace("{activity}", ctx.activityName)}\n\nJSON 하나만 출력하세요.`;
  const user = `[맥락]\n${contextText(ctx)}\n\n[솥에 넣은 재료]\n${ingredientsText(lab) || "(없음)"}`;
  const res = await llm.complete({ system, user, maxOutputTokens: 2200, json: true, schema: BREW_SCHEMA });
  const raw = extractJson<Partial<LabBrew>>(res.text);
  return { value: sanitizeBrew(raw, res.model, at, brewByRules(lab, ctx, at)), usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens }, model: res.model };
}

/** 끓인 뒤 대화: 답하고, 필요하면 결과를 고친다 */
export async function labChatWithLLM(lab: LabState, ctx: LabContext, message: string, llm: LLMClient, at: string): Promise<LabAiResult<{ reply: string; brew?: LabBrew }>> {
  const system = `당신은 대학생 SNS 계정을 키워 주는 '계정 실험실'의 연금술사입니다. 이미 끓여 둔 결과를 사용자와 대화하며 다듬습니다.\n\n${PRINCIPLES}\n\n${OUTPUT_RULES.replace("{activity}", ctx.activityName)}\n\n응답 규칙\n- reply: 사용자에게 하는 말 2~4문장. 실험실 컨셉의 가벼운 말투(물약 · 솥 비유는 한 번만). 바꿨다면 무엇을 왜 바꿨는지, 질문이면 답을.\n- changed: 결과를 바꿨으면 true\n- brew: 고친 전체 결과 (안 바꿨으면 지금 결과 그대로)\nJSON 하나만 출력하세요.`;
  const history = lab.chat.slice(-12).map((c) => `${c.role === "me" ? "사용자" : "실험실"}: ${c.text}`).join("\n");
  const user = `[맥락]\n${contextText(ctx)}\n\n[재료]\n${ingredientsText(lab)}\n\n[지금 결과]\n${JSON.stringify(lab.brew ? { ...lab.brew, model: undefined, at: undefined } : {})}\n\n[최근 대화]\n${history}\n\n[사용자의 새 말]\n${message.slice(0, 600)}`;
  const res = await llm.complete({ system, user, maxOutputTokens: 2400, json: true, schema: CHAT_SCHEMA });
  const raw = extractJson<{ reply?: string; changed?: boolean; brew?: Partial<LabBrew> }>(res.text);
  const base = lab.brew ?? brewByRules(lab, ctx, at);
  const brew = raw.changed && raw.brew ? sanitizeBrew(raw.brew, res.model, at, base) : undefined;
  return { value: { reply: String(raw.reply ?? "").trim().slice(0, 600) || "다시 한 번 말해 줄래요?", brew }, usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens }, model: res.model };
}

/** 참고 이미지의 분위기를 두 문장으로 적는다 (이미지는 저장하지 않는다) */
export async function describeReference(image: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string }, llm: LLMClient): Promise<LabAiResult<string>> {
  const res = await llm.complete({
    system: "SNS 계정 참고 이미지를 보고 분위기 · 색감 · 구도 · 글씨 스타일을 한국어 두 문장(80자 안팎)으로 적으세요. 사람의 신원은 추측하지 마세요. 문장만 출력하세요.",
    user: "이 참고 이미지를 설명해 주세요.",
    maxOutputTokens: 200,
    images: [image],
  });
  return { value: res.text.trim().slice(0, 200), usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens }, model: res.model };
}

/** 규칙 기반 대화 (AI가 없을 때): 간단한 요청만 알아듣는다 */
export function labChatByRules(lab: LabState, ctx: LabContext, message: string, at: string): { reply: string; brew?: LabBrew } {
  if (/다시|새로|처음/.test(message)) return { reply: "재료를 그대로 두고 다시 끓였어요.", brew: brewByRules(lab, ctx, at) };
  return { reply: "지금은 AI가 연결되지 않아 대화로 고치기는 어려워요. 재료를 바꿔 넣고 다시 끓이면 결과가 달라져요." };
}
