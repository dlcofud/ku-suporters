/**
 * AI 콘텐츠 기획: 장면 · 캡션 · 캘린더 주제.
 *
 * 원칙
 * - AI 응답은 그대로 믿지 않는다. 모양을 검사하고, 깨졌으면 규칙 기반 결과로 대신한다.
 * - 사용자의 경험·숫자는 지어내지 않는다. 캡션은 사용자가 말한 경험으로만 쓰고,
 *   재료가 없으면 글 대신 질문을 돌려준다 (지원서 코치와 같은 방식).
 *
 * Node 전용 API를 쓰지 않는다.
 */
import type { LLMClient } from "../llm/index.js";
import { extractJson } from "../llm/index.js";
import type { ContentFormat } from "../shared.js";
import type { NoticeAnalysis } from "../notice/index.js";
import type { Scene, ScenePlanInput, ShotType } from "./index.js";
import { planScenes, draftCaption } from "./index.js";

export type MakeFormat = Exclude<ContentFormat, "check">;

export interface ContentBrief {
  activityName: string;
  format: MakeFormat;
  title: string;
  purpose: string;
  /** 제품·주제 */
  product: string;
  /** 사용자가 직접 적은 아이디어나 경험 (선택) */
  idea?: string;
  notice?: Pick<NoticeAnalysis, "activities" | "preferred" | "signalKeywords">;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult<T> {
  value: T;
  /** "ai"면 모델이 만든 것, "rules"면 규칙 기반 대체 */
  source: "ai" | "rules";
  usage: AiUsage;
  tier: "local" | "paid";
  /** 대체했을 때 이유 등 사용자에게 보여 줄 한 줄 */
  note?: string;
}

const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 };
const FORMAT_KO: Record<MakeFormat, string> = { reels: "릴스(세로 영상)", cardnews: "카드뉴스", post: "사진 게시물" };
const ROLES: Scene["role"][] = ["hook", "context", "demo", "result", "cta"];
const SHOTS: ShotType[] = ["close_up", "pov_hands", "medium", "wide", "screen", "selfie"];

function noticeLines(n?: ContentBrief["notice"]): Record<string, string[]> {
  if (!n) return {};
  return { 활동내용: n.activities.slice(0, 8), 우대사항: n.preferred.slice(0, 6), 키워드: n.signalKeywords.slice(0, 8) };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/* ------------------------------------------------------------------ */
/* 숫자를 지어냈는지 검사                                               */
/* ------------------------------------------------------------------ */

/** text에 나온 숫자 중 sources 어디에도 없는 것. "3,000" 과 "3000" 은 같게 본다 */
export function inventedNumbers(text: string, sources: string[]): string[] {
  const norm = (s: string) => s.replace(/(\d),(?=\d{3})/g, "$1");
  const pool = norm(sources.join("\n"));
  const found = norm(text).match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found.filter((n) => !pool.includes(n)))];
}

/* ------------------------------------------------------------------ */
/* 1) 장면 기획                                                         */
/* ------------------------------------------------------------------ */

const SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string", enum: ROLES },
          shot: { type: "string", enum: SHOTS },
          durationSec: { type: "number" },
          what: { type: "string" },
          onScreenText: { type: "string" },
          tip: { type: "string" },
        },
        required: ["role", "shot", "durationSec", "what", "onScreenText", "tip"],
      },
    },
  },
  required: ["scenes"],
} as const;

export function buildScenePrompt(brief: ContentBrief, targetSec: number): { system: string; user: string } {
  const system = [
    "당신은 대학생 서포터즈 지원자를 돕는 숏폼 콘텐츠 기획자입니다.",
    "지원자가 휴대폰 하나로 혼자 찍을 수 있는 장면 목록을 JSON으로만 답합니다.",
    "규칙:",
    "- 장면은 4~6개. 첫 장면은 role=hook, 마지막 장면은 role=cta. 나머지는 context·demo·result 중에서 고릅니다.",
    `- durationSec 합계는 ${targetSec}초 근처로. 첫 장면은 3초 이내로 짧게.`,
    "- what: 무엇을 어떻게 찍는지 구체적으로 (장소·손동작·구도). 한 문장.",
    "- onScreenText: 화면 자막, 16자 이내.",
    "- tip: 촬영 요령 한 줄.",
    "- 사용자 아이디어가 있으면 그 경험과 상황을 장면의 중심에 둡니다.",
    "- 가격·수치·후기·수상 같은 사실은 지어내지 않습니다. 모르는 값은 '?'로 남겨 두세요.",
    "- 활동 공고의 활동 내용·키워드와 맞는 방향이면 좋습니다.",
  ].join("\n");
  const user = JSON.stringify(
    {
      활동: brief.activityName,
      포맷: FORMAT_KO[brief.format],
      콘텐츠제목: brief.title,
      콘텐츠목적: brief.purpose,
      제품또는주제: brief.product,
      사용자아이디어: brief.idea?.trim() || "(없음)",
      목표길이초: targetSec,
      공고: noticeLines(brief.notice),
    },
    null,
    1,
  );
  return { system, user };
}

