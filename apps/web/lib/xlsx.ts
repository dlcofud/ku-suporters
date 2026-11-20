import { deflateRawSync } from "node:zlib";
import { readZip } from "@supportlab/core/apply/node";
import type { trends } from "@supportlab/core";

/**
 * 수집 시트용 아주 작은 엑셀(.xlsx) 읽기·쓰기.
 * 엑셀 라이브러리는 우리 틀(메모·목록 선택·수식)을 읽다가 깨지는 경우가 있어서,
 * zip 안의 XML을 직접 다룬다. 시트 하나의 <sheetData>만 바꾸고 나머지(서식·목록 선택·메모·다른 탭)는 그대로 둔다.
 */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unesc = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m,
  );
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colIndex = (ref: string) => {
  const letters = ref.match(/^[A-Z]+/)![0];
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** <t> 글자만 모은다 (읽는 법 표시 <rPh>는 뺀다) */
const textOf = (xml: string) =>
  unesc(
    xml
      .replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")
      .match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)
      ?.map((t) => t.replace(/^<t[^>]*>|<\/t>$/g, ""))
      .join("") ?? "",
  );

/** 엑셀이 날짜로 바꿔 버린 칸(일련번호)을 YYYY-MM-DD로 */
const DATE_COLS = /수집일|확인일|게시일/;
const serialToDate = (n: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400_000).toISOString().slice(0, 10);

function sheetPath(files: Map<string, Buffer>, want: (name: string) => boolean): string | undefined {
  const wb = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unesc(m[0].match(/name="([^"]*)"/)?.[1] ?? ""), rid: m[0].match(/r:id="([^"]*)"/)?.[1] ?? "" }));
  const target = (rid: string) => {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
    const t = rel?.match(/Target="([^"]*)"/)?.[1];
    if (!t) return undefined;
    return t.startsWith("/") ? t.slice(1) : `xl/${t}`;
  };
  const pick = sheets.find((s) => want(s.name)) ?? sheets.find((s) => {
    const p = target(s.rid);
    return p && /<t[^>]*>URL<\/t>/.test(files.get(p)?.toString("utf8") ?? "");
  });
  return pick ? target(pick.rid) : undefined;
}

