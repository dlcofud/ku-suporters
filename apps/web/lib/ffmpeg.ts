import { existsSync } from "node:fs";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

/**
 * ffmpeg 실행 파일 경로.
 * 1) FFMPEG_PATH 환경 변수  2) ffmpeg-static 패키지 바이너리 (Vercel 배포용)  3) 시스템 ffmpeg
 */
export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const p = ffmpegStatic as unknown as string | null;
  if (p && existsSync(p)) return p;
  return "ffmpeg"; // 패키지 바이너리가 없으면 시스템 ffmpeg
}

/** 자막용 한글 글꼴. 저장소에 포함된 Pretendard(OFL)를 우선 쓴다. */
export function captionFont(): string | undefined {
  const candidates = [
    process.env.CAPTION_FONT_FILE,
    join(process.cwd(), "assets/fonts/Pretendard-Bold.otf"),
    join(process.cwd(), "apps/web/assets/fonts/Pretendard-Bold.otf"),
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p));
}