/** AI 장면을 검사하고 길이를 목표에 맞춘다. 쓸 수 없으면 undefined */
export function normalizeScenes(raw: unknown, targetSec: number): Scene[] | undefined {
  const list = Array.isArray((raw as { scenes?: unknown })?.scenes) ? ((raw as { scenes: unknown[] }).scenes) : [];
  const ok = list
    .map((x) => x as Record<string, unknown>)
    .filter((x) => ROLES.includes(x.role as Scene["role"]) && str(x.what, 200))
    .slice(0, 6)
    .map((x) => ({
      role: x.role as Scene["role"],
      shot: SHOTS.includes(x.shot as ShotType) ? (x.shot as ShotType) : "medium",
      dur: Number.isFinite(Number(x.durationSec)) && Number(x.durationSec) > 0 ? Number(x.durationSec) : 3,
      what: str(x.what, 200),
      onScreenText: str(x.onScreenText, 24),
      tip: str(x.tip, 120),
    }));
  if (ok.length < 3) return undefined;
  // 처음은 훅, 끝은 마무리로 맞춘다
  ok[0]!.role = "hook";
  ok[ok.length - 1]!.role = "cta";
  // 길이: 비율을 유지한 채 목표 길이에 맞추고 0.5초 단위·최소 1.5초
  const sum = ok.reduce((s, x) => s + x.dur, 0);
  const dur = ok.map((x) => Math.max(1.5, Math.round(((x.dur / sum) * targetSec) * 2) / 2));
  const diff = targetSec - dur.reduce((a, b) => a + b, 0);
  const longest = dur.indexOf(Math.max(...dur));
  dur[longest] = Math.max(1.5, dur[longest]! + diff);
  return ok.map((x, i) => ({ index: i + 1, role: x.role, durationSec: dur[i]!, shot: x.shot, what: x.what, onScreenText: x.onScreenText || x.what.slice(0, 16), tip: x.tip }));
}

export async function planScenesAI(
  llm: LLMClient,
  brief: ContentBrief,
  opts: { targetSec?: 15 | 20 | 30; style?: ScenePlanInput["style"] } = {},
): Promise<AiResult<Scene[]>> {
  const targetSec = opts.targetSec ?? 15;
  const fallback = () => planScenes({ title: brief.title, product: brief.product, targetSec, style: opts.style });
  const { system, user } = buildScenePrompt(brief, targetSec);
  let res;
  try {
    res = await llm.complete({ system, user, maxOutputTokens: 1400, json: true, schema: SCENE_SCHEMA as unknown as Record<string, unknown> });
  } catch {
    return { value: fallback(), source: "rules", usage: NO_USAGE, tier: llm.tier, note: "AI에 연결하지 못해 기본 장면 틀을 드렸어요." };
  }
  const usage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens };
  let raw: unknown;
  try {
    raw = extractJson(res.text);
  } catch {
    raw = undefined;
  }
  const scenes = normalizeScenes(raw, targetSec);
  if (!scenes) return { value: fallback(), source: "rules", usage, tier: llm.tier, note: "AI 답이 장면 모양이 아니어서 기본 장면 틀을 드렸어요." };
  return { value: scenes, source: "ai", usage, tier: llm.tier };
}

/* ------------------------------------------------------------------ */
/* 2) 캡션 (내 경험으로만)                                              */
/* ------------------------------------------------------------------ */

export interface CaptionDraft {
  caption: string;
  /** 재료가 모자라면 사용자에게 물을 질문 (없으면 빈 문자열) */
  question: string;
}

const CAPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { caption: { type: "string" }, question: { type: "string" } },
  required: ["caption", "question"],
} as const;

