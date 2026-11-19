/**
 * 서버 전용: 지원서 양식 파일(.docx, .hwpx)을 문단·표 덩어리로 바꾼다.
 * 두 형식 모두 zip 안에 XML이 들어 있는 구조라, 따로 라이브러리 없이 zip을 풀고 XML을 훑는다.
 *  - .docx: word/document.xml   (w:p 문단, w:tbl 표, w:tr 줄, w:tc 칸, w:t 글자)
 *  - .hwpx: Contents/section*.xml (hp:p, hp:tbl, hp:tr, hp:tc, hp:t)
 * 예전 한글 형식(.hwp)과 PDF는 읽지 못한다 → 다른 형식으로 저장하거나 문항을 붙여넣게 안내한다.
 */
import { inflateRawSync } from "node:zlib";
import { extractForm, parseFormText, type FormBlock, type FormParse } from "./form.js";

export class FormReadError extends Error {}

/** zip 안의 파일 목록과 내용을 읽는다 (중앙 디렉터리 기준) */
export function readZip(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // End of Central Directory 찾기 (뒤에서부터)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new FormReadError("zip 파일이 아니에요");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new FormReadError("파일이 손상됐어요");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: 50 * 1024 * 1024 }));
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? _,
  );

/**
 * 문서 XML을 위에서부터 훑어 문단·표 덩어리로 만든다.
 * 표 안의 표는 바깥 칸의 글자로 합친다. hwpx처럼 표가 문단 안에 들어 있는 형식도 처리한다.
 */
export function xmlToBlocks(xml: string, ns: "w" | "hp"): FormBlock[] {
  const blocks: FormBlock[] = [];
  const tag = new RegExp(`<(/?)${ns}:(tbl|tr|tc|p|t|br|tab)(\\s[^>]*)?(/?)>|([^<]+)`, "g");
  let depth = 0; // 표 깊이
  let inText = false;
  let para = "";
  let cell = "";
  let row: string[] = [];
  let rows: string[][] = [];
  const flushPara = () => {
    if (depth === 0 && para.trim()) blocks.push({ kind: "p", text: para });
    para = "";
  };
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [, close, name, , selfClose, text] = m;
    if (text !== undefined) {
      if (inText) {
        const t = unescape(text);
        if (depth === 0) para += t;
        else cell += t;
      }
      continue;
    }
    if (name === "t") {
      inText = !close && !selfClose;
      continue;
    }
    if (name === "br" || name === "tab") {
      if (depth === 0) para += name === "br" ? "\n" : " ";
      else cell += name === "br" ? "\n" : " ";
      continue;
    }
    if (name === "tbl") {
      if (!close) {
        if (depth === 0) {
          flushPara();
          rows = [];
        }
        depth++;
      } else {
        depth--;
        if (depth === 0) blocks.push({ kind: "table", rows });
      }
      continue;
    }
    if (depth === 1) {
      if (name === "tr") {
        if (!close) row = [];
        else rows.push(row);
      } else if (name === "tc") {
        if (!close) cell = "";
        else row.push(cell.trim());
      } else if (name === "p" && close) cell += "\n";
    } else if (depth > 1) {
      if (name === "p" && close) cell += " ";
    } else if (name === "p") {
      if (close) flushPara();
    }
  }
  flushPara();
  return blocks;
}

export interface FormFileResult extends FormParse {
  format: "docx" | "hwpx" | "text";
}

