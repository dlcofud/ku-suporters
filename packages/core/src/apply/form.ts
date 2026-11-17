/**
 * 지원서 양식 읽기 (브라우저에서도 쓸 수 있는 순수 함수).
 *
 * 양식 파일(.docx/.hwpx)은 apply/node.ts 가 문단·표 덩어리(FormBlock)로 바꾸고,
 * 여기서 그 덩어리를 보고
 *  - 서술형 문항 (코치와 같이 쓸 것: "자기소개 (500자 이내)" 처럼 답을 글로 쓰는 칸)
 *  - 칸 채우는 항목 (직접 채울 것: 인적사항, 사용 중인 제품, SNS 계정, 활동 목록 같은 표)
 * 을 나눈다. 글로 붙여넣은 문항도 같은 규칙으로 읽는다.
 *
 * 양식의 개인정보 칸(이름, 연락처 등)은 읽지 않고, 파일도 저장하지 않는다.
 */
import { parseCharLimit } from "../skeleton/index.js";

export type FormBlock = { kind: "p"; text: string } | { kind: "table"; rows: string[][] };

export interface FormQuestion {
  text: string;
  charLimit?: number;
}

export interface FormField {
  /** "6. 교내·외 활동" 처럼 번호를 뗀 항목 이름 */
  title: string;
  /** 작성 안내 (예: "최대 5개까지 작성", 표의 열 이름) */
  detail: string;
}

export interface FormParse {
  title?: string;
  questions: FormQuestion[];
  fields: FormField[];
}

const NUM = /^\s*(?:Q\s*)?(\d{1,2})\s*[.)]\s*(.+)$/i;
/** 글로 답하는 문항이라는 신호 */
const ASK = /\?|주세요|하시오|서술|기술해|작성해|소개해|제안해|기획해|설명해|말해/;
/** 개인정보 표 신호 (읽지 않는다) */
const PRIVATE = /인적\s*사항|성명|생년월일|휴대폰|연락처|주민|개인정보|수집\s*항목/;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
/** "6. 교내·외 활동 / * 최대 5개…" → { title: "교내·외 활동", guide: "최대 5개…" } */
function splitTitle(raw: string): { num?: number; title: string; guide: string } {
  const lines = raw.split(/\n| \/ /).map(clean).filter(Boolean);
  let first = lines[0] ?? "";
  const m = first.match(NUM);
  const num = m ? Number(m[1]) : undefined;
  if (m) first = m[2]!;
  // 제목 안의 "* 안내"는 떼어 낸다
  const star = first.indexOf("*");
  const title = clean(star > 0 ? first.slice(0, star) : first).replace(/\s*\((?:복수\s*선택|필수)[^)]*\)\s*$/, "");
  const guide = [star > 0 ? first.slice(star) : "", ...lines.slice(1)].map((g) => clean(g.replace(/^\*\s*/, ""))).filter(Boolean).join(" · ");
  return { num, title, guide };
}

const uniqCells = (row: string[]) => row.map(clean).filter((c, i, a) => c && a.indexOf(c) === i);

