/**
 * 콘텐츠 생성 (요구사항 4): 장면 기획 → 촬영 → AI 편집.
 *
 * 1) planScenes      : 콘텐츠 아이디어로 '찍어야 할 장면 리스트'를 만든다 (훅 → 맥락 → 시연 → 결과 → 마무리).
 * 2) matchClips      : 사용자가 장면별로 올린 영상을 맞춰 보고, 빠진 장면을 알려 준다.
 * 3) buildEditPlan   : 장면 길이에 맞춰 각 클립을 자르고, 화면 자막을 붙이는 편집 계획을 만든다.
 * 4) buildFfmpegJob  : 편집 계획을 오픈소스 ffmpeg 명령으로 바꾼다 (9:16 1080×1920, H.264/AAC, 자막).
 *    - 서버: content/node.ts 의 renderWithFfmpeg 로 실행
 *    - 브라우저: 같은 인자를 ffmpeg.wasm 에 넘기면 된다
 *
 * 이 파일은 Node 전용 API를 쓰지 않아 브라우저에서도 import 할 수 있다.
 */

export type ShotType = "close_up" | "pov_hands" | "medium" | "wide" | "screen" | "selfie";

export const SHOT_LABEL: Record<ShotType, string> = {
  close_up: "클로즈업",
  pov_hands: "손 시점(POV)",
  medium: "상반신",
  wide: "전체 공간",
  screen: "화면 녹화",
  selfie: "셀카 시점",
};

export interface Scene {
  index: number;
  role: "hook" | "context" | "demo" | "result" | "cta";
  durationSec: number;
  shot: ShotType;
  what: string;
  onScreenText: string;
  tip: string;
}

export interface ScenePlanInput {
  title: string;
  product: string;
  /** 목표 길이(초). 릴스는 15~30초를 권장 */
  targetSec?: 15 | 20 | 30;
  style?: "review" | "challenge" | "routine";
}

const ROLE_SHARE: Record<Scene["role"], number> = { hook: 0.15, context: 0.2, demo: 0.35, result: 0.2, cta: 0.1 };

/**
 * 규칙 기반 장면 틀 (AI가 없거나 응답이 깨졌을 때 쓰는 대체용).
 * 특정 제품군(예: 과자)에 묶이지 않도록 {p}(제품·주제)만 바꿔 끼운다. AI 장면 기획은 content/ai.ts
 */
const TEMPLATES: Record<NonNullable<ScenePlanInput["style"]>, Record<Scene["role"], { shot: ShotType; what: string; text: string; tip: string }>> = {
  review: {
    hook: { shot: "close_up", what: "{p}를 카메라 바로 앞에 보여 주기", text: "{p} 솔직 후기", tip: "첫 장면에 제품이 바로 보여야 넘기지 않아요" },
    context: { shot: "selfie", what: "왜 써 보게 됐는지 한마디", text: "써 보게 된 이유", tip: "말은 짧게, 내 상황 위주로" },
    demo: { shot: "pov_hands", what: "{p}를 실제로 쓰는 장면", text: "직접 써 봤어요", tip: "손과 제품이 같이 보이게, 소리도 살려요" },
    result: { shot: "close_up", what: "써 본 뒤 달라진 점 보여 주기", text: "내 점수는 ?/10", tip: "숫자로 평가하면 댓글이 늘어요" },
    cta: { shot: "medium", what: "추천하고 싶은 사람 한 줄 + 저장 버튼 가리키기", text: "필요할 때 보게 저장", tip: "저장을 부탁하면 정보형 반응이 늘어요" },
  },
  challenge: {
    hook: { shot: "medium", what: "결과물을 먼저 보여 주기", text: "{p}로 이거 해 봤어요", tip: "결과를 먼저 보여 주고 과정을 뒤에 붙여요" },
    context: { shot: "wide", what: "준비물을 책상에 펼쳐 놓기", text: "준비물은 이것뿐", tip: "위에서 내려다보는 구도가 깔끔해요" },
    demo: { shot: "pov_hands", what: "과정을 빠르게", text: "순서대로 따라 해 보세요", tip: "한 동작당 1~2초로 빠르게 끊어요" },
    result: { shot: "close_up", what: "결과 클로즈업", text: "완성!", tip: "자연광에서 찍으면 색이 살아요" },
    cta: { shot: "selfie", what: "같이 해 보자고 말하기", text: "같이 해 봐요", tip: "참여를 부르는 한마디로 공유를 노려요" },
  },
  routine: {
    hook: { shot: "selfie", what: "\"오늘 하루 {p}와 함께\" 한마디", text: "대학생 하루 with {p}", tip: "첫 문장에 상황을 딱 말해요" },
    context: { shot: "wide", what: "강의실·도서관 등 내가 실제로 있는 장소", text: "오늘의 일정", tip: "공감되는 상황이 조회수를 만들어요" },
    demo: { shot: "pov_hands", what: "{p}를 쓰는 순간", text: "이럴 때 꺼내요", tip: "실제 생활 장면이어야 진정성이 보여요" },
    result: { shot: "medium", what: "하루를 마무리하는 모습", text: "오늘도 끝", tip: "과장하지 말고 솔직하게" },
    cta: { shot: "close_up", what: "제품 이름이 보이게 마무리", text: "여러분은 언제 쓰세요?", tip: "질문으로 끝내면 댓글이 늘어요" },
  },
};

