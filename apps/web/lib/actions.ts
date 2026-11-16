"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { notice, skeleton, planner, account, content, publish, contribution, credits } from "@supportlab/core";
import { renderWithFfmpeg, probeClip } from "@supportlab/core/content/node";
import { db, newId, latestActivity, todayISO, type Activity } from "./store";
import { COOKIE, requireUser } from "./session";
import { getLLM } from "./llm";
import { publisherFor } from "./publisher";

const DATA_DIR = process.env.SUPPORTLAB_DATA_DIR || "/tmp/supportlab";

/* ---------------- 가입 ---------------- */

export async function signup(formData: FormData) {
  const nickname = String(formData.get("nickname") || "").trim().slice(0, 20) || "서포터";
  const id = newId("u");
  db.users.set(id, { id, nickname, createdAt: new Date().toISOString() });
  await db.ledger.grantSignupBonus(id);
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect("/notice");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/");
}

/* ---------------- 공고 분석 ---------------- */

export async function analyzeNoticeAction(formData: FormData) {
  const user = await requireUser();
  const text = String(formData.get("text") || "");
  const sourceUrl = String(formData.get("url") || "") || undefined;
  if (text.trim().length < 20) redirect("/notice?error=short");
  const hold = await db.ledger.hold(user.id, "notice_analysis", newId("job")).catch(() => null);
  if (!hold) redirect("/notice?error=credits");
  try {
    const llm = getLLM();
    const year = Number(todayISO().slice(0, 4));
    const r = await notice.analyzeNoticeWithLLM(text, llm, { referenceYear: year, sourceUrl });
    await db.ledger.settle(hold, r.usage, r.tier);
    const name = String(formData.get("name") || "").trim() || r.analysis.title || "새 활동";
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
    db.activities.set(act.id, act);
  } catch (e) {
    await db.ledger.release(hold);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/notice");
}

function safePlan(deadline: string, name: string) {
  try {
    return planner.planSchedule({ today: todayISO(), deadline, newAccount: true, activityName: name });
  } catch {
    return undefined;
  }
}

export async function setDeadlineAction(formData: FormData) {
  const user = await requireUser();
  const act = latestActivity(user.id);
  const deadline = String(formData.get("deadline") || "");
  if (!act || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) redirect("/calendar");
  act.analysis.deadline = deadline;
  act.plan = safePlan(deadline, act.name);
  revalidatePath("/", "layout");
  redirect(act.plan ? "/calendar" : "/calendar?error=deadline");
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
  const act = latestActivity(user.id);
  if (!act) redirect("/notice");
  const profile: skeleton.ApplicantProfile = {
    experiences: parseExperiences(String(formData.get("experiences") || "")),
    channels: formData.get("hasChannel") ? [{ platform: "instagram" }] : [],
  };
  const extraQ = String(formData.get("questions") || "").split(/\r?\n/).map((q) => q.trim()).filter(Boolean);
  const base = skeleton.buildSkeleton({ questions: extraQ, notice: act.analysis, profile });
  const hold = await db.ledger.hold(user.id, "skeleton", newId("job")).catch(() => null);
  if (!hold) {
    act.skeleton = base; // 크레딧이 없으면 규칙 기반 뼈대만
  } else {
    try {
      const r = await skeleton.refineSkeletonWithLLM(base, profile, getLLM());
      await db.ledger.settle(hold, r.usage, r.tier);
      act.skeleton = r.skeleton;
    } catch {
      await db.ledger.release(hold);
      act.skeleton = base;
    }
  }
  revalidatePath("/", "layout");
  redirect("/skeleton");
}

/* ---------------- 계정 만들기 ---------------- */

export async function accountKitAction(formData: FormData) {
  const user = await requireUser();
  const act = latestActivity(user.id);
  if (!act) redirect("/notice");
  const input: account.AccountInput = {
    activityName: act.name,
    brand: String(formData.get("brand") || act.name.split(" ")[0] || "브랜드"),
    field: String(formData.get("field") || "기타"),
    nickname: String(formData.get("nickname") || user.nickname),
    interests: String(formData.get("interests") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  act.accountKit = account.buildAccountKit(input, Number(formData.get("concept") || 0));
  redirect("/account");
}

/* ---------------- 캘린더 · 피드백 반영 ---------------- */

export async function applySuggestionAction(formData: FormData) {
  const user = await requireUser();
  const act = latestActivity(user.id);
  const itemId = String(formData.get("itemId") || "");
  const to = String(formData.get("to") || "") as "reels" | "cardnews" | "post";
  if (act?.plan && itemId && to) act.plan = planner.changeFormat(act.plan, itemId, to);
  revalidatePath("/", "layout");
  redirect("/calendar");
}

/* ---------------- 콘텐츠 제작 ---------------- */

export async function planScenesAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const style = String(formData.get("style") || "review") as "review" | "challenge" | "routine";
  const targetSec = Number(formData.get("targetSec") || 15) as 15 | 20 | 30;
  const product = String(formData.get("product") || "제품");
  const act = latestActivity(user.id);
  const item = act?.plan?.items.find((i) => i.id === planItemId);
  db.scenes.set(`${user.id}:${planItemId}`, content.planScenes({ title: item?.title ?? "콘텐츠", product, targetSec, style }));
  redirect(`/studio?item=${planItemId}`);
}

export async function uploadClipsAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const dir = join(DATA_DIR, "uploads", user.id);
  await mkdir(dir, { recursive: true });
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("scene_") || !(value instanceof File) || value.size === 0) continue;
    const sceneIndex = Number(key.slice(6));
    const path = join(dir, `${planItemId}_${sceneIndex}_${Date.now()}.${(value.name.split(".").pop() || "mp4").slice(0, 5)}`);
    await writeFile(path, Buffer.from(await value.arrayBuffer()));
    const info = await probeClip(path);
    db.clips = db.clips.filter((c) => !(c.userId === user.id && c.planItemId === planItemId && c.sceneIndex === sceneIndex));
    db.clips.push({ id: newId("clip"), userId: user.id, planItemId, sceneIndex, path, durationSec: info.durationSec, hasAudio: info.hasAudio });
  }
  redirect(`/studio?item=${planItemId}`);
}