/** 업로드한 양식 파일을 읽는다. 지원하지 않는 형식이면 FormReadError (화면에 그대로 보여 줄 문구) */
export function readFormFile(name: string, buf: Buffer): FormFileResult {
  const lower = name.toLowerCase();
  if (buf.length > 15 * 1024 * 1024) throw new FormReadError("파일이 너무 커요 (15MB까지).");
  if (lower.endsWith(".hwp")) throw new FormReadError("예전 한글 파일(.hwp)은 아직 못 읽어요. 한글에서 '다른 이름으로 저장'으로 .hwpx 나 .docx 로 바꿔 올리거나, 문항을 글로 붙여넣어 주세요.");
  if (lower.endsWith(".pdf")) throw new FormReadError("PDF 양식은 아직 못 읽어요. 문항을 복사해서 '글로 붙여넣기'에 넣어 주세요.");
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return { ...parseFormText(buf.toString("utf8")), format: "text" };
  }
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (!isZip) throw new FormReadError("읽을 수 있는 양식은 .docx(워드)와 .hwpx(한글)예요.");
  const files = readZip(buf, (n) => n === "word/document.xml" || /^Contents\/section\d+\.xml$/i.test(n));
  const docx = files.get("word/document.xml");
  if (docx) return { ...extractForm(xmlToBlocks(docx.toString("utf8"), "w")), format: "docx" };
  const sections = [...files.entries()].filter(([n]) => /section/i.test(n)).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  if (sections.length) return { ...extractForm(sections.flatMap(([, x]) => xmlToBlocks(x.toString("utf8"), "hp"))), format: "hwpx" };
  throw new FormReadError("문서 내용을 찾지 못했어요. .docx나 .hwpx 양식인지 확인해 주세요.");
}

/* ------------------------------------------------------------------ */
/* 코치에게 올리는 자료 (예전 자소서·활동 보고서·포트폴리오·캡처 등)      */
/* ------------------------------------------------------------------ */

export const MATERIAL_MAX_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp" | "image/gif"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** 문서 덩어리를 그냥 글로 (표는 칸을 ' | '로 잇는다) */
export function blocksToText(blocks: FormBlock[]): string {
  return blocks
    .map((b) => (b.kind === "p" ? b.text.trim() : b.rows.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean).join(" | ")).filter(Boolean).join("\n")))
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 자료 파일 하나를 코치가 읽을 수 있는 모양으로 바꾼다.
 *  - .txt .md .csv → 글
 *  - .docx .hwpx → 글 (zip 안의 XML에서 글자만)
 *  - .pdf → PDF 그대로 (Gemini·Claude가 직접 읽는다)
 *  - .png .jpg .webp .gif → 이미지 그대로
 * 읽지 못하는 형식이면 FormReadError (화면에 그대로 보여 줄 문구)
 */
export function readMaterialFile(name: string, buf: Buffer, contentType?: string): import("./index.js").MaterialInput {
  const lower = name.toLowerCase();
  const ext = lower.split(".").pop() ?? "";
  if (buf.length > MATERIAL_MAX_BYTES) throw new FormReadError(`'${name}'이(가) 너무 커요 (4MB까지).`);
  if (["txt", "md", "csv"].includes(ext)) return { name, kind: "text", text: buf.toString("utf8").trim() };
  if (ext === "hwp") throw new FormReadError(`'${name}': 예전 한글 파일(.hwp)은 못 읽어요. .hwpx나 .docx, PDF로 저장해서 올려 주세요.`);
  if (ext === "pdf" || contentType === "application/pdf") return { name, kind: "pdf", data: buf.toString("base64"), mediaType: "application/pdf" };
  const img = IMAGE_TYPES[ext] ?? (contentType && Object.values(IMAGE_TYPES).find((t) => t === contentType));
  if (img) return { name, kind: "image", data: buf.toString("base64"), mediaType: img };
  if (ext === "docx" || ext === "hwpx") {
    const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
    if (!isZip) throw new FormReadError(`'${name}'을(를) 열지 못했어요.`);
    const files = readZip(buf, (n) => n === "word/document.xml" || /^Contents\/section\d+\.xml$/i.test(n));
    const docx = files.get("word/document.xml");
    const text = docx
      ? blocksToText(xmlToBlocks(docx.toString("utf8"), "w"))
      : blocksToText(
          [...files.entries()]
            .filter(([n]) => /section/i.test(n))
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .flatMap(([, x]) => xmlToBlocks(x.toString("utf8"), "hp")),
        );
    if (!text) throw new FormReadError(`'${name}'에서 글자를 찾지 못했어요.`);
    return { name, kind: "text", text };
  }
  throw new FormReadError(`'${name}'은(는) 읽을 수 없는 형식이에요. 글(.txt) · 워드(.docx) · 한글(.hwpx) · PDF · 이미지를 올려 주세요.`);
}
