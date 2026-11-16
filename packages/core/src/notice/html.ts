/**
 * 공고 웹 페이지(HTML) → 분석용 텍스트.
 *
 * 사용자가 붙여넣은 링크 한 페이지만 읽는다 (사이트 전체를 돌아다니지 않는다).
 * 뽑은 텍스트는 분석에만 쓰고 저장하지 않는다 — 저장하는 것은 분석 결과와 출처 링크뿐.
 *
 * 공고 본문이 어디 있는지는 사이트마다 달라서 여러 후보를 모아 "공고다운" 정도로 고른다.
 *  1) 구조화 데이터 (JSON-LD JobPosting / Event 의 description)
 *  2) Next.js 등 앱이 페이지에 심어 둔 데이터 (__NEXT_DATA__ 등 JSON 안의 긴 글)
 *  3) <article>, <main>, 본문처럼 보이는 영역
 *  4) 페이지 전체 (메뉴·푸터 제거)
 * 이 파일은 Node 전용 API를 쓰지 않는다.
 */

export interface ExtractedNotice {
  title?: string;
  text: string;
  /** 어느 후보에서 뽑았는지 (디버깅·안내용) */
  source: "jsonld" | "embedded" | "article" | "body";
  /** 본문 영역의 이미지 주소. 글이 거의 없고 포스터 이미지뿐인 공고를 알아보는 데 쓴다 */
  images: string[];
  /** 글이 너무 적어 이미지 공고로 보이면 true */
  imageOnly: boolean;
}

const NOTICE_WORDS = ["모집", "지원", "마감", "접수", "서포터즈", "기자단", "대외활동", "혜택", "우대", "자격", "기간", "발표", "활동", "선발", "문항", "제출"];

/** 텍스트가 공고 본문일 가능성 점수 */
export function noticeScore(text: string): number {
  const hits = NOTICE_WORDS.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  const dates = (text.match(/\d{1,2}\s*[./월]\s*\d{1,2}/g) ?? []).length;
  const len = Math.min(text.length, 6000) / 6000;
  return hits * 3 + Math.min(dates, 8) * 2 + len * 6;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…", rarr: "→", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML 조각 → 줄 구분이 살아 있는 텍스트 */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<(td|th)\b[^>]*>/gi, " ")
    .replace(/<\/(p|div|section|article|ul|ol|tr|table|h[1-6]|header|footer|blockquote|dd|dt|dl|figure|figcaption|pre)>/gi, "\n")
    .replace(/<(p|div|section|article|tr|h[1-6]|blockquote|dd|dt|figure|pre)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ​]+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : undefined;
}

function metaContent(html: string, key: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const k = attr(tag, "property") ?? attr(tag, "name");
    if (k && k.toLowerCase() === key) return attr(tag, "content");
  }
  return undefined;
}

/** JSON 안의 문자열을 모두 훑는다 (깊이 제한) */
function* strings(v: unknown, depth = 0): Generator<string> {
  if (depth > 40) return;
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x, depth + 1);
  else if (v && typeof v === "object") for (const x of Object.values(v)) yield* strings(x, depth + 1);
}

function jsonLdCandidates(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]!.trim());
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const it of items) if (it && typeof it.description === "string") out.push(htmlToText(it.description));
    } catch {
      /* 잘못된 JSON은 건너뛴다 */
    }
  }
  return out;
}

function embeddedCandidates(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? "";
    const body = (m[2] ?? "").trim();
    if (!/application\/json/i.test(attrs) && !/id\s*=\s*["']__NEXT_DATA__["']/i.test(attrs)) continue;
    if (body.length < 200) continue;
    try {
      for (const s of strings(JSON.parse(body))) {
        if (s.length < 150) continue;
        const text = /<[a-z][\s\S]*>/i.test(s) ? htmlToText(s) : s.replace(/\r\n/g, "\n").trim();
        if (noticeScore(text) >= 10) out.push(text);
      }
    } catch {
      /* JSON이 아니면 건너뛴다 */
    }
  }
  return out;
}

const BOILERPLATE = /<(nav|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi;

function regionCandidates(html: string): { article: string[]; body: string } {
  const article: string[] = [];
  const cleaned = html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  for (const m of cleaned.matchAll(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/gi)) article.push(htmlToText(m[2]!.replace(BOILERPLATE, " ")));
  // 흔한 본문 영역 이름 (게시판·채용 사이트)
  for (const m of cleaned.matchAll(/<(div|section)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(content|detail|view|post|article|board|description|recruit|notice)[^"']*["'][^>]*>/gi)) {
    const start = m.index! + m[0].length;
    article.push(htmlToText(sliceBalanced(cleaned, start, m[1]!).replace(BOILERPLATE, " ")));
  }
  const bodyHtml = cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? cleaned;
  return { article, body: htmlToText(bodyHtml.replace(BOILERPLATE, " ").replace(/<header\b[\s\S]*?<\/header>/gi, " ")) };
}

/** 같은 태그의 짝이 맞는 곳까지 잘라낸다 (중첩 고려, 실패하면 적당히 자름) */
function sliceBalanced(html: string, start: number, tag: string): string {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start, start + 200_000);
}

function imagesIn(html: string, baseUrl?: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(m[0], "data-src") ?? attr(m[0], "src");
    if (!src || src.startsWith("data:")) continue;
    try {
      out.push(baseUrl ? new URL(src, baseUrl).toString() : src);
    } catch {
      /* 잘못된 주소 */
    }
  }
  return [...new Set(out)].slice(0, 20);
}

/** 공고 페이지 HTML에서 제목과 본문을 뽑는다 */
export function extractNoticeFromHtml(html: string, baseUrl?: string): ExtractedNotice {
  const rawTitle = metaContent(html, "og:title") ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim() || undefined : undefined;

  const { article, body } = regionCandidates(html);
  const candidates: { text: string; source: ExtractedNotice["source"] }[] = [
    ...jsonLdCandidates(html).map((text) => ({ text, source: "jsonld" as const })),
    ...embeddedCandidates(html).map((text) => ({ text, source: "embedded" as const })),
    ...article.map((text) => ({ text, source: "article" as const })),
    { text: body, source: "body" as const },
  ].filter((c) => c.text.trim().length > 0);

  // 공고다운 정도가 가장 높은 것. 점수가 비슷하면(2점 이내) 더 좁은 영역(앞쪽 후보)을 고른다.
  let best = candidates[0] ?? { text: "", source: "body" as const };
  let bestScore = best ? noticeScore(best.text) : 0;
  for (const c of candidates.slice(1)) {
    const sc = noticeScore(c.text);
    if (sc > bestScore + 2) {
      best = c;
      bestScore = sc;
    }
  }
  const desc = metaContent(html, "og:description") ?? metaContent(html, "description");
  let text = best.text;
  if (desc && text.length < 200 && !text.includes(desc)) text = `${decodeEntities(desc)}\n\n${text}`.trim();
  text = text.slice(0, 20_000);

  const images = imagesIn(html, baseUrl);
  const imageOnly = text.replace(/\s/g, "").length < 120 && images.length > 0;
  return { title, text, source: best.source, images, imageOnly };
}

/** 응답 헤더·meta에서 문자 인코딩을 찾는다 (한국 사이트는 EUC-KR이 아직 많다) */
export function detectCharset(contentType: string | null | undefined, headBytesAsLatin1: string): string {
  const fromHeader = contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const fromMeta = headBytesAsLatin1.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const cs = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  if (cs === "ks_c_5601-1987" || cs === "euckr" || cs === "cp949" || cs === "x-windows-949") return "euc-kr";
  return cs;
}