function fontFile(): string | undefined {
  const candidates = [
    process.env.CAPTION_FONT_FILE,
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "C:/Windows/Fonts/malgun.ttf",
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p));
}

export async function renderAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const scenes = db.scenes.get(`${user.id}:${planItemId}`) ?? [];
  const clips = db.clips.filter((c) => c.userId === user.id && c.planItemId === planItemId);
  const m = content.matchClips(scenes, clips);
  const font = fontFile();
  if (!font) redirect(`/studio?item=${planItemId}&error=font`);
  const plan = content.buildEditPlan(m.matches, { captions: formData.get("captions") !== "off" });
  if (plan.segments.length === 0) redirect(`/studio?item=${planItemId}&error=noclips`);
  const id = newId("r");
  const out = join(DATA_DIR, "renders", `${id}.mp4`);
  await mkdir(join(DATA_DIR, "renders"), { recursive: true });
  try {
    await renderWithFfmpeg(plan, { outPath: out, fontFile: font!, workDir: join(DATA_DIR, "work", id) });
  } catch {
    redirect(`/studio?item=${planItemId}&error=render`);
  }
  db.renders.push({ id, userId: user.id, planItemId, path: out, totalSec: plan.totalSec, createdAt: new Date().toISOString() });
  redirect(`/studio?item=${planItemId}`);
}

/* ---------------- 예약 게시 ---------------- */

