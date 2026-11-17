import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickSegment, buildEditPlan, type ClipFeatures, type Scene } from "../src/content/index.js";
import { analyzeClipFeatures, parseMetadataLog, parseSilences, probeWithFfmpeg } from "../src/content/node.js";

/** 0.25초 단위 특징을 손으로 만든다: 0~2초 조용·정지, 2~4초 움직임 큼·소리 큼, 4~8초 말소리, 8~10초 정지 */
function fake(): ClipFeatures {
  const step = 0.25;
  const bins = 40;
  const motion = Array.from({ length: bins }, (_, i) => (i >= 8 && i < 16 ? 0.4 : i >= 32 ? 0 : 0.05));
  const loud = Array.from({ length: bins }, (_, i) => (i >= 8 && i < 16 ? -12 : i >= 16 && i < 32 ? -24 : -70));
  return { step, durationSec: 10, motion, loud, silences: [{ start: 0, end: 2 }, { start: 8, end: 10 }] };
}

describe("구간 고르기", () => {
  it("훅은 움직임·소리가 큰 곳을 고른다", () => {
    const p = pickSegment(fake(), 2, "hook");
    expect(p.start).toBeGreaterThanOrEqual(1.75);
    expect(p.start).toBeLessThanOrEqual(2.25);
    expect(p.reason).toContain("움직임");
  });

  it("말하는 장면은 무음이 없는 곳을 고른다", () => {
    const p = pickSegment(fake(), 3, "context");
    expect(p.start).toBeGreaterThanOrEqual(2);
    expect(p.start + p.duration).toBeLessThanOrEqual(8.01);
  });

  it("결과 장면은 움직임이 큰 구간(2~4초)을 피해 안정된 곳을 고른다", () => {
    const p = pickSegment(fake(), 2, "result");
    expect(p.start).toBeGreaterThanOrEqual(4);
    expect(p.reason).toContain("안정");
  });

  it("특징이 있으면 편집 계획에 고른 구간과 이유가 들어가고, 없으면 가운데를 쓴다", () => {
    const scene: Scene = { index: 0, role: "hook", durationSec: 2, shot: "close_up", what: "", onScreenText: "훅", tip: "" };
    const withF = buildEditPlan([{ scene, clip: { id: "a", path: "a.mp4", durationSec: 10, hasAudio: true, features: fake() } }]);
    expect(withF.segments[0]!.reason).toBeDefined();
    expect(withF.segments[0]!.start).toBeCloseTo(2, 0);
    const noF = buildEditPlan([{ scene, clip: { id: "a", path: "a.mp4", durationSec: 10, hasAudio: true } }]);
    expect(noF.segments[0]!.start).toBe(4);
    expect(noF.segments[0]!.reason).toBeUndefined();
  });

  it("ffmpeg 로그를 읽는다", () => {
    const log = "[Parsed_metadata_3] frame:0 pts:0 pts_time:0\n[Parsed_metadata_3] lavfi.scene_score=0.000\nframe:1 pts:1 pts_time:0.25\nlavfi.scene_score=0.420\nframe:2 pts_time:0.5\nlavfi.astats.Overall.RMS_level=-inf";
    expect(parseMetadataLog(log, "lavfi.scene_score")).toEqual([{ t: 0, v: 0 }, { t: 0.25, v: 0.42 }]);
    expect(parseMetadataLog(log, "lavfi.astats.Overall.RMS_level")).toEqual([{ t: 0.5, v: -90 }]);
    expect(parseSilences("silence_start: -0.01\nsilence_end: 1.5 | silence_duration: 1.5\nsilence_start: 4.2", 6)).toEqual([{ start: 0, end: 1.5 }, { start: 4.2, end: 6 }]);
  });
});

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(hasFfmpeg())("구간 분석 (실제 ffmpeg)", () => {
  it("움직임이 시작되는 곳과 소리가 나는 곳을 찾아낸다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "seg-"));
    const v = join(dir, "v.mp4");
    // 0~3초: 정지 화면 + 무음, 3~6초: 움직이는 화면 + 440Hz 소리
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=gray:size=320x240:rate=24:duration=3",
      "-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=3",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=3",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
      "-filter_complex", "[0:v][2:a][1:v][3:a]concat=n=2:v=1:a=1[v][a]",
      "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac", v,
    ]);
    const info = await probeWithFfmpeg(v);
    const f = await analyzeClipFeatures(v, info);
    expect(f.motion.length).toBeGreaterThanOrEqual(23);
    expect(f.silences[0]!.start).toBeLessThan(0.3);
    expect(f.silences[0]!.end).toBeGreaterThan(2.5);
    expect(Math.max(...f.loud.slice(14))).toBeGreaterThan(-30);
    const hook = pickSegment(f, 2, "hook");
    expect(hook.start).toBeGreaterThanOrEqual(2.5);
  }, 60_000);
});
