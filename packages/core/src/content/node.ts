/**
 * 서버(Node)에서 ffmpeg로 편집 계획을 실제 영상으로 만든다.
 * 브라우저 번들에 섞이지 않도록 content/index.ts와 파일을 나눴다.
 *
 * 필요: 서버에 ffmpeg 설치 (Vercel 등에서는 ffmpeg-static 패키지 경로를 ffmpegPath로 넘기면 된다)
 * 한국어 자막에는 한글 글꼴 파일이 필요하다 (예: Noto Sans KR, Pretendard).
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import type { EditPlan } from "./index.js";
import { buildFfmpegJob } from "./index.js";

export interface RenderOptions {
  outPath: string;
  fontFile: string;
  workDir: string;
  ffmpegPath?: string;
}

export async function renderWithFfmpeg(plan: EditPlan, opts: RenderOptions): Promise<{ outPath: string }> {
  const job = buildFfmpegJob(plan, opts);
  await mkdir(opts.workDir, { recursive: true });
  for (const f of job.files) await writeFile(f.path, f.content, "utf8");
  await new Promise<void>((resolve, reject) => {
    const p = spawn(opts.ffmpegPath ?? "ffmpeg", job.args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 실패 (${code}): ${err.slice(-800)}`))));
  });
  return { outPath: opts.outPath };
}

/** ffprobe로 영상 길이·오디오 유무를 읽는다 (업로드 직후 UploadedClip을 만들 때 사용). */
export async function probeClip(path: string, ffprobePath = "ffprobe"): Promise<{ durationSec: number; hasAudio: boolean; width?: number; height?: number }> {
  const out = await new Promise<string>((resolve, reject) => {
    const p = spawn(ffprobePath, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path]);
    let s = "";
    p.stdout.on("data", (d) => (s += String(d)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(s) : reject(new Error(`ffprobe 실패 (${code})`))));
  });
  const j = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] };
  const video = j.streams?.find((s) => s.codec_type === "video");
  return {
    durationSec: Number(j.format?.duration ?? 0),
    hasAudio: !!j.streams?.some((s) => s.codec_type === "audio"),
    width: video?.width,
    height: video?.height,
  };
}
