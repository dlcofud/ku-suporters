import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planScenes, matchClips, buildEditPlan, buildFfmpegJob, draftCaption, MAX_REELS_SEC } from "../src/content/index.js";
import { renderWithFfmpeg, probeClip, probeWithFfmpeg } from "../src/content/node.js";

const scenes = planScenes({ title: "신제품 3초 리뷰", product: "꿀호떡칩", targetSec: 15, style: "review" });

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const FONT = [fileURLToPath(new URL("../../../apps/web/assets/fonts/Pretendard-Bold.otf", import.meta.url)), "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"].find(existsSync);

describe("content: 장면 기획", () => {
  it("훅부터 마무리까지 5장면, 합계가 목표 길이", () => {
    expect(scenes.map((s) => s.role)).toEqual(["hook", "context", "demo", "result", "cta"]);
    expect(scenes.reduce((a, s) => a + s.durationSec, 0)).toBe(15);
    expect(scenes[0]!.what).toContain("꿀호떡칩");
  });

  it("빠진 장면과 짧은 영상을 알려 준다", () => {
    const r = matchClips(scenes, [
      { id: "a", path: "a.mp4", durationSec: 10, hasAudio: true, sceneIndex: 1 },
      { id: "b", path: "b.mp4", durationSec: 1, hasAudio: false, sceneIndex: 3 },
    ]);
    expect(r.ready).toBe(false);
    expect(r.missing.map((s) => s.index)).toEqual([2, 4, 5]);
    expect(r.matches[2]!.problem).toContain("짧아요");
  });

  it("편집 계획은 클립 가운데를 쓰고 90초를 넘지 않는다", () => {
    const long = scenes.map((s, i) => ({ id: String(i), path: `${i}.mp4`, durationSec: 60, hasAudio: true, sceneIndex: s.index }));
    const big = planScenes({ title: "x", product: "y", targetSec: 30 }).map((s) => ({ ...s, durationSec: 40 }));
    const plan = buildEditPlan(matchClips(big, long).matches);
    expect(plan.totalSec).toBe(MAX_REELS_SEC);
    const p2 = buildEditPlan(matchClips(scenes, long).matches);
    expect(Math.abs(p2.segments[0]!.start - (60 - scenes[0]!.durationSec) / 2)).toBeLessThanOrEqual(0.1);
  });

  it("ffmpeg 인자: 9:16, 무음 트랙 보충, 자막은 ASS 파일", () => {
    const m = matchClips(scenes.slice(0, 2), [
      { id: "a", path: "/v/a.mp4", durationSec: 5, hasAudio: true },
      { id: "b", path: "/v/b.mp4", durationSec: 5, hasAudio: false },
    ]);
    const job = buildFfmpegJob(buildEditPlan(m.matches), { outPath: "/out.mp4", fontFile: "/f.ttf", workDir: "/tmp/w" });
    const fc = job.args[job.args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("scale=1080:1920");
    expect(fc).toContain("concat=n=2:v=1:a=1");
    expect(job.args).toContain("anullsrc=r=44100:cl=stereo");
    expect(fc).toContain("[vcat]ass='/tmp/w/captions.ass':fontsdir='/'[vout]");
    expect(job.files).toHaveLength(1);
    expect(job.files[0]!.content).toContain(scenes[0]!.onScreenText);
    expect(job.files[0]!.content).toContain(scenes[1]!.onScreenText);
    expect(job.files[0]!.content).toMatch(/Style: Cap,f,64/);
  });

  it("캡션 초안은 사용자가 직접 채울 빈칸을 남긴다", () => {
    expect(draftCaption({ title: "t", product: "p" }, scenes, ["리뷰", "#신상"])).toContain("[여기에 내 경험 한 줄을 직접 써 주세요]");
  });
});

describe.runIf(hasFfmpeg() && FONT)("content: 실제 렌더 (ffmpeg)", () => {
  it("가로 영상 2개(하나는 무음)를 9:16 자막 릴스로 합친다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sl-"));
    const a = join(dir, "a.mp4");
    const b = join(dir, "b.mp4");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-shortest", "-c:v", "libx264", "-c:a", "aac", a]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24:duration=4", "-c:v", "libx264", b]);
    const pa = await probeClip(a);
    const pb = await probeClip(b);
    expect(pb.hasAudio).toBe(false);
    const two = planScenes({ title: "t", product: "꿀호떡칩", targetSec: 15 }).slice(0, 2);
    const plan = buildEditPlan(matchClips(two, [
      { id: "a", path: a, ...pa },
      { id: "b", path: b, ...pb },
    ]).matches);
    const out = join(dir, "out.mp4");
    await renderWithFfmpeg(plan, { outPath: out, fontFile: FONT!, workDir: join(dir, "w") });
    const r = await probeClip(out);
    const r2 = await probeWithFfmpeg(out);
    expect(r2).toMatchObject({ width: 1080, height: 1920, hasAudio: true });
    expect(Math.abs(r2.durationSec - r.durationSec)).toBeLessThan(0.1);
    expect((await probeWithFfmpeg(b)).hasAudio).toBe(false);
    expect(r).toMatchObject({ width: 1080, height: 1920, hasAudio: true });
    expect(r.durationSec).toBeGreaterThan(plan.totalSec - 0.3);
    expect(r.durationSec).toBeLessThan(plan.totalSec + 0.3);
  }, 60_000);
});