/** 올린 엑셀의 '수집' 탭(없으면 URL 머리글이 있는 탭)을 표로 */
export function readXlsxTable(buf: Buffer, sheetName = "수집"): trends.SheetTable {
  const files = readZip(buf, (n) => n.startsWith("xl/") && n.endsWith(".xml") || n.endsWith(".rels"));
  const path = sheetPath(files, (n) => n === sheetName);
  if (!path) return { header: [], rows: [] };
  const shared = [...(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
  const xml = files.get(path)!.toString("utf8");
  const grid: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(rm[1]!.match(/r="(\d+)"/)?.[1] ?? grid.length + 1) - 1;
    const row: string[] = [];
    let auto = 0;
    for (const cm of rm[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const ref = attrs.match(/r="([A-Z]+)\d*"/)?.[1];
      const ci = ref ? colIndex(ref) : auto;
      auto = ci + 1;
      const type = attrs.match(/t="([^"]*)"/)?.[1];
      const inner = cm[2] ?? "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = textOf(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (type === "b") val = v === "1" ? "TRUE" : v === undefined ? "" : "FALSE";
      else if (type === "e") val = "";
      else val = v === undefined ? "" : unesc(v);
      row[ci] = val;
    }
    grid[r] = row;
  }
  const header = (grid[0] ?? []).map((h) => (h ?? "").trim());
  const rows = grid.slice(1).filter(Boolean).map((r) =>
    header.map((h, i) => {
      const v = r[i] ?? "";
      return DATE_COLS.test(h) && /^\d{5}(\.\d+)?$/.test(v) ? serialToDate(Number(v)) : v;
    }),
  );
  return { header, rows };
}

/* ------------------------------------------------------------------ */
/* 쓰기                                                                 */
/* ------------------------------------------------------------------ */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 파일 목록 → zip (deflate) */
export function writeZip(entries: [string, Buffer][]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let off = 0;
  for (const [name, data] of entries) {
    const nameB = Buffer.from(name, "utf8");
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 이름
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 10);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(off, 42);
    centrals.push(ch, nameB);
    off += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** 모든 zip 항목 이름 (순서 유지) */
function zipNames(buf: Buffer): string[] {
  const names: string[] = [];
  readZip(buf, (n) => {
    names.push(n);
    return false;
  });
  return names;
}

interface CellTpl {
  style?: string;
  formula?: string;
}
function rowTemplate(xml: string, n: number): Map<number, CellTpl> {
  const m = xml.match(new RegExp(`<row\\b[^>]*\\br="${n}"[^>]*>([\\s\\S]*?)</row>`));
  const out = new Map<number, CellTpl>();
  if (!m) return out;
  for (const cm of m[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = cm[1]!.match(/r="([A-Z]+)\d+"/)?.[1];
    if (!ref) continue;
    const f = cm[2]?.match(/<f>([\s\S]*?)<\/f>/)?.[1];
    out.set(colIndex(ref), { style: cm[1]!.match(/s="(\d+)"/)?.[1], formula: f ? unesc(f) : undefined });
  }
  return out;
}

/** 수식 안의 '같은 행' 참조(G2, U2:AB2)를 n행으로. $G$2 같은 고정 참조는 그대로 */
const moveFormula = (f: string, from: number, to: number) => f.replace(new RegExp(`(?<![$A-Z])([A-Z]{1,3})${from}(?!\\d)`, "g"), `$1${to}`);

/**
 * 틀(수집시트.xlsx)의 '수집' 탭에 표를 채운다.
 *  - 1행(머리글)과 열 너비·틀 고정·목록 선택·메모·다른 탭은 그대로
 *  - 자동 칸은 틀의 수식을 행마다 옮겨 쓰고, 계산 결과도 넣어 둔다 (열자마자 보이게)
 *  - 데이터 아래로 빈 입력 줄을 넉넉히 둔다
 */
export function writeXlsxTable(template: Buffer, t: trends.SheetTable, sheetName = "수집"): Buffer {
  const names = zipNames(template);
  const files = readZip(template, () => true);
  const path = sheetPath(files, (n) => n === sheetName);
  if (!path) throw new Error("틀에서 '수집' 탭을 찾지 못했어요");
  let xml = files.get(path)!.toString("utf8");
  const head = xml.match(/<row\b[^>]*\br="1"[^>]*>[\s\S]*?<\/row>/)?.[0] ?? "";
  const tplHeader = readXlsxTable(template, sheetName).header;
  const header = tplHeader.length ? tplHeader : t.header;
  const lastTplRow = Math.max(...[...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)].map((m) => Number(m[1])), 2);
  const dataTpl = rowTemplate(xml, 3).size ? rowTemplate(xml, 3) : rowTemplate(xml, 2);
  const emptyTpl = rowTemplate(xml, lastTplRow);
  const formulaTpl = rowTemplate(xml, 2);
  const at = (h: string) => t.header.indexOf(h);
  const total = Math.max(lastTplRow, t.rows.length + 1 + 50);
  const out: string[] = [head];
  for (let n = 2; n <= total; n++) {
    const r = t.rows[n - 2];
    const tpl = r ? dataTpl : emptyTpl;
    const cells: string[] = [];
    header.forEach((h, i) => {
      const ref = `${colName(i)}${n}`;
      const s = tpl.get(i)?.style ?? emptyTpl.get(i)?.style;
      const sa = s ? ` s="${s}"` : "";
      const v = r && at(h) >= 0 ? r[at(h)] ?? "" : "";
      const f = formulaTpl.get(i)?.formula;
      if (f && h.includes("(자동")) {
        const num = /^-?\d+(\.\d+)?$/.test(v);
        cells.push(`<c r="${ref}"${sa}${num ? "" : ' t="str"'}><f>${esc(moveFormula(f, 2, n))}</f><v>${esc(v)}</v></c>`);
      } else if (v === "") {
        cells.push(`<c r="${ref}"${sa}/>`);
      } else if (/^E\d /.test(h) && /^\d+$/.test(v)) {
        cells.push(`<c r="${ref}"${sa}><v>${v}</v></c>`);
      } else {
        cells.push(`<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
      }
    });
    out.push(`<row r="${n}">${cells.join("")}</row>`);
  }
  const lastCol = colName(header.length - 1);
  xml = xml
    .replace(/<sheetData>[\s\S]*<\/sheetData>|<sheetData\/>/, `<sheetData>${out.join("")}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${lastCol}${total}"/>`)
    .replace(/<autoFilter ref="[^"]*"/, `<autoFilter ref="A1:${lastCol}${total}"`);
  files.set(path, Buffer.from(xml, "utf8"));
  // 계산 순서 파일은 수식 위치가 바뀌면 틀려지니 빼고, 열 때 다시 계산하게 한다
  let wb = files.get("xl/workbook.xml")!.toString("utf8");
  wb = wb.replace(/(<definedName[^>]*_FilterDatabase[^>]*>[^<]*!\$A\$1:\$)[A-Z]+\$\d+/, `$1${lastCol}$$${total}`);
  wb = /<calcPr\b/.test(wb) ? wb.replace(/<calcPr\b([^>]*?)\/>/, (m, a: string) => (a.includes("fullCalcOnLoad") ? m : `<calcPr${a} fullCalcOnLoad="1"/>`)) : wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
  files.set("xl/workbook.xml", Buffer.from(wb, "utf8"));
  const drop = new Set(["xl/calcChain.xml"]);
  if (files.has("xl/calcChain.xml")) {
    const ct = files.get("[Content_Types].xml")!.toString("utf8").replace(/<Override[^>]*calcChain[^>]*\/>/, "");
    files.set("[Content_Types].xml", Buffer.from(ct, "utf8"));
    const rels = files.get("xl/_rels/workbook.xml.rels")!.toString("utf8").replace(/<Relationship[^>]*calcChain[^>]*\/>/, "");
    files.set("xl/_rels/workbook.xml.rels", Buffer.from(rels, "utf8"));
  }
  return writeZip(names.filter((n) => !drop.has(n)).map((n) => [n, files.get(n)!]));
}