export async function scheduleAction(formData: FormData) {
  const user = await requireUser();
  const renderId = String(formData.get("renderId") || "");
  const r = db.renders.find((x) => x.id === renderId && x.userId === user.id);
  if (!r) redirect("/studio");
  const base = process.env.PUBLIC_BASE_URL || "";
  const mediaUrl = base.startsWith("https://") ? `${base}/api/media/${r!.id}` : `https://demo.supportlab.local/api/media/${r!.id}`;
  const local = String(formData.get("publishAt") || "");
  const publishAt = new Date(`${local}:00+09:00`).toISOString();
  try {
    const post = publish.schedulePost(
      {
        id: newId("post"),
        userId: user.id,
        igUserId: user.ig?.userId ?? "demo",
        planItemId: r!.planItemId,
        mediaType: "REELS",
        mediaUrl,
        caption: String(formData.get("caption") || ""),
        publishAt,
      },
      new Date(),
    );
    db.posts.push(post);
  } catch (e) {
    redirect(`/studio?item=${r!.planItemId}&error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/studio?item=${r!.planItemId}`);
}

export async function cancelPostAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("postId") || "");
  db.posts = db.posts.map((p) => (p.id === id && p.userId === user.id && p.status !== "published" ? publish.cancelPost(p, new Date()) : p));
  revalidatePath("/studio");
}

/** 데모용: 주기 작업을 지금 한 번 실행한다. 실제 배포에서는 /api/cron/publish 가 5분마다 실행된다. */
export async function runTickNowAction() {
  const user = await requireUser();
  let mine = db.posts.filter((p) => p.userId === user.id);
  const { client, tokenFor, demo } = publisherFor(user);
  if (demo) {
    // 데모: 예약 시각까지 기다리지 않고 컨테이너 생성 → 처리 → 게시 단계를 바로 진행해 보여준다
    const latest = Math.max(Date.now(), ...mine.map((p) => new Date(p.publishAt).getTime()));
    const demoNow = new Date(latest + 60_000);
    for (let i = 0; i < 3; i++) mine = await publish.tick(mine, demoNow, client, tokenFor);
  } else {
    mine = await publish.tick(mine, new Date(), client, tokenFor);
  }
  db.posts = [...db.posts.filter((p) => p.userId !== user.id), ...mine];
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
    const dir = join(DATA_DIR, "proofs");
    await mkdir(dir, { recursive: true });
    proofRef = join(dir, `${c.id}_${proof.name.replace(/[^\w.]/g, "_")}`);
    await writeFile(proofRef, Buffer.from(await proof.arrayBuffer()));
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
  try {
    c = await contribution.submit(c, db.ledger, new Date().toISOString());
  } catch (e) {
    redirect("/contribute?error=" + encodeURIComponent((e as Error).message));
  }
  db.contributions.set(c.id, c);
  revalidatePath("/", "layout");
  redirect("/contribute?done=1");
}

export async function withdrawAction(formData: FormData) {
  const user = await requireUser();
  const c = db.contributions.get(String(formData.get("id") || ""));
  if (c && c.userId === user.id && c.status !== "withdrawn") {
    db.contributions.set(c.id, await contribution.withdraw(c, db.ledger, new Date().toISOString()));
  }
  revalidatePath("/", "layout");
  redirect("/contribute");
}

export async function reviewAction(formData: FormData) {
  const reviewer = await requireUser();
  let c = db.contributions.get(String(formData.get("id") || ""));
  if (!c) redirect("/admin");
  const at = new Date().toISOString();
  if (c!.status === "submitted") c = contribution.startReview(c!, reviewer.id, at);
  const checks = Object.fromEntries(Object.keys(contribution.REVIEW_CHECKS).map((k) => [k, formData.get(`chk_${k}`) === "on"]));
  try {
    c = await contribution.decide(
      c!,
      { reviewerId: reviewer.id, checks, decision: formData.get("decision") === "approve" ? "approve" : "reject", reason: String(formData.get("reason") || "") || undefined },
      db.ledger,
      at,
    );
  } catch (e) {
    db.contributions.set(c!.id, c!);
    redirect("/admin?error=" + encodeURIComponent((e as Error).message));
  }
  db.contributions.set(c!.id, c!);
  revalidatePath("/", "layout");
  redirect("/admin");
}

export type { credits };

/** 승인·반려 버튼을 각각의 액션으로 연결 (폼 제출 버튼 값은 서버 액션에 전달되지 않을 수 있다) */
export async function approveReviewAction(formData: FormData) {
  formData.set("decision", "approve");
  return reviewAction(formData);
}
export async function rejectReviewAction(formData: FormData) {
  formData.set("decision", "reject");
  return reviewAction(formData);
}