export function planScenes(input: ScenePlanInput): Scene[] {
  const total = input.targetSec ?? 15;
  const tpl = TEMPLATES[input.style ?? "review"];
  const roles: Scene["role"][] = ["hook", "context", "demo", "result", "cta"];
  const fill = (s: string) => s.replaceAll("{p}", input.product);
  // 장면 길이: 비율대로 나누되 0.5초 단위로 맞추고, 합계가 목표 길이와 같게 마지막 장면에서 보정
  const raw = roles.map((r) => Math.max(1.5, Math.round(total * ROLE_SHARE[r] * 2) / 2));
  const diff = total - raw.reduce((a, b) => a + b, 0);
  raw[2] = Math.max(1.5, raw[2]! + diff);
  return roles.map((role, i) => ({
    index: i + 1,
    role,
    durationSec: raw[i]!,
    shot: tpl[role].shot,
    what: fill(tpl[role].what),
    onScreenText: fill(tpl[role].text),
    tip: tpl[role].tip,
  }));
}

/* ------------------------------------------------------------------ */
/* 업로드 클립 매칭                                                     */
/* ------------------------------------------------------------------ */

export interface UploadedClip {
  id: string;
  /** 서버 경로 또는 브라우저의 가상 파일 이름 */
  path: string;
  durationSec: number;
  hasAudio: boolean;
  /** 사용자가 어느 장면용으로 올렸는지 (없으면 업로드 순서대로 배정) */
  sceneIndex?: number;
  /** ffmpeg로 잰 구간별 특징 (있으면 장면에 맞는 구간을 골라 쓴다) */
  features?: ClipFeatures;
}

/* ------------------------------------------------------------------ */
/* 구간 고르기 (AI 편집)                                                 */
/* ------------------------------------------------------------------ */

/**
 * 클립을 step초 단위로 잰 특징. content/node.ts 의 analyzeClipFeatures 가 ffmpeg로 만든다.
 * - motion: 앞 프레임과 얼마나 달라졌는지 (ffmpeg scene 점수, 0~1)
 * - loud:   소리 크기 (RMS dBFS, 무음이면 -90 근처)
 * - silences: 말·소리가 없는 구간 (silencedetect)
 */
export interface ClipFeatures {
  step: number;
  durationSec: number;
  motion: number[];
  loud: number[];
  silences: { start: number; end: number }[];
}

