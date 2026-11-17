"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { notice, skeleton, planner, account, content, publish, contribution, trends, apply, billing, credits } from "@supportlab/core";
import { payments, syncSubscription } from "./billing";
import { readFormFile, FormReadError } from "@supportlab/core/apply/node";
import { renderWithFfmpeg, probeWithFfmpeg, analyzeClipFeatures } from "@supportlab/core/content/node";
import { repo, files, newId, todayISO, type Activity } from "./repo";
import { ACT_COOKIE, requireUser, currentActivity, startSession, endSession } from "./session";
import { auth } from "@supportlab/core";
import { hashPassword, verifyPassword } from "@supportlab/core/auth/node";
import { LoginIdTakenError } from "./repo";
import { fetchNotice, fetchImage, NoticeFetchError } from "./fetchNotice";
import { readImagesText, imageType, type OcrImage } from "./ocr";
import { manualMedia } from "./media";
import { getLLM, llmStatus } from "./llm";
import { publisherFor } from "./publisher";
import { ffmpegPath, captionFont } from "./ffmpeg";

const WORK_DIR = join(process.env.SUPPORTLAB_DATA_DIR || tmpdir(), "supportlab-work");

async function activityOrRedirect(userId: string, to = "/notice"): Promise<Activity> {
  const act = await currentActivity(userId);
  if (!act) redirect(to);
  return act;
}

/* ---------------- 가입 ---------------- */

/* ---------------- 가입 · 로그인 · 계정 ---------------- */

const throttle = new auth.LoginThrottle();
const back = (path: string, error: string, extra: Record<string, string> = {}) =>
  redirect(`${path}?${new URLSearchParams({ error, ...extra }).toString()}`);

export async function signup(formData: FormData) {
  const idCheck = auth.validateLoginId(String(formData.get("loginId") || ""));
  const keep = { id: String(formData.get("loginId") || "").slice(0, 20), nick: String(formData.get("nickname") || "").slice(0, 20) };
  if (!idCheck.ok) back("/", idCheck.error, keep);
  const loginId = (idCheck as { value: string }).value;
  const pw = String(formData.get("password") || "");
  const pwCheck = auth.validatePassword(pw, loginId);
  if (!pwCheck.ok) back("/", (pwCheck as { error: string }).error, keep);
  if (pw !== String(formData.get("password2") || "")) back("/", "비밀번호 확인이 달라요. 같은 비밀번호를 두 번 넣어 주세요.", keep);
  const nickname = String(formData.get("nickname") || "").trim().slice(0, 20) || loginId;
  let userId: string;
  try {
    const user = await repo.createUser(nickname, { loginId, passwordHash: await hashPassword(pw) });
    userId = user.id;
  } catch (e) {
    if (e instanceof LoginIdTakenError) back("/", "이미 쓰고 있는 아이디예요. 다른 아이디를 정해 주세요.", keep);
    throw e;
  }
  await repo.ledger.grantSignupBonus(userId);
  await startSession(userId);
  redirect("/notice");
}

