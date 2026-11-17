import { copyFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { notice, type llm } from "@supportlab/core";
import { getLLM, llmStatus } from "./llm";

export type OcrImage = { data: Buffer; mediaType: llm.LLMImage["mediaType"] };

/**
 * 공고 이미지에서 글자를 읽는다.
 * 1) 이미지를 읽을 수 있는 AI가 연결돼 있으면 (Claude, Ollama Gemma 4) AI로
 * 2) 아니면(데모 모드) 또는 AI가 아무것도 못 읽으면 서버의 tesseract(한국어+영어)로
 * 읽은 글은 분석에만 쓰고 저장하지 않는다.
 */
export async function readImagesText(images: OcrImage[]): Promise<{ texts: string[]; engine: "ai" | "tesseract" | "none"; usage: { inputTokens: number; outputTokens: number }; tier: "local" | "paid" }> {
  const zero = { inputTokens: 0, outputTokens: 0 };
  if (!images.length) return { texts: [], engine: "none", usage: zero, tier: "local" };
  const client = getLLM();
  if (llmStatus().mode !== "demo" && client.vision) {
    const r = await notice.ocrWithLLM(images.map((i) => ({ mediaType: i.mediaType, data: i.data.toString("base64") })), client);
    if (r.texts.some((t) => t.trim().length >= 10)) return { texts: r.texts, engine: "ai", usage: r.usage, tier: client.tier };
  }
  try {
    return { texts: await tesseract(images), engine: "tesseract", usage: zero, tier: "local" };
  } catch (e) {
    console.error("[ocr] tesseract 실패", e);
    return { texts: [], engine: "none", usage: zero, tier: "local" };
  }
}

/* ---------------- tesseract (오프라인, 무료) ---------------- */

type TessWorker = { recognize(img: Buffer): Promise<{ data: { text: string } }>; terminate(): Promise<unknown> };
let workerP: Promise<TessWorker> | undefined;

/** 한국어·영어 학습 데이터를 한 폴더에 모은다 (tesseract는 데이터 폴더를 하나만 받는다) */
async function langDir(): Promise<string> {
  // require.resolve는 번들러가 모듈 번호로 바꿔 버려서, node_modules 폴더를 직접 찾는다 (모노레포면 루트에 있다)
  const roots = [join(process.cwd(), "node_modules"), join(process.cwd(), "..", "..", "node_modules")];
  const dataRoot = async (lang: string) => {
    for (const r of roots) {
      const d = join(r, "@tesseract.js-data", lang, "4.0.0_best_int");
      if (await stat(d).then(() => true, () => false)) return d;
    }
    throw new Error(`@tesseract.js-data/${lang} 를 찾지 못했어요`);
  };
  const dir = join(tmpdir(), "supportlab-tessdata");
  await mkdir(dir, { recursive: true });
  for (const lang of ["kor", "eng"]) {
    const dest = join(dir, `${lang}.traineddata.gz`);
    if (await stat(dest).then(() => true, () => false)) continue;
    const src = join(await dataRoot(lang), `${lang}.traineddata.gz`);
    await copyFile(src, dest);
  }
  return dir;
}

async function getWorker(): Promise<TessWorker> {
  workerP ??= (async () => {
    const { createWorker } = (await import("tesseract.js")) as unknown as { createWorker: (l: string[], oem: number, o: Record<string, unknown>) => Promise<TessWorker> };
    return createWorker(["kor", "eng"], 1, { langPath: await langDir(), cacheMethod: "none", gzip: true });
  })().catch((e) => {
    workerP = undefined;
    throw e;
  });
  return workerP;
}

async function tesseract(images: OcrImage[]): Promise<string[]> {
  const w = await getWorker();
  const out: string[] = [];
  for (const img of images) {
    if (img.mediaType === "image/gif") {
      out.push("");
      continue;
    }
    const { data } = await w.recognize(img.data);
    out.push(notice.cleanOcr(data.text));
  }
  return out;
}

/** 올린 파일·받은 응답의 형식을 확인한다 (png/jpeg/webp/gif만) */
export function imageType(name: string, contentType: string | null | undefined, head: Buffer): OcrImage["mediaType"] | undefined {
  if (head[0] === 0x89 && head[1] === 0x50) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (head.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  void name;
  void contentType;
  return undefined;
}
