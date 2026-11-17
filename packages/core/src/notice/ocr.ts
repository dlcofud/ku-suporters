/**
 * 공고 이미지 글자 읽기 (OCR).
 * 대외활동 공고는 마감일·문항 같은 핵심이 포스터 이미지 안에만 있는 경우가 많다.
 *  1) pickPosterImages: 페이지의 이미지 중 포스터일 만한 것을 고른다 (로고·아이콘·버튼 제외)
 *  2) ocrWithLLM: 이미지를 읽을 수 있는 AI에게 '보이는 글자를 그대로 옮겨 적기'를 시킨다
 *     (AI가 없으면 서버의 tesseract로 읽는다 → apps/web/lib/ocr.ts)
 *  3) withImageText: 읽은 글을 공고 본문 뒤에 붙여 분석한다
 * 읽은 글도 공고 원문이라 분석에만 쓰고 저장하지 않는다.
 */
import type { LLMClient, LLMImage } from "../llm/index.js";

const SKIP = /logo|icon|ico_|sprite|avatar|profile|emoji|badge|btn|button|arrow|spinner|loading|pixel|tracker|share|kakao_|facebook|twitter|instagram_|banner_ad|\/ads?\/|\/\/ads?\./i;
const POSTERISH = /poster|detail|content|upload|editor|activity|recruit|공고|포스터|모집|상세/i;

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];

/** 페이지에서 포스터일 만한 이미지 주소를 점수 순으로 고른다 */
export function pickPosterImages(html: string, baseUrl: string | undefined, max = 3): string[] {
  const abs = (u: string) => {
    try {
      return baseUrl ? new URL(u, baseUrl).toString() : u;
    } catch {
      return undefined;
    }
  };
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0];
  const ogUrl = og ? abs(attr(og, "content") ?? "") : undefined;
  const scored: { url: string; score: number; order: number }[] = [];
  let order = 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, "data-src") ?? attr(tag, "data-original") ?? attr(tag, "src");
    if (!src || src.startsWith("data:")) continue;
    const url = abs(src);
    if (!url || !/^https?:/i.test(url)) continue;
    const alt = attr(tag, "alt") ?? "";
    const cls = `${attr(tag, "class") ?? ""} ${attr(tag, "id") ?? ""}`;
    const path = url.split("?")[0]!;
    if (/\.(svg|ico)$/i.test(path) || SKIP.test(path) || SKIP.test(cls) || /로고|아이콘/.test(alt)) continue;
    const w = Number(attr(tag, "width"));
    const h = Number(attr(tag, "height"));
    if ((w && w < 200) || (h && h < 200)) continue;
    let score = 0;
    if (url === ogUrl) score += 5; // 사이트가 대표 이미지로 고른 것 (대외활동 사이트는 보통 포스터)
    if (w >= 500 || h >= 700) score += 2;
    if (POSTERISH.test(path) || POSTERISH.test(alt) || POSTERISH.test(cls)) score += 2;
    if (/\.gif$/i.test(path)) score -= 2;
    scored.push({ url, score, order: order++ });
  }
  if (ogUrl && !scored.some((s) => s.url === ogUrl) && !SKIP.test(ogUrl)) scored.push({ url: ogUrl, score: 5, order: -1 });
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
    .slice(0, max)
    .map((s) => s.url);
}

export const OCR_SYSTEM =
  "너는 이미지 속 글자를 옮겨 적는 도구야. 보이는 글자를 위에서 아래로 그대로 적어. 요약·해석·번역하지 말고, 없는 글자를 만들지 마. 표는 한 줄에 한 칸씩 '항목: 내용'으로. 글자가 없으면 아무것도 쓰지 마.";

/** 이미지마다 AI로 글자를 읽는다 (한 장씩, 실패한 장은 건너뛴다) */
export async function ocrWithLLM(images: LLMImage[], llm: LLMClient): Promise<{ texts: string[]; usage: { inputTokens: number; outputTokens: number } }> {
  const texts: string[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (const img of images) {
    try {
      const r = await llm.complete({ system: OCR_SYSTEM, user: "이 공고 이미지의 글자를 모두 옮겨 적어 줘.", maxOutputTokens: 1500, images: [img] });
      usage.inputTokens += r.inputTokens;
      usage.outputTokens += r.outputTokens;
      texts.push(cleanOcr(r.text));
    } catch {
      texts.push("");
    }
  }
  return { texts, usage };
}

/** 코드 블록·빈 줄 정리 */
export function cleanOcr(t: string): string {
  return t
    .replace(/```[a-z]*\n?|```/gi, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .filter((l, i, a) => l.trim() || (a[i - 1]?.trim() ?? ""))
    .join("\n")
    .trim();
}

/** 공고 본문 뒤에 이미지에서 읽은 글을 붙인다 (이미 본문에 있는 줄은 빼서 중복을 줄인다) */
export function withImageText(text: string, imageTexts: string[]): string {
  const have = new Set(text.split(/\r?\n/).map((l) => l.replace(/\s+/g, "")).filter((l) => l.length >= 6));
  const parts = imageTexts
    .map((t, i) => {
      const lines = t.split(/\r?\n/).filter((l) => !have.has(l.replace(/\s+/g, "")));
      const body = lines.join("\n").trim();
      return body.length >= 10 ? `[공고 이미지 ${i + 1}에서 읽은 글]\n${body}` : "";
    })
    .filter(Boolean);
  return [text.trim(), ...parts].filter(Boolean).join("\n\n").slice(0, 30_000);
}