export async function loginAction(formData: FormData) {
  const loginId = String(formData.get("loginId") || "").trim().toLowerCase();
  const pw = String(formData.get("password") || "");
  if (!loginId || !pw) back("/login", "아이디와 비밀번호를 넣어 주세요.", { id: loginId });
  const wait = throttle.lockedFor(loginId);
  if (wait) back("/login", `여러 번 틀려서 잠시 잠겼어요. ${Math.ceil(wait / 60)}분 뒤에 다시 해 주세요.`, { id: loginId });
  const found = await repo.findLogin(loginId);
  const ok = await verifyPassword(pw, found?.passwordHash);
  if (!found || !ok) {
    throttle.fail(loginId);
    // 아이디가 없는지 비밀번호가 틀렸는지 알려 주지 않는다 (아이디 존재 여부를 숨김)
    back("/login", "아이디 또는 비밀번호가 맞지 않아요.", { id: loginId });
  }
  throttle.success(loginId);
  await startSession(found!.user.id);
  const next = String(formData.get("next") || "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await endSession();
  redirect("/login?bye=1");
}

/** 계정 설정: 닉네임만으로 가입한 예전 계정이 아이디·비밀번호를 처음 정하거나, 비밀번호를 바꾼다 */
export async function credentialsAction(formData: FormData) {
  const user = await requireUser();
  const pw = String(formData.get("password") || "");
  let loginId = user.loginId;
  if (!loginId) {
    const idCheck = auth.validateLoginId(String(formData.get("loginId") || ""));
    if (!idCheck.ok) back("/settings", idCheck.error);
    loginId = (idCheck as { value: string }).value;
  } else {
    const ok = await verifyPassword(String(formData.get("current") || ""), await repo.getPasswordHash(user.id));
    if (!ok) back("/settings", "지금 비밀번호가 맞지 않아요.");
  }
  const pwCheck = auth.validatePassword(pw, loginId);
  if (!pwCheck.ok) back("/settings", (pwCheck as { error: string }).error);
  if (pw !== String(formData.get("password2") || "")) back("/settings", "새 비밀번호 확인이 달라요.");
  try {
    await repo.setCredentials(user.id, { loginId: user.loginId ? undefined : loginId, passwordHash: await hashPassword(pw) });
  } catch (e) {
    if (e instanceof LoginIdTakenError) back("/settings", "이미 쓰고 있는 아이디예요. 다른 아이디를 정해 주세요.");
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/settings?saved=${user.loginId ? "pw" : "id"}`);
}

export async function nicknameAction(formData: FormData) {
  const user = await requireUser();
  const nickname = String(formData.get("nickname") || "").trim().slice(0, 20);
  if (nickname) await repo.setNickname(user.id, nickname);
  revalidatePath("/", "layout");
  redirect("/settings?saved=nick");
}

/* ---------------- 공고 분석 ---------------- */

function safePlan(deadline: string, name: string) {
  try {
    return planner.planSchedule({ today: todayISO(), deadline, newAccount: true, activityName: name });
  } catch {
    return undefined;
  }
}

export async function analyzeNoticeAction(formData: FormData) {
  const user = await requireUser();
  let text = String(formData.get("text") || "");
  let sourceUrl = String(formData.get("url") || "").trim() || undefined;
  let pageTitle: string | undefined;
  let posters: string[] = [];
  // 링크만 넣었으면 그 페이지를 읽어 온다 (본문을 직접 붙여넣었다면 그걸 우선)
  if (text.trim().length < 20 && sourceUrl) {
    let failure: string | undefined;
    try {
      const page = await fetchNotice(sourceUrl);
      text = page.text;
      pageTitle = page.title;
      sourceUrl = page.finalUrl;
      posters = page.posters;
    } catch (e) {
      failure = e instanceof NoticeFetchError ? e.message : "페이지를 가져오지 못했어요. 본문을 붙여 넣어 주세요";
    }
    if (failure) redirect(`/notice?error=fetch&msg=${encodeURIComponent(failure)}&url=${encodeURIComponent(sourceUrl)}`);
  }
  // 공고 이미지 글자 읽기: 직접 올린 이미지 + 페이지의 포스터 (핵심 정보가 이미지에만 있는 공고가 많다)
  const images: OcrImage[] = [];
  for (const f of formData.getAll("images")) {
    if (!(f instanceof File) || f.size === 0 || f.size > 8 * 1024 * 1024 || images.length >= 4) continue;
    const data = Buffer.from(await f.arrayBuffer());
    const mediaType = imageType(f.name, f.type, data.subarray(0, 16));
    if (mediaType) images.push({ data, mediaType });
  }
  for (const u of posters) {
    if (images.length >= 4) break;
    const img = await fetchImage(u);
    if (img) images.push(img);
  }
  let ocrNote = "";
  let ocrUsage = { inputTokens: 0, outputTokens: 0 };
  if (images.length) {
    const ocr = await readImagesText(images);
    const read = ocr.texts.filter((t) => t.trim().length >= 10).length;
    if (read) text = notice.withImageText(text, ocr.texts);
    if (ocr.tier === "paid") ocrUsage = ocr.usage;
    ocrNote = `ocr=${ocr.engine}&oi=${images.length}&or=${read}`;
  }
  if (text.trim().length < 20) redirect(sourceUrl ? "/notice?error=short" : "/notice?error=empty");
  // 지원서 양식 파일 (선택)
  let form: { name: string; parsed: apply.FormParse } | undefined;
  let formNote = "";
  const file = formData.get("form");
  if (file instanceof File && file.size > 0) {
    try {
      form = { name: file.name, parsed: readFormFile(file.name, Buffer.from(await file.arrayBuffer())) };
    } catch (e) {
      formNote = `formerror=${encodeURIComponent(e instanceof FormReadError ? e.message : "양식 파일을 읽지 못했어요.")}`;
    }
  }
  const hold = await repo.ledger.hold(user.id, "notice_analysis", newId("job")).catch(() => null);
  if (!hold) redirect("/notice?error=credits");
  let actId: string;
  try {
    const year = Number(todayISO().slice(0, 4));
    const r = await notice.analyzeNoticeWithLLM(text, getLLM(), { referenceYear: year, sourceUrl });
    // 이미지 읽기에 쓴 AI 사용량도 함께 정산한다 (예약한 크레딧 안에서)
    await repo.ledger.settle(hold, { inputTokens: r.usage.inputTokens + ocrUsage.inputTokens, outputTokens: r.usage.outputTokens + ocrUsage.outputTokens }, r.tier === "paid" || ocrUsage.inputTokens > 0 ? "paid" : r.tier);
    // 페이지 제목이 활동 이름처럼 보이면 그걸 먼저 (본문 첫 줄은 '자세한 내용은 포스터를…' 같은 안내문일 때가 많다)
    const pt = cleanTitle(pageTitle);
    const looksLikeName = (t?: string) => !!t && /모집|서포터즈|기자단|대외활동|공모|앰버서더|홍보단|크리에이터|인턴/.test(t);
    const name = String(formData.get("name") || "").trim() || (looksLikeName(pt) ? pt : undefined) || (looksLikeName(r.analysis.title) ? r.analysis.title : undefined) || pt || r.analysis.title || "새 활동";
    const act: Activity = {
      id: newId("act"),
      userId: user.id,
      name,
      sourceUrl,
      analysis: r.analysis, // 공고 원문은 저장하지 않는다
      guides: notice.toActionGuides(r.analysis),
      createdAt: new Date().toISOString(),
    };
    if (r.analysis.deadline) act.plan = safePlan(r.analysis.deadline, name);
    // 지원서 양식 파일을 같이 올렸으면 문항을 읽어 지원서에 합친다 (파일은 저장하지 않는다)
    if (form) {
      act.application = apply.startApplication({ activityName: name, notice: r.analysis });
      const imp = apply.importForm(act.application, form.parsed, form.name);
      formNote = `form=ok&fq=${form.parsed.questions.length}&ff=${form.parsed.fields.length}&fa=${imp.added}`;
    }
    await repo.saveActivity(act);
    actId = act.id;
  } catch (e) {
    await repo.ledger.release(hold);
    throw e;
  }
  (await cookies()).set(ACT_COOKIE, actId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  const notes = [formNote, ocrNote].filter(Boolean).join("&");
  redirect(notes ? `/notice?${notes}` : "/notice");
}

/** "달콤제과 서포터즈 13기 모집 | 링커리어" → "달콤제과 서포터즈 13기 모집" */
function cleanTitle(t?: string): string | undefined {
  const v = t?.split(/\s[|\-–:]\s/)[0]?.trim();
  return v ? v.slice(0, 60) : undefined;
}

/** 사이드바에서 활동 고르기 */
export async function selectActivityAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("activityId") || "");
  const next = String(formData.get("next") || "/");
  const list = await repo.listActivities(user.id);
  if (list.some((a) => a.id === id)) (await cookies()).set(ACT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function setDeadlineAction(formData: FormData) {
  const user = await requireUser();
  const act = await activityOrRedirect(user.id);
  const deadline = String(formData.get("deadline") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) redirect("/");
  act.analysis.deadline = deadline;
  const old = act.plan;
  act.plan = safePlan(deadline, act.name);
  // 다시 계산해도 같은 날·같은 포맷 콘텐츠의 AI 주제·내 아이디어·캡션은 그대로 둔다
  if (old && act.plan) {
    for (const it of act.plan.items) {
      const prev = old.items.find((o) => o.kind === "content" && it.kind === "content" && o.date === it.date && o.format === it.format);
      if (!prev) continue;
      if (prev.aiTopic) Object.assign(it, { title: prev.title, purpose: prev.purpose, aiTopic: true });
      if (prev.idea) it.idea = prev.idea;
      if (prev.caption) it.caption = prev.caption;
      if (prev.product) it.product = prev.product;
    }
  }
  await repo.saveActivity(act);
  revalidatePath("/", "layout");
  redirect(act.plan ? "/" : "/?error=deadline");
}

/* ---------------- 지원서 뼈대 ---------------- */

function parseExperiences(raw: string): skeleton.Experience[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [title = "", description = "", metrics = ""] = l.split("|").map((x) => x.trim());
      return { title, description, metrics: metrics ? metrics.split(",").map((m) => m.trim()).filter(Boolean) : undefined };
    });
}

export async function skeletonAction(formData: FormData) {
  const user = await requireUser();
  const act = await activityOrRedirect(user.id);
  const profile: skeleton.ApplicantProfile = {
    experiences: parseExperiences(String(formData.get("experiences") || "")),
    channels: formData.get("hasChannel") ? [{ platform: "instagram" }] : [],
  };
  const extraQ = String(formData.get("questions") || "").split(/\r?\n/).map((q) => q.trim()).filter(Boolean);
  const base = skeleton.buildSkeleton({ questions: extraQ, notice: act.analysis, profile });
  const hold = await repo.ledger.hold(user.id, "skeleton", newId("job")).catch(() => null);
  if (!hold) {
    act.skeleton = base; // 크레딧이 없으면 규칙 기반 뼈대만
  } else {
    try {
      const r = await skeleton.refineSkeletonWithLLM(base, profile, getLLM());
      await repo.ledger.settle(hold, r.usage, r.tier);
      act.skeleton = r.skeleton;
    } catch {
      await repo.ledger.release(hold);
      act.skeleton = base;
    }
  }
  await repo.saveActivity(act);
  revalidatePath("/", "layout");
  redirect("/skeleton");
}

/* ---------------- 계정 만들기 ---------------- */

export async function accountKitAction(formData: FormData) {
  const user = await requireUser();
  const act = await activityOrRedirect(user.id);
  const input: account.AccountInput = {
    activityName: act.name,
    brand: String(formData.get("brand") || act.name.split(" ")[0] || "브랜드"),
    field: String(formData.get("field") || "기타"),
    nickname: String(formData.get("nickname") || user.nickname),
    interests: String(formData.get("interests") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  act.accountKit = account.buildAccountKit(input, Number(formData.get("concept") || 0));
  await repo.saveActivity(act);
  redirect("/account");
}

/* ---------------- 캘린더 · 피드백 반영 ---------------- */

export async function applySuggestionAction(formData: FormData) {
  const user = await requireUser();
  const act = await activityOrRedirect(user.id);
  const itemId = String(formData.get("itemId") || "");
  const to = String(formData.get("to") || "") as "reels" | "cardnews" | "post";
  if (act.plan && itemId && to) {
    act.plan = planner.changeFormat(act.plan, itemId, to);
    await repo.saveActivity(act);
  }
  revalidatePath("/", "layout");
  redirect(itemId ? `/?day=${act.plan?.items.find((i) => i.id === itemId)?.date ?? ""}` : "/");
}

/* ---------------- 콘텐츠 제작 ---------------- */

/**
 * AI 작업 하나를 크레딧과 함께 돌린다.
 * - AI가 연결되지 않았거나(데모 모드) 크레딧이 모자라면 규칙 기반 결과를 준다 (크레딧 0)
 * - AI가 실제로 만든 결과(source=ai)일 때만 크레딧을 정산하고, 규칙으로 대신했으면 잡아 둔 크레딧을 돌려준다
 */
async function withCredits<T>(userId: string, kind: credits.TaskKind, run: (llm: ReturnType<typeof getLLM>) => Promise<content.AiResult<T>>, rules: () => T): Promise<content.AiResult<T>> {
  const rulesOnly = (note: string): content.AiResult<T> => ({ value: rules(), source: "rules", usage: { inputTokens: 0, outputTokens: 0 }, tier: "local", note });
  if (llmStatus().mode === "demo") return rulesOnly("AI가 연결되지 않아 기본 틀로 만들었어요.");
  const hold = await repo.ledger.hold(userId, kind, newId("job")).catch(() => null);
  if (!hold) return rulesOnly("크레딧이 모자라서 기본 틀로 만들었어요. 크레딧 화면에서 충전할 수 있어요.");
  try {
    const r = await run(getLLM());
    if (r.source === "ai") await repo.ledger.settle(hold, r.usage, r.tier);
    else await repo.ledger.release(hold);
    return r;
  } catch (e) {
    await repo.ledger.release(hold);
    throw e;
  }
}

function briefFor(act: Activity, item: planner.PlanItem, product: string, idea?: string): content.ContentBrief {
  return {
    activityName: act.name,
    format: (item.format === "check" || !item.format ? "reels" : item.format) as content.MakeFormat,
    title: item.title,
    purpose: item.purpose,
    product: product || act.name.split(" ")[0] || "제품",
    idea,
    notice: { activities: act.analysis.activities ?? [], preferred: act.analysis.preferred ?? [], signalKeywords: act.analysis.signalKeywords ?? [] },
  };
}

function hashtagsFor(act: Activity): string[] {
  return ["서포터즈", act.name.split(" ")[0] ?? "", "대학생"].filter(Boolean);
}

const studioUrl = (id: string, q: Record<string, string | undefined> = {}) => {
  const p = new URLSearchParams({ item: id });
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  return `/studio?${p.toString()}`;
};

export async function planScenesAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const style = String(formData.get("style") || "review") as "review" | "challenge" | "routine";
  const targetSec = Number(formData.get("targetSec") || 15) as 15 | 20 | 30;
  const product = String(formData.get("product") || "").trim().slice(0, 40);
  const idea = String(formData.get("idea") || "").trim().slice(0, 600);
  const act = await activityOrRedirect(user.id);
  const item = act.plan?.items.find((i) => i.id === planItemId);
  if (!item) redirect("/studio");
  const brief = briefFor(act, item!, product, idea);
  const r = await withCredits(user.id, "reels_plan", (llm) => content.planScenesAI(llm, brief, { targetSec, style }), () => content.planScenes({ title: item!.title, product: brief.product, targetSec, style }));
  await repo.setScenes(user.id, planItemId, r.value);
  if (idea !== (item!.idea ?? "") || product !== (item!.product ?? "")) {
    item!.idea = idea || undefined;
    item!.product = product || undefined;
    await repo.saveActivity(act);
  }
  redirect(studioUrl(planItemId, { made: r.source, note: r.note }));
}

/** 캡션 코치: 내 경험으로만 캡션을 쓴다. 경험이 모자라면 질문을 돌려준다 */
export async function captionAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const experience = String(formData.get("experience") || "").trim().slice(0, 800);
  const act = await activityOrRedirect(user.id);
  const item = act.plan?.items.find((i) => i.id === planItemId);
  if (!item) redirect("/studio");
  const scenes = (await repo.getScenes(user.id, planItemId)) ?? [];
  const brief = briefFor(act, item!, item!.product ?? "", experience);
  const tags = hashtagsFor(act);
  const ask = [...experience].length < 6;
  const r = ask
    ? await content.captionAI(getLLM(), brief, scenes, "", tags) // 모델을 부르지 않고 질문만 돌려준다
    : await withCredits(user.id, "content_draft", (llm) => content.captionAI(llm, brief, scenes, experience, tags), () => ({ caption: "", question: "" }));
  // 크레딧·AI가 없어 규칙으로 대신했으면 경험을 그대로 넣은 기본 캡션
  const caption = r.value.caption || content.draftCaption({ title: item!.title, product: brief.product }, scenes, tags).replace("[여기에 내 경험 한 줄을 직접 써 주세요]", experience);
  item!.idea = experience || item!.idea;
  item!.caption = caption;
  await repo.saveActivity(act);
  redirect(studioUrl(planItemId, { cap: r.source, ask: r.value.question || undefined, note: r.note }) + "#caption");
}

export async function saveCaptionAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const act = await activityOrRedirect(user.id);
  const item = act.plan?.items.find((i) => i.id === planItemId);
  if (item) {
    item.caption = String(formData.get("caption") || "").slice(0, 2200);
    await repo.saveActivity(act);
  }
  redirect(studioUrl(planItemId, { saved: "1" }) + "#caption");
}

/** 캘린더의 남은 콘텐츠 주제를 이 활동 공고에 맞춰 AI로 다시 짠다 */
export async function topicsAction(formData: FormData) {
  const user = await requireUser();
  const act = await activityOrRedirect(user.id);
  if (!act.plan) redirect("/");
  const interests = String(formData.get("interests") || "").trim().slice(0, 200);
  const slots = act.plan!.items
    .filter((i) => i.kind === "content" && i.status !== "past" && i.format && i.format !== "check")
    .map((i) => ({ id: i.id, date: i.date, format: i.format as content.MakeFormat, title: i.title }));
  const ctx = { activityName: act.name, interests, notice: { activities: act.analysis.activities ?? [], preferred: act.analysis.preferred ?? [], signalKeywords: act.analysis.signalKeywords ?? [] } };
  const r = await withCredits(user.id, "calendar_topics", (llm) => content.suggestTopicsAI(llm, ctx, slots), () => ({}) as Record<string, content.Topic>);
  let n = 0;
  for (const it of act.plan!.items) {
    const t = r.value[it.id];
    if (!t) continue;
    it.title = t.title;
    it.purpose = t.purpose;
    it.aiTopic = true;
    n++;
  }
  if (n) await repo.saveActivity(act);
  revalidatePath("/", "layout");
  const q = new URLSearchParams({ topics: String(n) });
  if (r.note) q.set("note", r.note);
  redirect(`/?${q.toString()}`);
}

export async function uploadClipsAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  await mkdir(WORK_DIR, { recursive: true });
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("scene_") || !(value instanceof File) || value.size === 0) continue;
    const sceneIndex = Number(key.slice(6));
    const ext = (value.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
    const id = newId("clip");
    const storageKey = `clips/${user.id}/${planItemId}/${sceneIndex}_${id}.${ext}`;
    const buf = Buffer.from(await value.arrayBuffer());
    // 길이·오디오 확인은 로컬 임시 파일로
    const tmp = join(WORK_DIR, `${id}.${ext}`);
    await writeFile(tmp, buf);
    const info = await probeWithFfmpeg(tmp, ffmpegPath());
    await files.put(storageKey, buf, value.type || "video/mp4");
    await repo.putClip({ id, userId: user.id, planItemId, sceneIndex, storageKey, durationSec: info.durationSec, hasAudio: info.hasAudio });
  }
  redirect(`/studio?item=${planItemId}`);
}

export async function renderAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const scenes = (await repo.getScenes(user.id, planItemId)) ?? [];
  const clips = await repo.listClips(user.id, planItemId);
  // ffmpeg는 로컬 파일이 필요하므로 저장소에서 내려받아 경로로 바꾼다
  const local = await Promise.all(
    clips.map(async (c) => {
      const path = await files.toLocal(c.storageKey);
      // 장면에 맞는 구간을 고르려고 클립을 잰다. 실패해도 가운데 구간으로 편집은 계속한다
      const features = await analyzeClipFeatures(path, c, ffmpegPath()).catch((e) => {
        console.error("[render] 구간 분석 실패", e);
        return undefined;
      });
      return { id: c.id, path, durationSec: c.durationSec, hasAudio: c.hasAudio, sceneIndex: c.sceneIndex, features };
    }),
  );
  const m = content.matchClips(scenes, local);
  const font = captionFont();
  if (!font) redirect(`/studio?item=${planItemId}&error=font`);
  const plan = content.buildEditPlan(m.matches, { captions: formData.get("captions") !== "off" });
  if (plan.segments.length === 0) redirect(`/studio?item=${planItemId}&error=noclips`);
  const id = newId("r");
  const out = join(WORK_DIR, `${id}.mp4`);
  await mkdir(WORK_DIR, { recursive: true });
  try {
    await renderWithFfmpeg(plan, { outPath: out, fontFile: font!, workDir: join(WORK_DIR, id), ffmpegPath: ffmpegPath() });
  } catch (e) {
    console.error("[render]", e);
    redirect(`/studio?item=${planItemId}&error=render`);
  }
  const storageKey = `renders/${user.id}/${id}.mp4`;
  await files.put(storageKey, await readFile(out), "video/mp4");
  await repo.addRender({ id, userId: user.id, planItemId, storageKey, totalSec: plan.totalSec, createdAt: new Date().toISOString() });
  redirect(`/studio?item=${planItemId}`);
}

/* ---------------- 예약 게시 ---------------- */

export async function scheduleAction(formData: FormData) {
  const user = await requireUser();
  const renderId = String(formData.get("renderId") || "");
  const r = await repo.getRender(renderId);
  if (!r || r.userId !== user.id) redirect("/studio");
  // 인스타 서버가 가져갈 공개 https 주소: /api/media 가 저장소 파일을 넘겨준다
  const base = process.env.PUBLIC_BASE_URL || "";
  const mediaUrl = base.startsWith("https://") ? `${base}/api/media/${r.id}` : `https://demo.supportlab.local/api/media/${r.id}`;
  const local = String(formData.get("publishAt") || "");
  const publishAt = new Date(`${local}:00+09:00`).toISOString();
  let post: publish.ScheduledPost | undefined;
  let error: string | undefined;
  try {
    post = publish.schedulePost(
      { id: newId("post"), userId: user.id, igUserId: user.ig?.userId ?? "demo", planItemId: r.planItemId, mediaType: "REELS", mediaUrl, caption: String(formData.get("caption") || ""), publishAt },
      new Date(),
    );
  } catch (e) {
    error = (e as Error).message;
  }
  if (error || !post) redirect(`/studio?item=${r.planItemId}&error=${encodeURIComponent(error ?? "예약 실패")}`);
  await repo.savePosts([post]);
  redirect(`/studio?item=${r.planItemId}`);
}

export async function cancelPostAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("postId") || "");
  const p = (await repo.listPosts(user.id)).find((x) => x.id === id);
  if (p && p.status !== "published") await repo.savePosts([publish.cancelPost(p, new Date())]);
  revalidatePath("/studio");
}