export interface SegmentPick {
  start: number;
  duration: number;
  /** 화면에 보여 줄 이유 (예: "움직임이 가장 많은 구간") */
  reason: string;
  score: number;
}

const ROLE_REASON: Record<Scene["role"], string> = {
  hook: "움직임과 소리가 가장 큰 구간",
  context: "말소리가 끊기지 않는 구간",
  demo: "움직임·소리가 살아 있는 구간",
  result: "화면이 가장 안정된 구간",
  cta: "말소리가 끊기지 않는 구간",
};

/** 장면 역할마다 무엇을 중요하게 볼지 (움직임, 소리 크기, 말소리 비율, 안정감) */
const ROLE_WEIGHT: Record<Scene["role"], { motion: number; loud: number; speech: number; still: number }> = {
  hook: { motion: 0.55, loud: 0.35, speech: 0.1, still: 0 },
  context: { motion: 0, loud: 0.25, speech: 0.75, still: 0 },
  demo: { motion: 0.45, loud: 0.35, speech: 0.2, still: 0 },
  result: { motion: 0, loud: 0.2, speech: 0.1, still: 0.7 },
  cta: { motion: 0, loud: 0.25, speech: 0.75, still: 0 },
};

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** -60dB 이하는 0, -10dB 이상은 1 */
const loudNorm = (db: number) => Math.min(1, Math.max(0, (db + 60) / 50));
const inSilence = (t: number, sil: ClipFeatures["silences"]) => sil.some((x) => t >= x.start && t < x.end);

/**
 * 장면 역할에 맞는 구간을 고른다.
 * 창(길이 need초)을 step씩 밀면서 점수를 매기고 가장 높은 곳을 쓴다.
 * - 훅: 움직임·소리가 큰 곳 / 말하는 장면: 무음이 적은 곳 / 결과: 흔들림 없는 곳
 * - 말 중간에서 시작·끝나지 않게, 경계가 무음에 걸리면 가산점
 * - 첫 0.3초는 버튼 누르는 흔들림이 많아 약간 감점
 */
export function pickSegment(f: ClipFeatures, need: number, role: Scene["role"]): SegmentPick {
  const duration = Math.min(need, f.durationSec);
  const lastStart = Math.max(0, f.durationSec - duration);
  const w = ROLE_WEIGHT[role];
  const maxMotion = Math.max(1e-6, ...f.motion);
  const n = Math.max(1, Math.round(duration / f.step));
  let best: SegmentPick = { start: Math.round((lastStart / 2) * 10) / 10, duration, reason: "가운데 구간", score: -1 };
  for (let i = 0; i * f.step <= lastStart + 1e-9; i++) {
    const start = i * f.step;
    const mo = mean(f.motion.slice(i, i + n)) / maxMotion;
    const lo = mean(f.loud.slice(i, i + n).map(loudNorm));
    let voiced = 0;
    for (let k = 0; k < n; k++) if (!inSilence(start + k * f.step, f.silences)) voiced++;
    const speech = voiced / n;
    let score = w.motion * mo + w.loud * lo + w.speech * speech + w.still * (1 - mo);
    const talky = w.speech >= 0.5;
    if (talky && (inSilence(start, f.silences) || inSilence(start + duration - f.step, f.silences))) score += 0.05;
    if (start < 0.3) score -= 0.05;
    if (score > best.score + 1e-9) best = { start: Math.round(start * 100) / 100, duration, reason: ROLE_REASON[role], score: Math.round(score * 1000) / 1000 };
  }
  return best;
}

export interface ClipMatch {
  scene: Scene;
  clip?: UploadedClip;
  problem?: string;
}