/** 경험 없이 캡션을 쓰지 않는다: 무엇을 알려 주면 되는지 묻는다 */
export function askForExperience(brief: ContentBrief): string {
  const doing = brief.format === "reels" ? "찍으면서" : "만들면서";
  return `캡션은 실제 경험으로만 써요. '${brief.title}'을(를) ${doing} 있었던 일 하나만 알려 주세요. 언제·어디서였는지, ${brief.product}를 써 보고 뭐가 좋았거나 아쉬웠는지 한두 문장이면 돼요.`;
}

function tagLine(hashtags: string[]): string {
  return [...new Set(hashtags.map((h) => h.trim().replace(/\s+/g, "")).filter(Boolean))]
    .slice(0, 10)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
}

function rulesCaption(brief: ContentBrief, scenes: Scene[], experience: string, hashtags: string[]): string {
  const base = draftCaption({ title: brief.title, product: brief.product }, scenes, []);
  const body = experience.trim() || "[여기에 내 경험 한 줄을 직접 써 주세요]";
  return `${base.replace("[여기에 내 경험 한 줄을 직접 써 주세요]", body).trimEnd()}\n\n${tagLine(hashtags)}`.trim();
}

export function buildCaptionPrompt(brief: ContentBrief, scenes: Scene[], experience: string, hashtags: string[]): { system: string; user: string } {
  const system = [
    "당신은 대학생 서포터즈 지원자의 인스타그램 캡션을 같이 쓰는 코치입니다. JSON으로만 답합니다.",
    "규칙:",
    "- caption은 사용자가 말한 경험만 재료로 씁니다. 사용자가 말하지 않은 경험·숫자·가격·장소·사람을 절대 지어내지 마세요.",
    "- 첫 줄은 스크롤을 멈추게 하는 한 문장. 그 다음 2~4줄에 사용자의 경험을 사용자 말투를 살려 정리. 광고 문구처럼 과장하지 않습니다.",
    "- 마지막 줄에 주어진 해시태그를 그대로 붙입니다. 새 해시태그는 2개까지만 더할 수 있습니다.",
    "- 경험이 너무 짧아 한 줄 이상 쓰기 어렵거나 중요한 게 빠졌으면 question에 사용자에게 물을 질문 하나를 씁니다 (예: '이 경험은 활동과 관련이 약해 보이는데, 어떻게 연결할 수 있을까요?'). 충분하면 question은 빈 문자열.",
  ].join("\n");
  const user = JSON.stringify(
    {
      활동: brief.activityName,
      포맷: FORMAT_KO[brief.format],
      콘텐츠제목: brief.title,
      제품또는주제: brief.product,
      장면자막: scenes.map((s) => s.onScreenText),
      사용자경험: experience,
      해시태그: tagLine(hashtags),
      공고: noticeLines(brief.notice),
    },
    null,
    1,
  );
  return { system, user };
}

export async function captionAI(llm: LLMClient, brief: ContentBrief, scenes: Scene[], experience: string, hashtags: string[]): Promise<AiResult<CaptionDraft>> {
  const exp = experience.trim();
  if ([...exp].length < 6) {
    return { value: { caption: rulesCaption(brief, scenes, "", hashtags), question: askForExperience(brief) }, source: "rules", usage: NO_USAGE, tier: llm.tier };
  }
  const fallback = (note: string, usage = NO_USAGE): AiResult<CaptionDraft> => ({
    value: { caption: rulesCaption(brief, scenes, exp, hashtags), question: "" },
    source: "rules",
    usage,
    tier: llm.tier,
    note,
  });
  const { system, user } = buildCaptionPrompt(brief, scenes, exp, hashtags);
  let res;
  try {
    res = await llm.complete({ system, user, maxOutputTokens: 900, json: true, schema: CAPTION_SCHEMA as unknown as Record<string, unknown> });
  } catch {
    return fallback("AI에 연결하지 못해 내 경험을 그대로 넣은 기본 캡션을 드렸어요.");
  }
  const usage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens };
  let raw: { caption?: unknown; question?: unknown } = {};
  try {
    raw = extractJson(res.text);
  } catch {
    raw = {};
  }
  let caption = typeof raw.caption === "string" ? raw.caption.trim().slice(0, 2200) : "";
  const question = str(raw.question, 300);
  if (!caption) return fallback("AI 답이 비어 내 경험을 그대로 넣은 기본 캡션을 드렸어요.", usage);
  // 사용자가 말하지 않은 숫자가 들어가면 쓰지 않는다
  const made = inventedNumbers(caption, [exp, brief.title, brief.product, brief.activityName, tagLine(hashtags), ...scenes.map((s) => s.onScreenText)]);
  if (made.length) return fallback(`AI가 내가 말하지 않은 숫자(${made.slice(0, 3).join(", ")})를 넣어서, 내 경험을 그대로 넣은 기본 캡션을 드렸어요.`, usage);
  const tags = tagLine(hashtags);
  if (tags && !caption.includes(tags.split(" ")[0]!)) caption = `${caption}\n\n${tags}`;
  return { value: { caption, question }, source: "ai", usage, tier: llm.tier };
}