/** 데모용: 주기 작업을 지금 한 번 실행한다. 실제 배포에서는 /api/cron/publish 가 5분마다 실행된다. */
export async function runTickNowAction() {
  const user = await requireUser();
  let mine = (await repo.listPosts(user.id)).filter((p) => !["published", "failed", "canceled"].includes(p.status));
  const { client, tokenFor, demo } = publisherFor(user);
  if (demo) {
    // 데모: 예약 시각까지 기다리지 않고 컨테이너 생성 → 처리 → 게시 단계를 바로 진행해 보여준다
    const latest = Math.max(Date.now(), ...mine.map((p) => new Date(p.publishAt).getTime()));
    const demoNow = new Date(latest + 60_000);
    for (let i = 0; i < 3; i++) mine = await publish.tick(mine, demoNow, client, tokenFor);
  } else {
    mine = await publish.tick(mine, new Date(), client, tokenFor);
  }
  await repo.savePosts(mine);
  revalidatePath("/studio");
}

/* ---------------- 합격자 기여 ---------------- */

export async function contributeAction(formData: FormData) {
  const user = await requireUser();
  const activityName = String(formData.get("activityName") || "").trim();
  if (!activityName) redirect("/contribute?error=" + encodeURIComponent("활동 이름을 입력해 주세요"));
  const activityKey = activityName.replace(/\s+/g, "-").toLowerCase();
  let c = contribution.newContribution(newId("c"), user.id, activityKey, activityName);
  const result = String(formData.get("result") || "") as contribution.ApplicationResult;
  const proof = formData.get("proof");
  let proofRef: string | undefined;
  if (proof instanceof File && proof.size > 0) {
    proofRef = `proofs/${user.id}/${c.id}_${proof.name.replace(/[^\w.]/g, "_")}`;
    await files.put(proofRef, Buffer.from(await proof.arrayBuffer()), proof.type || "image/png");
  }
  const structure = String(formData.get("structure") || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [question = "", emphasis = ""] = l.split("|").map((x) => x.trim());
      return { question, emphasis: emphasis.split(",").map((e) => e.trim()).filter(Boolean) };
    });
  c = {
    ...c,
    result: result || undefined,
    igAccountId: user.ig?.userId ?? (formData.get("demoConnect") ? "demo-ig" : undefined),
    selectedMediaIds: formData.getAll("media").map(String),
    proofUploadRef: proofRef,
    proofRedacted: formData.get("redacted") === "on",
    structure: formData.get("shareStructure") === "on" && structure.length ? structure : undefined,
  };
  const agreed = Object.fromEntries(contribution.REQUIRED_CONSENTS.map((k) => [k, formData.get(`consent_${k}`) === "on"]));
  c = contribution.recordConsents(c, agreed, new Date().toISOString());
  let error: string | undefined;
  try {
    c = await contribution.submit(c, repo.ledger, new Date().toISOString());
  } catch (e) {
    error = (e as Error).message;
  }
  if (error) {
    if (proofRef) await files.remove(proofRef);
    redirect("/contribute?error=" + encodeURIComponent(error));
  }
  await repo.saveContribution(c);
  revalidatePath("/", "layout");
  redirect("/contribute?done=1");
}

