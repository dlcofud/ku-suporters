/**
 * 수집 시트를 통째로 다루기 (관리자 '엑셀 관리' 화면).
 *  - 엑셀(.xlsx)이나 CSV로 올린 시트를 표(문자열 2차원 배열)로 받아 검사한다.
 *  - 지금 시트와 비교해 추가·변경·삭제를 미리 보여 준다.
 *  - 저장은 CSV 글로 한다 (앱이 읽는 형식 그대로).
 * 엑셀 파일을 읽고 쓰는 일은 web 쪽(exceljs)에서 하고, 여기서는 표만 다룬다.
 */
import { parseCsv } from "./index.js";

/** 앱이 읽는 데 꼭 필요한 열 */
export const REQUIRED_HEADERS = [
  "ID",
  "URL",
  "주최사",
  "활동명·기수",
  "분야",
  "결과 단계",
  "E1 SNS 운영 성과",
  "E2 사전 제작 콘텐츠",
  "E3 툴 활용",
  "E4 분야 연결 경험",
  "E5 브랜드 이해",
  "E6 기획안 구체성",
  "E7 협업 경험",
  "E8 진정성·스토리",
  "검수 상태",
] as const;

const SCORE_HEADERS = REQUIRED_HEADERS.filter((h) => /^E\d /.test(h));
const REVIEW_STATES = ["원문 재확인 필요", "검수 완료", "AI 초안"];

export interface SheetTable {
  header: string[];
  rows: string[][];
}

export interface SheetCheck extends SheetTable {
  errors: string[];
  warnings: string[];
}

const cell = (t: SheetTable, r: string[], name: string) => {
  const i = t.header.indexOf(name);
  return i >= 0 ? (r[i] ?? "").trim() : "";
};