/* ------------------------------------------------------------------ */
/* 3) 캘린더 주제                                                       */
/* ------------------------------------------------------------------ */

export interface TopicSlot {
  id: string;
  date: string;
  format: MakeFormat;
  /** 지금 주제 (바꾸지 못하면 그대로 둔다) */
  title: string;
}

export interface Topic {
  title: string;
  purpose: string;
}

const TOPIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, title: { type: "string" }, purpose: { type: "string" } },
        required: ["id", "title", "purpose"],
      },
    },
  },
  required: ["topics"],
} as const;

export function buildTopicPrompt(ctx: { activityName: string; notice?: ContentBrief["notice"]; interests?: string }, slots: TopicSlot[]): { system: string; user: string } {
  const system = [
    "당신은 대학생 서포터즈 지원자의 지원 전 콘텐츠 캘린더를 짜는 기획자입니다. JSON으로만 답합니다.",
    "지원 마감 전까지 개인 계정에 올릴 콘텐츠의 주제를 슬롯마다 하나씩 정합니다.",
    "규칙:",
    "- 슬롯마다 id를 그대로 돌려주고, 포맷(릴스·카드뉴스·게시물)에 맞는 주제를 씁니다.",
    "- title은 20자 이내, 서로 겹치지 않게. purpose는 이 콘텐츠가 지원에 어떻게 도움이 되는지 한 문장.",
    "- 공고의 활동 내용·우대 사항·키워드에 맞춥니다. 브랜드 공식 SNS 분석, 제품 사용기, 내 일상 속 활용처럼 지원자가 혼자 만들 수 있는 것.",
    "- 사용자의 관심사가 있으면 섞습니다. 사실(수상·숫자)은 지어내지 않습니다.",
  ].join("\n");
  const user = JSON.stringify(
    {
      활동: ctx.activityName,
      공고: noticeLines(ctx.notice),
      관심사: ctx.interests?.trim() || "(없음)",
      슬롯: slots.map((s) => ({ id: s.id, 날짜: s.date, 포맷: FORMAT_KO[s.format] })),
    },
    null,
    1,
  );
  return { system, user };
}

export async function suggestTopicsAI(
  llm: LLMClient,
  ctx: { activityName: string; notice?: ContentBrief["notice"]; interests?: string },
  slots: TopicSlot[],
): Promise<AiResult<Record<string, Topic>>> {
  if (!slots.length) return { value: {}, source: "rules", usage: NO_USAGE, tier: llm.tier };
  const { system, user } = buildTopicPrompt(ctx, slots);
  let res;
  try {
    res = await llm.complete({ system, user, maxOutputTokens: 300 + slots.length * 120, json: true, schema: TOPIC_SCHEMA as unknown as Record<string, unknown> });
  } catch {
    return { value: {}, source: "rules", usage: NO_USAGE, tier: llm.tier, note: "AI에 연결하지 못해 주제를 바꾸지 않았어요." };
  }
  const usage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens };
  let raw: { topics?: unknown } = {};
  try {
    raw = extractJson(res.text);
  } catch {
    raw = {};
  }
  const ids = new Set(slots.map((s) => s.id));
  const seen = new Set<string>();
  const out: Record<string, Topic> = {};
  for (const t of Array.isArray(raw.topics) ? (raw.topics as Record<string, unknown>[]) : []) {
    const id = str(t.id, 40);
    const title = str(t.title, 30);
    if (!ids.has(id) || !title || seen.has(title) || out[id]) continue;
    seen.add(title);
    out[id] = { title, purpose: str(t.purpose, 160) || "활동에 맞춘 콘텐츠예요." };
  }
  if (!Object.keys(out).length) return { value: {}, source: "rules", usage, tier: llm.tier, note: "AI 답에서 쓸 수 있는 주제를 찾지 못해 그대로 뒀어요." };
  const missing = slots.length - Object.keys(out).length;
  return { value: out, source: "ai", usage, tier: llm.tier, note: missing > 0 ? `${missing}개는 AI가 주제를 주지 않아 그대로 뒀어요.` : undefined };
}
