import { content, type llm } from "@supportlab/core";
import { currentUser, currentActivity } from "@/lib/session";
import { files, repo } from "@/lib/repo";
import { withCredits, briefFor } from "@/lib/aiwork";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMIT = { ref: 6, mood: 4, subject: 4 };
const IMG = /^image\/(png|jpeg|webp|gif)$/;

/**
 * 참고 자료로 촬영 가이드 만들기.
 * multipart: planItemId, links, script, subject, idea, product, targetSec(빈 값이면 참고 릴스 길이),
 *            refCuts(JSON), frameKeys(JSON: 화면 녹화에서 뽑은 장면 사진), ref·mood·subjectImg 사진들
 * 사진은 분석에만 쓰고 저장하지 않는다. 남기는 것: 장면 목록, 분석 요약, 링크·대본·설명 글.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const act = await currentActivity(user.id);
  const fd = await req.formData().catch(() => null);
  if (!act?.plan || !fd) return Response.json({ error: "먼저 업로드 일정을 만들어 주세요" }, { status: 400 });
  const planItemId = String(fd.get("planItemId") ?? "");
  const item = act.plan.items.find((i) => i.id === planItemId);
  if (!item) return Response.json({ error: "콘텐츠를 찾지 못했어요" }, { status: 400 });

  const text = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
  const links = text("links", 2000).split(/\s+/).filter((l) => /^https?:\/\//.test(l)).slice(0, 5);
  const script = text("script", 2000);
  const subject = text("subject", 800);
  const idea = text("idea", 600);
  const product = text("product", 40) || item.product || act.name.split(" ")[0] || "";
  const targetSec = Number(fd.get("targetSec")) || undefined;
  const parseJson = <T,>(k: string, fallback: T): T => {
    try {
      return JSON.parse(String(fd.get(k) ?? "")) as T;
    } catch {
      return fallback;
    }
  };
  const refCuts = parseJson<number[]>("refCuts", []).map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 40);
  const frameKeys = parseJson<string[]>("frameKeys", []).filter((k) => typeof k === "string" && k.startsWith(`refs/${user.id}/${planItemId}/frames/`)).slice(0, 10);

  const toImg = async (f: FormDataEntryValue): Promise<llm.LLMImage | undefined> => {
    if (!(f instanceof File) || !f.size || !IMG.test(f.type) || f.size > 3 * 1024 * 1024) return undefined;
    return { mediaType: f.type as llm.LLMImage["mediaType"], data: Buffer.from(await f.arrayBuffer()).toString("base64") };
  };
  const take = async (k: string, n: number) => (await Promise.all(fd.getAll(k).slice(0, n).map(toImg))).filter((x): x is llm.LLMImage => !!x);
  const frames = (await Promise.all(frameKeys.map((k) => files.read(k)))).filter((b): b is Buffer => !!b).map((b) => ({ mediaType: "image/jpeg" as const, data: b.toString("base64") }));
  const images: content.ShootImages = {
    ref: [...frames, ...(await take("ref", LIMIT.ref))].slice(0, 10),
    mood: await take("mood", LIMIT.mood),
    subject: await take("subjectImg", LIMIT.subject),
  };

  const brief: content.ShootBrief = { ...briefFor(act, item, product, idea || item.idea), refLinks: links, refCuts, script, subject, targetSec };
  const target = content.shootTargetSec(brief);
  const nearest = ([15, 20, 30] as const).reduce((p, c) => (Math.abs(c - target) < Math.abs(p - target) ? c : p));
  const r = await withCredits(user.id, "reels_plan", (client) => content.planShootAI(client, brief, images), () => ({
    analysis: { pace: "", hook: "", textStyle: "", mood: "", palette: [], sound: "", structure: "" },
    scenes: content.planScenes({ title: item.title, product, targetSec: nearest }),
    caption: "",
  }));

  await repo.setScenes(user.id, planItemId, r.value.scenes);
  item.shoot = { refLinks: links, script: script || undefined, subject: subject || undefined, targetSec, analysis: r.source === "ai" ? r.value.analysis : undefined, refCuts: refCuts.length ? refCuts : undefined, at: new Date().toISOString() };
  item.idea = idea || item.idea;
  item.product = product || item.product;
  if (r.value.caption && !item.caption) item.caption = r.value.caption;
  await repo.saveActivity(act);
  for (const k of frameKeys) await files.remove(k).catch(() => undefined);
  return Response.json({ ok: true, source: r.source, note: r.note, scenes: r.value.scenes.length });
}
