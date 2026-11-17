import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { notice } from "@supportlab/core";

/**
 * 사용자가 붙여넣은 공고 링크 한 페이지를 가져와 본문을 뽑는다.
 * - 그 페이지만 읽는다 (링크를 따라 다른 페이지를 돌지 않는다)
 * - 서버 내부 주소(127.0.0.1, 10.x, 169.254.x 등)로는 요청하지 않는다 — 리다이렉트마다 다시 확인
 * - 10초, 3MB, 리다이렉트 4번까지
 * 뽑은 글은 분석에만 쓰고 저장하지 않는다.
 */

export class NoticeFetchError extends Error {
  constructor(public code: "url" | "blocked" | "http" | "type" | "timeout" | "empty" | "image", message: string) {
    super(message);
  }
}

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivate(mapped[1]!) : false;
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new NoticeFetchError("url", "http(s) 주소만 넣을 수 있어요");
  if (url.username || url.password) throw new NoticeFetchError("url", "주소에 아이디·비밀번호를 넣을 수 없어요");
  if (process.env.NOTICE_FETCH_ALLOW_PRIVATE === "1") return; // 로컬 테스트 전용
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new NoticeFetchError("blocked", "이 주소는 가져올 수 없어요");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new NoticeFetchError("url", "주소를 찾을 수 없어요. 링크를 다시 확인해 주세요");
  if (addrs.some((a) => isPrivate(a.address))) throw new NoticeFetchError("blocked", "이 주소는 가져올 수 없어요");
}

async function readCapped(res: Response, cap = MAX_BYTES): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(Math.min(total, cap));
  let off = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, out.length - off), off);
    off += c.byteLength;
    if (off >= out.length) break;
  }
  return out;
}

/**
 * 공고 이미지 한 장을 받는다. 페이지와 같은 보호(내부 주소 차단, 리다이렉트마다 확인)에
 * 8초, 5MB, 이미지 형식(png/jpeg/webp/gif)만.
 */
export async function fetchImage(raw: string): Promise<{ data: Buffer; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" } | undefined> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    let res: Response | undefined;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await assertPublic(url);
      res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; SupportLabBot/0.1)", Accept: "image/*" } });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      url = new URL(loc, url);
    }
    if (!res?.ok) return undefined;
    const bytes = Buffer.from(await readCapped(res, 5 * 1024 * 1024));
    const { imageType } = await import("./ocr");
    const mediaType = imageType(url.pathname, res.headers.get("content-type"), bytes.subarray(0, 16));
    return mediaType && bytes.length > 2000 ? { data: bytes, mediaType } : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNotice(raw: string): Promise<notice.ExtractedNotice & { finalUrl: string; posters: string[] }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new NoticeFetchError("url", "링크 형식이 올바르지 않아요");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res: Response | undefined;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await assertPublic(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SupportLabBot/0.1; +https://github.com/dlcofud/ku-suporters)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
        },
      });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      url = new URL(loc, url);
      if (i === MAX_REDIRECTS) throw new NoticeFetchError("http", "페이지가 너무 여러 번 다른 곳으로 넘어가요");
    }
    if (!res || !res.ok) throw new NoticeFetchError("http", `페이지를 열지 못했어요 (${res?.status ?? "응답 없음"}). 로그인이 필요한 페이지라면 본문을 붙여 넣어 주세요`);
    const ct = res.headers.get("content-type");
    if (ct && !/html|xml|text\/plain/i.test(ct)) throw new NoticeFetchError("type", "웹 페이지가 아니에요. PDF·이미지 공고라면 본문을 붙여 넣어 주세요");
    const bytes = await readCapped(res);
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    let html: string;
    try {
      html = new TextDecoder(notice.detectCharset(ct, head)).decode(bytes);
    } catch {
      html = new TextDecoder("utf-8").decode(bytes);
    }
    const ex = /text\/plain/i.test(ct ?? "") ? { title: undefined, text: html.trim(), source: "body" as const, images: [], imageOnly: false } : notice.extractNoticeFromHtml(html, url.toString());
    // 공고가 이미지로만 돼 있어도 포스터를 읽으면 되니 바로 실패하지 않는다
    const posters = /html/i.test(ct ?? "html") ? notice.pickPosterImages(html, url.toString(), 3) : [];
    if (ex.text.replace(/\s/g, "").length < 40 && posters.length === 0) throw new NoticeFetchError("empty", "페이지에서 공고 내용을 찾지 못했어요. 본문을 붙여 넣거나 공고 이미지를 올려 주세요");
    return { ...ex, finalUrl: url.toString(), posters };
  } catch (e) {
    if (e instanceof NoticeFetchError) throw e;
    if ((e as Error)?.name === "AbortError") throw new NoticeFetchError("timeout", "페이지가 너무 늦게 열려요. 잠시 후 다시 시도하거나 본문을 붙여 넣어 주세요");
    throw new NoticeFetchError("http", "페이지를 가져오지 못했어요. 본문을 붙여 넣어 주세요");
  } finally {
    clearTimeout(timer);
  }
}
