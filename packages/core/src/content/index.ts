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

const TEMPLATES: Record<NonNullable<ScenePlanInput["style"]>, Record<Scene["role"], { shot: ShotType; what: string; text: string; tip: string }>> = {
  review: {
    hook: { shot: "close_up", what: "{p}를 카메라 바로 앞에 들이밀기", text: "{p} 솔직 리뷰 3초 컷", tip: "첫 장면에 제품이 바로 보여야 넘기지 않아요" },
    context: { shot: "selfie", what: "어디서 샀는지, 왜 궁금했는지 한마디", text: "편의점 신상 발견!", tip: "말은 짧게, 표정은 크게" },
    demo: { shot: "pov_hands", what: "포장 뜯고 한 입 먹는 장면", text: "식감 체크", tip: "소리(바삭함)가 들리게 마이크 가까이" },
    result: { shot: "close_up", what: "단면이나 남은 양 보여주기", text: "내 점수는 ?/10", tip: "숫자로 평가하면 댓글이 늘어요" },
    cta: { shot: "medium", what: "추천 대상 한 줄 + 손가락으로 저장 버튼 가리키기", text: "저장해 두고 편의점 갈 때 보기", tip: "저장을 부탁하면 정보형 반응이 늘어요" },
  },
  challenge: {
    hook: { shot: "medium", what: "결과물을 먼저 보여주기", text: "{p}로 이거 만들기 성공?", tip: "결과를 먼저 보여주고 과정을 뒤에 붙여요" },
    context: { shot: "wide", what: "준비물을 책상에 펼쳐 놓기", text: "준비물은 단 3개", tip: "위에서 내려다보는 구도가 깔끔해요" },
    demo: { shot: "pov_hands", what: "만드는 과정을 빠르게", text: "순서대로 따라 해 보세요", tip: "한 동작당 1~2초로 빠르게 끊어요" },
    result: { shot: "close_up", what: "완성품 클로즈업", text: "완성!", tip: "자연광에서 찍으면 색이 살아요" },
    cta: { shot: "selfie", what: "같이 해 보자고 말하기", text: "#챌린지 같이 해요", tip: "참여를 부르는 한마디로 공유를 노려요" },
  },
  routine: {
    hook: { shot: "selfie", what: "\"오늘 하루 {p}로 버티기\" 한마디", text: "대학생 하루 루틴 with {p}", tip: "첫 문장에 상황을 딱 말해요" },
    context: { shot: "wide", what: "강의실·도서관 등 장소 보여주기", text: "시험 기간 3일 전", tip: "공감되는 상황이 조회수를 만들어요" },
    demo: { shot: "pov_hands", what: "{p}를 꺼내 먹는 순간", text: "당 충전 타이밍", tip: "실제 생활 장면이어야 진정성이 보여요" },
    result: { shot: "medium", what: "다시 공부하는 모습", text: "효과는 확실", tip: "과장하지 말고 솔직하게" },
    cta: { shot: "close_up", what: "제품 이름이 보이게 마무리", text: "여러분의 시험 간식은?", tip: "질문으로 끝내면 댓글이 늘어요" },
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
    const duration = Math.min(m.scene.durationSec, m.clip.durationSec);
    // 클립 가운데 부분을 쓴다(시작·끝의 흔들림을 피함)
    const start = Math.max(0, Math.round(((m.clip.durationSec - duration) / 2) * 10) / 10);
    segments.push({ clipPath: m.clip.path, start, duration, hasAudio: m.clip.hasAudio, caption: opts.captions === false ? "" : m.scene.onScreenText });
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
    if (seg.caption) {
      const txt = `${opts.workDir.replace(/\/$/, "")}/caption_${i + 1}.txt`;
      files.push({ path: txt, content: seg.caption });
      v += `,drawtext=fontfile='${escFilterPath(opts.fontFile)}':textfile='${escFilterPath(txt)}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=h*0.72`;
    }
    filters.push(`${v}[v${i}]`);
    filters.push(`[${aLabel}]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${seg.duration},asetpts=PTS-STARTPTS[a${i}]`);
    concatInputs.push(`[v${i}][a${i}]`);
  });
  filters.push(`${concatInputs.join("")}concat=n=${plan.segments.length}:v=1:a=1[vout][aout]`);
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

/* ------------------------------------------------------------------ */
/* 캡션                                                                 */
/* ------------------------------------------------------------------ */

/** 장면 계획으로 게시물 캡션 초안을 만든다. 마지막 줄은 사용자가 자기 말로 바꾸도록 비워 둔다. */
export function draftCaption(input: ScenePlanInput, scenes: Scene[], hashtags: string[]): string {
  const hook = scenes.find((s) => s.role === "hook")?.onScreenText ?? input.title;
  const tags = hashtags.slice(0, 10).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return `${hook}\n\n[여기에 내 경험 한 줄을 직접 써 주세요]\n\n${tags}`;
}
