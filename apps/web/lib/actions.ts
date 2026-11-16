"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { notice, skeleton, planner, account, content, publish, contribution } from "@supportlab/core";
import { renderWithFfmpeg, probeWithFfmpeg } from "@supportlab/core/content/node";
import { repo, files, newId, todayISO, type Activity } from "./repo";
import { COOKIE, requireUser } from "./session";
import { getLLM } from "./llm";
import { publisherFor } from "./publisher";
import { ffmpegPath, captionFont } from "./ffmpeg";

const WORK_DIR = join(process.env.SUPPORTLAB_DATA_DIR || tmpdir(), "supportlab-work");

async function activityOrRedirect(userId: string, to = "/notice"): Promise<Activity> {
  const act = await repo.latestActivity(userId);
  if (!act) redirect(to);
  return act;
}

/* ---------------- 가입 ---------------- */

export async function signup(formData: FormData) {
  const nickname = String(formData.get("nickname") || "").trim().slice(0, 20) || "서포터";
  const user = await repo.createUser(nickname);
  await repo.ledger.grantSignupBonus(user.id);
  (await cookies()).set(COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect("/notice");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/");
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
  const text = String(formData.get("text") || "");
  const sourceUrl = String(formData.get("url") || "") || undefined;
  if (text.trim().length < 20) redirect("/notice?error=short");
  const hold = await repo.ledger.hold(user.id, "notice_analysis", newId("job")).catch(() => null);
  if (!hold) redirect("/notice?error=credits");
  try {
    const year = Number(todayISO().slice(0, 4));
    const r = await notice.analyzeNoticeWithLLM(text, getLLM(), { referenceYear: year, sourceUrl });
    await repo.ledger.settle(hold, r.usage, r.tier);
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
    await repo.saveActivity(act);
  } catch (e) {
    await repo.ledger.release(hold);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/notice");
}

export async function setDeadlineAction(formData: FormData) {
  const user = await requireUser();
  const act = await activityOrRedirect(user.id);
  const deadline = String(formData.get("deadline") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) redirect("/calendar");
  act.analysis.deadline = deadline;
  act.plan = safePlan(deadline, act.name);
  await repo.saveActivity(act);
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
  redirect("/calendar");
}

/* ---------------- 콘텐츠 제작 ---------------- */

export async function planScenesAction(formData: FormData) {
  const user = await requireUser();
  const planItemId = String(formData.get("planItemId") || "");
  const style = String(formData.get("style") || "review") as "review" | "challenge" | "routine";
  const targetSec = Number(formData.get("targetSec") || 15) as 15 | 20 | 30;
  const product = String(formData.get("product") || "제품");
  const act = await repo.latestActivity(user.id);
  const item = act?.plan?.items.find((i) => i.id === planItemId);
  await repo.setScenes(user.id, planItemId, content.planScenes({ title: item?.title ?? "콘텐츠", product, targetSec, style }));
  redirect(`/studio?item=${planItemId}`);
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
    clips.map(async (c) => ({ id: c.id, path: await files.toLocal(c.storageKey), durationSec: c.durationSec, hasAudio: c.hasAudio, sceneIndex: c.sceneIndex })),
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