export async function withdrawAction(formData: FormData) {
  const user = await requireUser();
  const c = await repo.getContribution(String(formData.get("id") || ""));
  if (c && c.userId === user.id && c.status !== "withdrawn") {
    if (c.proofUploadRef) await files.remove(c.proofUploadRef);
    await repo.saveContribution(await contribution.withdraw(c, repo.ledger, new Date().toISOString()));
  }
  revalidatePath("/", "layout");
  redirect("/contribute");
}

async function review(formData: FormData, decision: "approve" | "reject") {
  const reviewer = await requireUser();
  let c = await repo.getContribution(String(formData.get("id") || ""));
  if (!c) redirect("/admin");
  const at = new Date().toISOString();
  if (c.status === "submitted") c = contribution.startReview(c, reviewer.id, at);
  const checks = Object.fromEntries(Object.keys(contribution.REVIEW_CHECKS).map((k) => [k, formData.get(`chk_${k}`) === "on"]));
  const proofRef = c.proofUploadRef;
  let error: string | undefined;
  try {
    c = await contribution.decide(c, { reviewerId: reviewer.id, checks, decision, reason: String(formData.get("reason") || "") || undefined }, repo.ledger, at);
  } catch (e) {
    error = (e as Error).message;
  }
  await repo.saveContribution(c);
  if (error) redirect("/admin?error=" + encodeURIComponent(error));
  if (proofRef) await files.remove(proofRef); // 검수가 끝나면 증빙 이미지는 삭제
  revalidatePath("/", "layout");
  redirect("/admin");
}