/** 문단·표 덩어리 → 서술형 문항 + 칸 채우는 항목 */
export function extractForm(blocks: FormBlock[]): FormParse {
  const out: FormParse = { questions: [], fields: [] };
  const firstP = blocks.find((b) => b.kind === "p" && clean(b.text).length >= 4) as { text: string } | undefined;
  if (firstP && /지원서|신청서|양식/.test(firstP.text)) out.title = clean(firstP.text).slice(0, 80);

  for (const b of blocks) {
    if (b.kind === "table") {
      const rows = b.rows.map(uniqCells);
      const nonEmpty = rows.filter((r) => r.length);
      if (!nonEmpty.length) continue;
      const head = nonEmpty[0]!.join(" / ");
      if (PRIVATE.test(head) && !NUM.test(head)) continue;
      const { num, title, guide } = splitTitle(nonEmpty[0]!.join("\n"));
      const maxCols = Math.max(...b.rows.map((r) => uniqCells(r).length), 0);
      const rawCols = Math.max(...b.rows.map((r) => r.length), 0);
      const hasBlankRow = b.rows.some((r) => r.every((c) => !clean(c)));
      const prompt = nonEmpty.slice(1).map((r) => r.join(" ")).join(" ");
      const all = `${title} ${guide} ${prompt}`;
      const limit = parseCharLimit(all);
      // 서술형: 한 칸짜리 표 + (글자 수 또는 질문 말투) + 답을 쓸 빈 줄
      const essay = maxCols <= 1 && rawCols <= 2 && (limit !== undefined || ASK.test(all)) && (hasBlankRow || nonEmpty.length < b.rows.length);
      if (essay) {
        const p = clean(prompt);
        const text = p && !p.startsWith(title) ? `${title} — ${p}` : title || p;
        out.questions.push({ text: clean(text).slice(0, 400), charLimit: limit });
      } else if (num !== undefined && title) {
        const cols = nonEmpty[1] && nonEmpty[1].length > 1 ? `칸: ${nonEmpty[1].slice(0, 6).join(", ")}` : "";
        out.fields.push({ title: `${num}. ${title}`.slice(0, 80), detail: [guide, cols].filter(Boolean).join(" · ").slice(0, 200) });
      }
    } else {
      // 문단으로만 된 양식: "1. 지원 동기를 작성해 주세요 (500자)" 같은 줄
      const t = clean(b.text);
      const m = t.match(NUM);
      if (m && (parseCharLimit(t) !== undefined || ASK.test(t)) && t.length <= 300) {
        out.questions.push({ text: m[2]!, charLimit: parseCharLimit(t) });
      }
    }
  }
  return out;
}

/** 붙여넣은 글에서 문항을 읽는다 (한 줄에 하나, 번호가 없어도 질문 말투면 문항) */
export function parseFormText(text: string): FormParse {
  const blocks: FormBlock[] = text.split(/\r?\n/).map((l) => ({ kind: "p" as const, text: l }));
  const parsed = extractForm(blocks);
  if (parsed.questions.length) return parsed;
  const qs = text
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l.length >= 6 && l.length <= 300 && (ASK.test(l) || parseCharLimit(l) !== undefined))
    .map((l) => ({ text: l.replace(NUM, "$2"), charLimit: parseCharLimit(l) }));
  return { questions: qs, fields: [] };
}

/** 비교용으로 문항 글을 줄인다 (번호·글자 수·문장부호·공백 제거) */
function norm(q: string): string {
  return q
    .replace(NUM, "$2")
    .replace(/\(\s*\d{2,4}\s*자[^)]*\)/g, "")
    .replace(/[\s.,·:;!?'"“”‘’()\[\]—–-]/g, "")
    .toLowerCase();
}
function bigrams(s: string): Set<string> {
  const g = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}
/** 두 문항이 같은 문항인지 (한쪽이 다른 쪽을 품거나, 글자 두 개씩 묶은 조각이 많이 겹치면) */
export function sameQuestion(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const A = bigrams(x);
  const B = bigrams(y);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size) >= 0.6;
}

/**
 * 공고 문항과 양식 문항을 합친다.
 *  - 둘 다 있으면 같은 문항은 하나로 (글자 수가 적힌 쪽, 없으면 양식 쪽 글을 쓴다)
 *  - 한쪽에만 있으면 그대로 넣는다 (공고 순서 → 양식에만 있는 문항 순)
 */
export function mergeQuestions(noticeQs: string[], formQs: FormQuestion[]): { text: string; source: "notice" | "form" | "both" }[] {
  const out: { text: string; source: "notice" | "form" | "both" }[] = noticeQs.map((t) => ({ text: t, source: "notice" }));
  for (const f of formQs) {
    const hit = out.find((o) => sameQuestion(o.text, f.text));
    const fText = f.charLimit && parseCharLimit(f.text) === undefined ? `${f.text} (${f.charLimit}자)` : f.text;
    if (hit) {
      const keepNotice = parseCharLimit(hit.text) !== undefined && f.charLimit === undefined;
      if (!keepNotice) hit.text = fText;
      hit.source = "both";
    } else out.push({ text: fText, source: "form" });
  }
  return out;
}