/** CSV 글 → 표 (BOM·빈 줄 정리) */
export function csvToTable(csv: string): SheetTable {
  const [header = [], ...rows] = parseCsv(csv.replace(/^﻿/, ""));
  return { header: header.map((h) => h.trim()), rows };
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** 표 → CSV 글 (저장소 파일처럼 CRLF) */
export function tableToCsv(t: SheetTable): string {
  return [t.header, ...t.rows].map((r) => t.header.map((_, i) => csvCell(r[i] ?? "")).join(",")).join("\r\n") + "\r\n";
}

/**
 * 올린 시트를 검사하고 다듬는다.
 *  - 오류(저장 안 함): 꼭 필요한 열이 없음, ID·URL이 비었음, 같은 URL·ID가 두 번, 점수가 0·1·2·빈칸이 아님
 *    점수 빈칸(또는 '-', '—', '언급 없음') = 언급 없음 → 평균에서 뺀다. 0 = 언급은 있지만 내용 없음
 *  - 경고(저장은 함): 검수 상태가 목록에 없음, 원문 같은 긴 글
 *  - 비어 있는 자동 칸(출처 표기·중복 체크·총점)은 채운다. 엑셀이 다시 계산하지 않고 저장한 파일도 있어서.
 */
export function checkSheet(input: SheetTable): SheetCheck {
  const header = input.header.map((h) => h.trim());
  const t: SheetTable = { header, rows: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    errors.push(`꼭 필요한 열이 없어요: ${missing.join(", ")}. '수집' 탭을 그대로 올렸는지 확인해 주세요.`);
    return { ...t, errors, warnings };
  }
  const seenUrl = new Map<string, number>();
  const seenId = new Map<string, number>();
  input.rows.forEach((raw, k) => {
    const r = header.map((_, i) => String(raw[i] ?? "").trim());
    const line = k + 2; // 엑셀 행 번호 (1행은 머리글)
    const id = cell(t, r, "ID");
    const url = cell(t, r, "URL");
    if (!id && !url) return; // 빈 줄
    if (!url) return void errors.push(`${line}행 (${id}): URL이 비었어요.`);
    if (!id) return void errors.push(`${line}행: ID가 비었어요 (예: L-043).`);
    if (seenUrl.has(url)) errors.push(`${line}행 (${id}): URL이 ${seenUrl.get(url)}행과 같아요. 같은 후기를 두 번 넣었는지 확인해 주세요.`);
    else seenUrl.set(url, line);
    if (seenId.has(id)) errors.push(`${line}행: ID ${id}가 ${seenId.get(id)}행과 같아요.`);
    else seenId.set(id, line);
    for (const h of SCORE_HEADERS) {
      const i = header.indexOf(h);
      if (/^(-|—|언급\s*없음)$/.test(r[i] ?? "")) r[i] = ""; // 언급 없음은 빈칸으로
      const v = cell(t, r, h);
      if (v !== "" && !["0", "1", "2"].includes(v)) errors.push(`${line}행 (${id}): '${h}' 점수는 0·1·2 또는 빈칸(언급 없음)만 돼요 (지금 '${v}').`);
    }
    const st = cell(t, r, "검수 상태");
    if (st && !REVIEW_STATES.includes(st)) warnings.push(`${line}행 (${id}): 검수 상태 '${st}'는 목록에 없어요. '원문 재확인 필요'나 '검수 완료'로 써 주세요.`);
    const long = header.find((h) => /팁|요약/.test(h) && cell(t, r, h).length > 300);
    if (long) warnings.push(`${line}행 (${id}): '${long}'이 300자를 넘어요. 원문을 붙여넣지 말고 내 말로 2문장 이내로 줄여 주세요.`);
    fillAuto(t, r);
    t.rows.push(r);
  });
  // 중복 체크 칸은 다 모은 뒤 다시 채운다
  const di = header.indexOf("중복 체크 (자동)");
  if (di >= 0) {
    const count = new Map<string, number>();
    for (const r of t.rows) count.set(cell(t, r, "URL"), (count.get(cell(t, r, "URL")) ?? 0) + 1);
    for (const r of t.rows) r[di] = (count.get(cell(t, r, "URL")) ?? 0) > 1 ? "중복" : "OK";
  }
  if (!t.rows.length && !errors.length) errors.push("후기 행이 하나도 없어요. '수집' 탭을 올렸는지 확인해 주세요.");
  return { ...t, errors, warnings };
}

/** 출처 표기·총점이 비었으면 엑셀 수식과 같은 규칙으로 채운다 */
function fillAuto(t: SheetTable, r: string[]) {
  const ci = t.header.indexOf("출처 표기 (자동)");
  if (ci >= 0 && !r[ci]) {
    const posted = cell(t, r, "게시일");
    const checked = cell(t, r, "확인일").replace(/-/g, ".");
    r[ci] = `${cell(t, r, "플랫폼/사이트명")}, 「${cell(t, r, "게시물 제목")}」, ${!posted || posted === "확인 필요" ? "게시일 미상" : posted}, ${cell(t, r, "URL")} (확인일 ${checked})`;
  }
  const ti = t.header.indexOf("총점 (자동, 16점)");
  if (ti >= 0 && !r[ti]) r[ti] = String(SCORE_HEADERS.reduce((s, h) => s + (Number(cell(t, r, h)) || 0), 0));
}

export interface SheetDiff {
  added: string[];
  removed: string[];
  changed: { id: string; columns: string[] }[];
  unchanged: number;
}

/** 두 시트를 URL 기준으로 비교한다 (자동 칸은 비교하지 않는다) */
export function diffSheets(before: SheetTable, after: SheetTable): SheetDiff {
  const key = (t: SheetTable, r: string[]) => cell(t, r, "URL");
  const label = (t: SheetTable, r: string[]) => `${cell(t, r, "ID")} ${cell(t, r, "주최사")} ${cell(t, r, "활동명·기수")}`.trim();
  const old = new Map(before.rows.map((r) => [key(before, r), r]));
  const now = new Map(after.rows.map((r) => [key(after, r), r]));
  const cols = after.header.filter((h) => !h.includes("(자동"));
  const out: SheetDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const [u, r] of now) {
    const o = old.get(u);
    if (!o) {
      out.added.push(label(after, r));
      continue;
    }
    const columns = cols.filter((h) => cell(after, r, h) !== cell(before, o, h));
    if (columns.length) out.changed.push({ id: label(after, r), columns });
    else out.unchanged++;
  }
  for (const [u, r] of old) if (!now.has(u)) out.removed.push(label(before, r));
  return out;
}

/** 지운 행이 이만큼(비율) 넘으면 한 번 더 확인받는다 */
export const BIG_REMOVAL = 0.2;

