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

/**
 * ffprobe 없이 ffmpeg만으로 길이·오디오·해상도를 읽는다.
 * 서버리스 환경(Vercel 등)에서는 ffmpeg-static 바이너리 하나만 넣으면 되도록.
 */
export async function probeWithFfmpeg(path: string, ffmpegPath = "ffmpeg"): Promise<{ durationSec: number; hasAudio: boolean; width?: number; height?: number }> {
  const err = await new Promise<string>((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-hide_banner", "-i", path], { stdio: ["ignore", "ignore", "pipe"] });
    let s = "";
    p.stderr.on("data", (d) => (s += String(d)));
    p.on("error", reject);
    p.on("close", () => resolve(s)); // 출력 파일이 없어 종료 코드는 1이지만 정보는 stderr에 있다
  });
  const d = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!d) throw new Error("영상 정보를 읽지 못했어요");
  const durationSec = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  const v = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  return { durationSec, hasAudio: /Stream #.*Audio:/.test(err), width: v ? Number(v[1]) : undefined, height: v ? Number(v[2]) : undefined };
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