/** 승인·반려 버튼을 각각의 액션으로 연결 (폼 제출 버튼 값은 서버 액션에 전달되지 않는다) */
export async function approveReviewAction(formData: FormData) {
  return review(formData, "approve");
}
export async function rejectReviewAction(formData: FormData) {
  return review(formData, "reject");
}

/* ---------------- 브라우저 → Storage 직접 업로드 (배포 환경) ---------------- */

/** 업로드할 클립의 서명 업로드 주소를 만든다. 영상은 서버를 거치지 않고 Storage로 바로 올라간다. */
export async function signClipUploadAction(planItemId: string, sceneIndex: number, fileName: string) {
  const user = await requireUser();
  const ext = (fileName.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
  const storageKey = `clips/${user.id}/${planItemId}/${sceneIndex}_${newId("clip")}.${ext}`;
  const signedUrl = await files.createUploadUrl(storageKey);
  if (!signedUrl) throw new Error("직접 업로드는 Supabase 모드에서만 쓸 수 있어요");
  return { storageKey, signedUrl };
}

/** 업로드가 끝난 클립을 등록한다 (길이·오디오는 서버가 내려받아 확인). */
export async function registerClipAction(planItemId: string, sceneIndex: number, storageKey: string) {
  const user = await requireUser();
  if (!storageKey.startsWith(`clips/${user.id}/`)) throw new Error("잘못된 파일 경로예요");
  const info = await probeWithFfmpeg(await files.toLocal(storageKey), ffmpegPath());
  await repo.putClip({ id: newId("clip"), userId: user.id, planItemId, sceneIndex, storageKey, durationSec: info.durationSec, hasAudio: info.hasAudio });
  revalidatePath("/studio");
}


/* ---------------- 합격 후기 분석 (팀 도구) ---------------- */

const REVIEW_RESULTS = ["최종 합격", "서류 합격", "불합격", "확인 필요"];

/** 후기 본문을 코드북으로 코딩해 'AI 초안'으로 저장한다. 본문은 저장하지 않는다. */
export async function codeReviewAction(formData: FormData) {
  const user = await requireUser();
  const url = String(formData.get("url") || "").trim();
  const text = String(formData.get("text") || "");
  if (!/^https?:\/\//.test(url)) redirect("/reviews?error=url");
  if (text.trim().length < 80) redirect("/reviews?error=short");
  const dup = (await repo.listCodedReviews()).find((r) => r.meta.url === url);
  if (dup) redirect(`/reviews/${dup.id}?dup=1`);
  const result = String(formData.get("result") || "");
  const meta: trends.ReviewMeta = {
    url,
    sourceName: String(formData.get("sourceName") || "").trim() || hostLabel(url),
    title: String(formData.get("title") || "").trim() || undefined,
    org: String(formData.get("org") || "").trim() || undefined,
    activity: String(formData.get("activity") || "").trim() || undefined,
    field: String(formData.get("field") || "").trim() || undefined,
    result: REVIEW_RESULTS.includes(result) ? result : undefined,
  };
  let coded: trends.CodingResult;
  let failed = false;
  try {
    coded = await trends.codeReviewWithLLM(text, meta, getLLM());
  } catch (e) {
    // AI 호출이 실패해도 작업을 날리지 않게 규칙 기반 초안으로 저장하고 알려 준다
    console.error("[reviews] AI 코딩 실패", e);
    coded = trends.codeReviewByRules(text);
    failed = true;
  }
  const now = new Date().toISOString();
  const r: trends.CodedReview = { id: newId("rv"), meta, ai: { ...coded, codedAt: now }, status: "AI 초안", createdBy: user.id, createdAt: now };
  await repo.saveCodedReview(r);
  revalidatePath("/reviews");
  revalidatePath("/trends");
  redirect(`/reviews/${r.id}${failed ? "?aierror=1" : ""}`);
}

/** 사람이 점수를 확인·수정하고 '검수 완료'로 바꾼다 */
export async function verifyReviewAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const r = await repo.getCodedReview(id);
  if (!r) redirect("/reviews");
  const scores = Object.fromEntries(
    trends.CODES.map((c) => {
      const v = Number(formData.get(c));
      return [c, v === 2 ? 2 : v === 1 ? 1 : 0];
    }),
  ) as Record<skeleton.RubricCode, trends.Score>;
  const field = String(formData.get("field") || "").trim();
  if (field) r.meta.field = field;
  const org = String(formData.get("org") || "").trim();
  if (org) r.meta.org = org;
  const activity = String(formData.get("activity") || "").trim();
  if (activity) r.meta.activity = activity;
  const result = String(formData.get("result") || "");
  if (REVIEW_RESULTS.includes(result)) r.meta.result = result;
  r.human = { scores, reviewer: user.nickname, reviewedAt: new Date().toISOString() };
  r.status = "검수 완료";
  await repo.saveCodedReview(r);
  revalidatePath("/reviews");
  revalidatePath("/trends");
  redirect(`/reviews/${r.id}?saved=1`);
}

function hostLabel(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("linkareer")) return "링커리어 커뮤니티";
    if (h.includes("blog.naver")) return "네이버 블로그";
    if (h.includes("brunch")) return "브런치";
    if (h.includes("campuspick")) return "캠퍼스픽";
    return h;
  } catch {
    return "출처 확인 필요";
  }
}


