import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeReferenceVideo } from "@supportlab/core/content/node";
import { currentUser } from "@/lib/session";
import { files, newId } from "@/lib/repo";
import { ffmpegPath } from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 참고 릴스 화면 녹화 분석: 컷 길이를 재고, 컷마다 장면 사진을 뽑아 둔다.
 * 받는 것: JSON { planItemId, storageKey } (직접 올린 영상) 또는 multipart { planItemId, video } (로컬 개발)
 * 돌려주는 것: { durationSec, cuts, frameKeys } — 장면 사진은 촬영 가이드를 만들 때 한 번 쓰고 지운다.
 * 원본 영상은 분석이 끝나면 바로 지운다.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const work = await mkdtemp(join(tmpdir(), "ref-"));
  let storageKey = "";
  try {
    let planItemId = "";
    let local = "";
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const fd = await req.formData();
      planItemId = String(fd.get("planItemId") ?? "");
      const v = fd.get("video");
      if (!(v instanceof File) || !v.size) return Response.json({ error: "영상을 골라 주세요" }, { status: 400 });
      local = join(work, "ref.mp4");
      await writeFile(local, Buffer.from(await v.arrayBuffer()));
    } else {
      const body = (await req.json().catch(() => ({}))) as { planItemId?: string; storageKey?: string };
      planItemId = String(body.planItemId ?? "");
      storageKey = String(body.storageKey ?? "");
      if (!storageKey.startsWith(`refs/${user.id}/`)) return Response.json({ error: "잘못된 파일 경로예요" }, { status: 400 });
      local = await files.toLocal(storageKey);
    }
    if (!/^[\w-]{1,80}$/.test(planItemId)) return Response.json({ error: "콘텐츠를 찾지 못했어요" }, { status: 400 });
    const r = await analyzeReferenceVideo(local, { workDir: work, ffmpegPath: ffmpegPath(), maxFrames: 10, maxSec: 90 });
    const batch = newId("rf");
    const frameKeys: string[] = [];
    for (const [i, f] of r.frames.entries()) {
      const key = `refs/${user.id}/${planItemId}/frames/${batch}_${i}.jpg`;
      await files.put(key, await readFile(f), "image/jpeg");
      frameKeys.push(key);
    }
    return Response.json({ durationSec: r.durationSec, cuts: r.cuts, frameKeys });
  } catch (e) {
    console.error("[refvideo] 분석 실패", e);
    return Response.json({ error: "영상을 읽지 못했어요. 화면 녹화 파일(mp4·mov)인지 확인해 주세요." }, { status: 400 });
  } finally {
    if (storageKey) await files.remove(storageKey).catch(() => undefined);
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
