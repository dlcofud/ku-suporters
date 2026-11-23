/**
 * 서버(Node)에서 ffmpeg로 편집 계획을 실제 영상으로 만든다.
 * 브라우저 번들에 섞이지 않도록 content/index.ts와 파일을 나눴다.
 *
 * 필요: 서버에 ffmpeg 설치 (Vercel 등에서는 ffmpeg-static 패키지 경로를 ffmpegPath로 넘기면 된다)
 * 한국어 자막에는 한글 글꼴 파일이 필요하다 (예: Noto Sans KR, Pretendard).
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import type { ClipFeatures, EditPlan } from "./index.js";
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

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let s = "";
    p.stderr.on("data", (d) => (s += String(d)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(s) : reject(new Error(`ffmpeg 분석 실패 (${code}): ${s.slice(-400)}`))));
  });
}

/** ffmpeg metadata=print / ametadata=print 출력에서 (시각, 값) 쌍을 읽는다 */
export function parseMetadataLog(log: string, key: string): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  let t: number | undefined;
  for (const line of log.split(/\r?\n/)) {
    const pt = line.match(/pts_time:([\d.]+)/);
    if (pt) t = Number(pt[1]);
    const i = line.indexOf(`${key}=`);
    if (i >= 0 && t !== undefined) {
      const raw = line.slice(i + key.length + 1).trim();
      const v = raw === "-inf" ? -90 : Number(raw);
      if (!Number.isNaN(v)) out.push({ t, v });
    }
  }
  return out;
}

/** silencedetect 출력에서 무음 구간을 읽는다 (끝나지 않은 무음은 영상 끝까지) */
export function parseSilences(log: string, durationSec: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let open: number | undefined;
  for (const line of log.split(/\r?\n/)) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) open = Math.max(0, Number(s[1]));
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && open !== undefined) {
      out.push({ start: open, end: Number(e[1]) });
      open = undefined;
    }
  }
  if (open !== undefined) out.push({ start: open, end: durationSec });
  return out;
}

/**
 * 클립을 0.25초 단위로 재서 구간 고르기에 쓸 특징을 만든다. ffmpeg 하나로 동작한다(GPU 불필요).
 *  1) 영상: 작게 줄여 초당 4프레임만 보고 scene 점수(앞 프레임과의 차이)를 읽는다
 *  2) 소리: 0.25초마다 RMS 크기, 그리고 -35dB 아래로 0.35초 이상 이어지는 무음 구간
 */
export async function analyzeClipFeatures(path: string, info: { durationSec: number; hasAudio: boolean }, ffmpegPath = "ffmpeg"): Promise<ClipFeatures> {
  const step = 0.25;
  const bins = Math.max(1, Math.ceil(info.durationSec / step));
  const vlog = await runFfmpeg(ffmpegPath, ["-hide_banner", "-nostats", "-i", path, "-an", "-vf", "fps=4,scale=96:-2,select='gte(scene,0)',metadata=print", "-f", "null", "-"]);
  const motion = new Array<number>(bins).fill(0);
  for (const { t, v } of parseMetadataLog(vlog, "lavfi.scene_score")) {
    const i = Math.min(bins - 1, Math.floor(t / step));
    motion[i] = Math.max(motion[i]!, v);
  }
  const loud = new Array<number>(bins).fill(-90);
  let silences: ClipFeatures["silences"] = [{ start: 0, end: info.durationSec }];
  if (info.hasAudio) {
    const alog = await runFfmpeg(ffmpegPath, [
      "-hide_banner", "-nostats", "-i", path, "-vn",
      "-af", "aresample=16000,asetnsamples=n=4000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level,silencedetect=noise=-35dB:d=0.35",
      "-f", "null", "-",
    ]);
    for (const { t, v } of parseMetadataLog(alog, "lavfi.astats.Overall.RMS_level")) {
      const i = Math.min(bins - 1, Math.floor(t / step + 1e-6));
      loud[i] = v;
    }
    silences = parseSilences(alog, info.durationSec);
  }
  return { step, durationSec: info.durationSec, motion, loud, silences };
}

/* ------------------------------------------------------------------ */
/* 참고 릴스 화면 녹화: 컷 나누기 · 장면 사진 뽑기                        */
/* ------------------------------------------------------------------ */

/** showinfo 로그에서 컷이 바뀐 시각(초) */
export function parseSceneTimes(log: string): number[] {
  return [...log.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((t) => Number.isFinite(t));
}

/**
 * 컷 시각 → 컷 길이. 너무 짧은 컷(0.4초 미만, 화면 녹화의 흔들림·전환 효과)은 앞 컷에 붙인다.
 * 앞뒤 화면 녹화 군더더기(처음·끝 0.3초)는 길이에만 포함한다.
 */
export function cutsFromTimes(times: number[], durationSec: number, minCut = 0.4): number[] {
  const marks = [0, ...times.filter((t) => t > 0 && t < durationSec).sort((a, b) => a - b), durationSec];
  const out: number[] = [];
  for (let i = 1; i < marks.length; i++) {
    const d = marks[i]! - marks[i - 1]!;
    if (d < minCut && out.length) out[out.length - 1]! += d;
    else out.push(d);
  }
  // 맨 앞 컷이 너무 짧으면 다음 컷에 붙인다
  if (out.length > 1 && out[0]! < minCut) out.splice(0, 2, out[0]! + out[1]!);
  return out.map((d) => Math.round(d * 100) / 100);
}

/**
 * 화면 녹화한 참고 릴스를 읽는다: 컷 길이와, 컷마다 가운데 장면 사진(최대 maxFrames장, 짧은 변 540px JPEG).
 * 음성·자막 글자는 읽지 않는다(사진으로 AI가 본다).
 */
export async function analyzeReferenceVideo(
  path: string,
  opts: { workDir: string; ffmpegPath?: string; threshold?: number; maxFrames?: number; maxSec?: number },
): Promise<{ durationSec: number; cuts: number[]; frames: string[] }> {
  const ff = opts.ffmpegPath ?? "ffmpeg";
  await mkdir(opts.workDir, { recursive: true });
  const info = await probeWithFfmpeg(path, ff);
  const durationSec = Math.min(info.durationSec, opts.maxSec ?? 90);
  const log = await runFfmpeg(ff, ["-hide_banner", "-t", String(durationSec), "-i", path, "-vf", `select='gt(scene,${opts.threshold ?? 0.3})',showinfo`, "-an", "-f", "null", "-"]);
  const cuts = cutsFromTimes(parseSceneTimes(log), durationSec);
  // 컷 가운데 시각에서 한 장씩. 컷이 많으면 고르게 고른다
  let t = 0;
  const mids = cuts.map((d) => {
    const m = t + d / 2;
    t += d;
    return m;
  });
  const max = opts.maxFrames ?? 10;
  const pick = mids.length <= max ? mids : Array.from({ length: max }, (_, i) => mids[Math.round((i * (mids.length - 1)) / (max - 1))]!);
  const frames: string[] = [];
  for (const [i, at] of pick.entries()) {
    const out = `${opts.workDir}/frame_${i}.jpg`;
    await runFfmpeg(ff, ["-hide_banner", "-y", "-ss", at.toFixed(2), "-i", path, "-frames:v", "1", "-vf", "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'", "-q:v", "4", out]);
    frames.push(out);
  }
  return { durationSec: Math.round(durationSec * 100) / 100, cuts, frames };
}