/* ---------------- 크레딧 충전 · 구독 ---------------- */

/** 결제하기: 크레딧 묶음 또는 구독 시작. 지금은 테스트 결제라 실제 돈이 나가지 않는다 */
export async function buyAction(formData: FormData) {
  const user = await requireUser();
  const item = String(formData.get("item") || "");
  const method = String(formData.get("method") || "card") as billing.PayMethod;
  const back = (e: string) => redirect(`/credits/checkout?item=${encodeURIComponent(item)}&error=${encodeURIComponent(e)}`);
  if (!billing.PAY_METHODS.some((m) => m.id === method)) back("결제 수단을 골라 주세요.");
  if (formData.get("agree") !== "on") back("결제 내용과 환불 안내에 동의해 주세요.");
  const pack = billing.findPack(item);
  const plan = item.startsWith("plan_") ? billing.findPlan(item.slice(5)) : undefined;
  if (!pack && !plan) back("상품을 찾지 못했어요.");
  if (plan) {
    const cur = await syncSubscription(user.id);
    if (cur?.status === "active") back(`이미 ${billing.findPlan(cur.planId)?.name ?? ""} 구독 중이에요. 바꾸려면 먼저 해지해 주세요.`);
  }
  const order: billing.Order = {
    id: newId("ord"),
    userId: user.id,
    kind: pack ? "pack" : "subscription",
    item,
    itemName: pack ? `${pack.name} ${pack.credits}` : `${plan!.name} 구독`,
    amount: pack ? pack.price : plan!.price,
    credits: pack ? pack.credits : plan!.monthlyCredits,
    method,
    provider: payments.id,
    status: "failed",
    createdAt: new Date().toISOString(),
  };
  const res = await payments.charge({ orderId: order.id, amount: order.amount, method, itemName: order.itemName });
  if (!res.ok) {
    await repo.saveOrder(order);
    back(res.reason);
  }
  order.status = "paid";
  order.approvalId = (res as { approvalId: string }).approvalId;
  await repo.saveOrder(order);
  if (pack) {
    await repo.ledger.grant(user.id, pack.credits, "purchase", { idempotencyKey: `order:${order.id}`, refId: order.id, memo: order.itemName });
  } else {
    const sub = billing.startSubscription(user.id, plan!.id, todayISO());
    await repo.saveSubscription(sub);
    await repo.ledger.grant(user.id, plan!.monthlyCredits, "subscription_refill", { idempotencyKey: `sub:${user.id}:${sub.startedAt}`, refId: order.id, memo: `${plan!.name} ${sub.startedAt.slice(0, 7)}` });
  }
  revalidatePath("/", "layout");
  redirect(`/credits?paid=${order.id}`);
}