export function matchClips(scenes: Scene[], clips: UploadedClip[]): { matches: ClipMatch[]; missing: Scene[]; ready: boolean } {
  const pool = [...clips];
  const matches = scenes.map((scene): ClipMatch => {
    let i = pool.findIndex((c) => c.sceneIndex === scene.index);
    if (i < 0) i = pool.findIndex((c) => c.sceneIndex === undefined);
    const clip = i >= 0 ? pool.splice(i, 1)[0] : undefined;
    if (!clip) return { scene, problem: "이 장면 영상이 아직 없어요" };
    if (clip.durationSec < scene.durationSec) {
      return { scene, clip, problem: `영상이 ${scene.durationSec}초보다 짧아요 (${clip.durationSec}초). 있는 만큼만 써요` };
    }
    return { scene, clip };
  });
  const missing = matches.filter((m) => !m.clip).map((m) => m.scene);
  return { matches, missing, ready: missing.length === 0 };
}

/* ------------------------------------------------------------------ */
/* 편집 계획                                                            */
/* ------------------------------------------------------------------ */

export interface EditSegment {
  clipPath: string;
  start: number;
  duration: number;
  hasAudio: boolean;
  caption: string;
  /** 이 구간을 고른 이유 (구간 분석을 했을 때만) */
  reason?: string;
}

export interface EditPlan {
  width: number;
  height: number;
  fps: number;
  segments: EditSegment[];
  totalSec: number;
}

/** 릴스 API 업로드를 고려해 최대 90초로 제한한다. */
export const MAX_REELS_SEC = 90;

export function buildEditPlan(matches: ClipMatch[], opts: { captions?: boolean; fps?: number } = {}): EditPlan {
  const segments: EditSegment[] = [];
  for (const m of matches) {
    if (!m.clip) continue;
    let duration = Math.min(m.scene.durationSec, m.clip.durationSec);
    let start: number;
    let reason: string | undefined;
    if (m.clip.features && m.clip.durationSec > duration + 0.2) {
      // 클립을 재 둔 특징으로 장면 역할에 맞는 구간을 고른다
      const p = pickSegment(m.clip.features, duration, m.scene.role);
      start = p.start;
      duration = p.duration;
      reason = p.reason;
    } else {
      // 특징이 없으면 클립 가운데 부분을 쓴다(시작·끝의 흔들림을 피함)
      start = Math.max(0, Math.round(((m.clip.durationSec - duration) / 2) * 10) / 10);
    }
    segments.push({ clipPath: m.clip.path, start, duration, hasAudio: m.clip.hasAudio, caption: opts.captions === false ? "" : m.scene.onScreenText, reason });
  }
  let total = 0;
  const capped: EditSegment[] = [];
  for (const s of segments) {
    if (total >= MAX_REELS_SEC) break;
    const d = Math.min(s.duration, MAX_REELS_SEC - total);
    capped.push({ ...s, duration: d });
    total += d;
  }
  return { width: 1080, height: 1920, fps: opts.fps ?? 30, segments: capped, totalSec: Math.round(total * 10) / 10 };
}

/* ------------------------------------------------------------------ */
/* ffmpeg 명령 만들기                                                   */
/* ------------------------------------------------------------------ */

export interface FfmpegJob {
  args: string[];
  /** 실행 전에 만들어야 하는 자막 텍스트 파일 (drawtext textfile) */
  files: { path: string; content: string }[];
}

/** 필터 그래프 안의 경로에서 특별한 의미가 있는 문자를 이스케이프한다. */
function escFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * 편집 계획 → ffmpeg 인자.
 * - 각 클립을 -ss/-t 로 잘라 입력하고, 9:16으로 맞춘 뒤(남는 부분은 검은 여백), 자막을 얹고 이어 붙인다.
 * - 소리가 없는 클립은 무음 트랙을 만들어 끼운다(concat은 모든 조각에 오디오가 있어야 함).
 * - 자막은 따옴표·콜론 이스케이프 문제를 피하려고 textfile 로 넘긴다.
 */