export async function cancelSubscriptionAction() {
  const user = await requireUser();
  const sub = await repo.getSubscription(user.id);
  if (sub?.status === "active") await repo.saveSubscription(billing.cancelSubscription(sub, new Date()));
  revalidatePath("/", "layout");
  redirect("/credits?canceled=1");
}


/* ---------------- 성과 직접 입력 (인스타 연결 전) ---------------- */

const FORMATS = ["reels", "cardnews", "post"] as const;
const count = (v: FormDataEntryValue | null) => {
  const n = Math.floor(Number(String(v ?? "").replace(/[,\s]/g, "")));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000_000) : NaN;
};

/** 내가 올린 게시물의 숫자를 직접 넣는다. 인스타를 연결하기 전에도 실제 성과로 피드백을 받을 수 있게 */
export async function addMediaAction(formData: FormData) {
  const user = await requireUser();
  const back = (e: string) => redirect(`/feedback?error=${encodeURIComponent(e)}#add`);
  const date = String(formData.get("date") || "");
  const format = String(formData.get("format") || "") as (typeof FORMATS)[number];
  const title = String(formData.get("title") || "").trim().slice(0, 80);
  const permalink = String(formData.get("permalink") || "").trim();
  const views = count(formData.get("views"));
  const likes = count(formData.get("likes"));
  const comments = count(formData.get("comments") || "0");
  const saves = count(formData.get("saves") || "0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) back("올린 날짜를 오늘이나 그 전으로 넣어 주세요.");
  if (!FORMATS.includes(format)) back("포맷을 골라 주세요.");
  if ([views, likes, comments, saves].some((n) => Number.isNaN(n))) back("숫자 칸에는 0 이상의 숫자만 넣어 주세요.");
  if (permalink && !/^https:\/\/(www\.)?instagram\.com\//.test(permalink)) back("원본 링크는 instagram.com 주소만 넣을 수 있어요.");
  const list = await manualMedia(user.id);
  list.push({ id: newId("m"), date, format, title: title || undefined, permalink: permalink || undefined, views, likes, comments, saves });
  await repo.setManualMedia(user.id, list.slice(-100));
  revalidatePath("/feedback");
  redirect("/feedback?added=1");
}

export async function removeMediaAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  await repo.setManualMedia(user.id, (await manualMedia(user.id)).filter((m) => m.id !== id));
  revalidatePath("/feedback");
  redirect("/feedback");
}