export function buildFfmpegJob(plan: EditPlan, opts: { outPath: string; fontFile: string; workDir: string }): FfmpegJob {
  if (plan.segments.length === 0) throw new Error("편집할 영상이 없어요");
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  const files: FfmpegJob["files"] = [];
  const filters: string[] = [];
  const concatInputs: string[] = [];
  let inputIdx = 0;
  const { width: W, height: H, fps } = plan;

  plan.segments.forEach((seg, i) => {
    args.push("-ss", String(seg.start), "-t", String(seg.duration), "-i", seg.clipPath);
    const vIn = inputIdx++;
    let aLabel: string;
    if (seg.hasAudio) {
      aLabel = `${vIn}:a`;
    } else {
      args.push("-f", "lavfi", "-t", String(seg.duration), "-i", "anullsrc=r=44100:cl=stereo");
      aLabel = `${inputIdx++}:a`;
    }
    let v = `[${vIn}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p`;
    filters.push(`${v}[v${i}]`);
    filters.push(`[${aLabel}]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${seg.duration},asetpts=PTS-STARTPTS[a${i}]`);
    concatInputs.push(`[v${i}][a${i}]`);
  });
  // 자막: 이어 붙인 영상 위에 ASS 자막을 한 번에 입힌다 (libass — 한글 글꼴은 fontsdir로 지정)
  const captioned = plan.segments.some((s) => s.caption);
  filters.push(`${concatInputs.join("")}concat=n=${plan.segments.length}:v=1:a=1[${captioned ? "vcat" : "vout"}][aout]`);
  if (captioned) {
    const ass = `${opts.workDir.replace(/\/$/, "")}/captions.ass`;
    files.push({ path: ass, content: buildAss(plan, fontFamily(opts.fontFile)) });
    const slash = opts.fontFile.lastIndexOf("/");
    const dir = slash > 0 ? opts.fontFile.slice(0, slash) : slash === 0 ? "/" : ".";
    filters.push(`[vcat]ass='${escFilterPath(ass)}':fontsdir='${escFilterPath(dir)}'[vout]`);
  }
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    opts.outPath,
  );
  return { args, files };
}

/** 글꼴 파일 이름에서 글꼴 이름을 추정한다 (Pretendard-Bold.otf → Pretendard). */
function fontFamily(fontFile: string): string {
  const base = fontFile.slice(fontFile.lastIndexOf("/") + 1).replace(/\.[a-z0-9]+$/i, "");
  if (/notosanscjk/i.test(base)) return "Noto Sans CJK KR";
  return base.split("-")[0] || "sans-serif";
}

function assTime(sec: number): string {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** 장면별 화면 자막을 ASS 자막 파일로 만든다 (하단 28% 위치, 반투명 검은 상자). */
export function buildAss(plan: EditPlan, family: string): string {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
  let t = 0;
  const events: string[] = [];
  for (const seg of plan.segments) {
    if (seg.caption) events.push(`Dialogue: 0,${assTime(t)},${assTime(t + seg.duration)},Cap,,0,0,0,,${esc(seg.caption)}`);
    t += seg.duration;
  }
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${plan.width}`, `PlayResY: ${plan.height}`, "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // BorderStyle 3 = 글자 뒤 상자, BackColour/OutlineColour = 검은색 45% 투명
    `Style: Cap,${family},64,&H00FFFFFF,&H00FFFFFF,&H73000000,&H73000000,-1,0,0,0,100,100,0,0,3,18,0,2,80,80,${Math.round(plan.height * 0.22)},1`,
    "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events, "",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 캡션                                                                 */
/* ------------------------------------------------------------------ */

/** 장면 계획으로 게시물 캡션 초안을 만든다. 마지막 줄은 사용자가 자기 말로 바꾸도록 비워 둔다. */
export function draftCaption(input: ScenePlanInput, scenes: Scene[], hashtags: string[]): string {
  const hook = scenes.find((s) => s.role === "hook")?.onScreenText ?? input.title;
  const tags = hashtags.slice(0, 10).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return `${hook}\n\n[여기에 내 경험 한 줄을 직접 써 주세요]\n\n${tags}`;
}

export * from "./ai.js";
