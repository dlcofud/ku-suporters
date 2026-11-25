import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readXlsxTable, writeXlsxTable } from "./xlsx";
import { trends } from "@supportlab/core";
import { files, repo } from "./repo";

/**
 * 관리자 '엑셀 관리'.
 * 올린 시트는 저장소(data/curated.csv)를 고치지 않고 파일 저장소에 버전으로 쌓는다.
 *   sheet/meta.json            { active: 지금 쓰는 버전 키 | null, history: [...] }
 *   sheet/v/<시각>.csv          올린 버전 (CSV)
 *   sheet/pending/<사용자>.csv   미리보기 중인 업로드
 * active가 없으면(처음이거나 '저장소 기본으로') 저장소 data/curated.csv 를 쓴다.
 */

export interface SheetVersion {
  key: string;
  at: string;
  by: string;
  rows: number;
  note: string;
  /** 코드북 판. 없으면 1판(점수 0 = 언급 없음)으로 올린 시트라 읽을 때 0을 빈칸으로 바꾼다 */
  codebook?: number;
}
interface SheetMeta {
  active: string | null;
  history: SheetVersion[];
}

const META = "sheet/meta.json";
const MAX_HISTORY = 30;

export async function sheetMeta(): Promise<SheetMeta> {
  const b = await files.read(META).catch(() => undefined);
  if (!b) return { active: null, history: [] };
  try {
    return JSON.parse(b.toString("utf8")) as SheetMeta;
  } catch {
    return { active: null, history: [] };
  }
}

async function saveMeta(m: SheetMeta) {
  await files.put(META, Buffer.from(JSON.stringify(m, null, 1)), "application/json");
}

/** 저장소에 들어 있는 기본 시트 (data/curated.csv) */
export async function repoCsv(): Promise<string> {
  const path = [join(process.cwd(), "..", "..", "data", "curated.csv"), join(process.cwd(), "data", "curated.csv")].find(existsSync);
  return path ? readFile(path, "utf8") : "";
}

/** 코드북 1판으로 올린 시트(0점 = 언급 없음)는 0을 빈칸(언급 없음)으로 읽는다. 저장된 파일은 그대로 둔다 */
function upgradeCsv(csv: string, v: SheetVersion | undefined): string {
  return (v?.codebook ?? 1) >= trends.CODEBOOK_VERSION ? csv : trends.blankLegacyZeros(csv);
}

/** 지금 앱이 쓰는 시트 CSV: 올린 버전이 있으면 그것, 없으면 저장소 기본 */
export async function activeCsv(): Promise<{ csv: string; source: "upload" | "repo"; version?: SheetVersion }> {
  const m = await sheetMeta();
  if (m.active) {
    const b = await files.read(m.active).catch(() => undefined);
    if (b) {
      const version = m.history.find((h) => h.key === m.active);
      return { csv: upgradeCsv(b.toString("utf8"), version), source: "upload", version };
    }
  }
  return { csv: await repoCsv(), source: "repo" };
}

export async function savePending(userId: string, csv: string) {
  await files.put(`sheet/pending/${userId}.csv`, Buffer.from(csv, "utf8"), "text/csv");
}
export async function readPending(userId: string): Promise<string | undefined> {
  return (await files.read(`sheet/pending/${userId}.csv`).catch(() => undefined))?.toString("utf8");
}

/** 새 버전으로 저장하고 바로 쓴다 */
export async function publishSheet(csv: string, by: string, note: string): Promise<SheetVersion> {
  const at = new Date().toISOString();
  const key = `sheet/v/${at.replace(/[:.]/g, "-")}.csv`;
  await files.put(key, Buffer.from(csv, "utf8"), "text/csv");
  const m = await sheetMeta();
  const v: SheetVersion = { key, at, by, rows: trends.csvToTable(csv).rows.length, note, codebook: trends.CODEBOOK_VERSION };
  await saveMeta({ active: key, history: [v, ...m.history].slice(0, MAX_HISTORY) });
  return v;
}

/** 예전 버전으로 되돌리기 (null이면 저장소 기본으로) */
export async function activate(key: string | null) {
  const m = await sheetMeta();
  if (key && !m.history.some((h) => h.key === key)) throw new Error("그 버전을 찾지 못했어요");
  await saveMeta({ ...m, active: key });
}

/** 버전 하나의 CSV */
export async function versionCsv(key: string): Promise<string | undefined> {
  const m = await sheetMeta();
  const v = m.history.find((h) => h.key === key);
  if (!v) return undefined;
  const b = await files.read(key).catch(() => undefined);
  return b && upgradeCsv(b.toString("utf8"), v);
}

/**
 * 내려받기용 전체 시트: 지금 시트 + 앱에서 검수한 점수 반영 + 앱에서만 코딩한 후기(승인된 것) 덧붙이기.
 * 이걸 받아 고쳐서 다시 올리면 모든 후기가 한 파일에 모인다.
 */
export async function fullTable(): Promise<trends.SheetTable> {
  const t = trends.csvToTable((await activeCsv()).csv);
  if (!t.header.length) t.header = [...trends.SHEET_HEADERS];
  const coded = (await repo.listCodedReviews().catch(() => [])).filter((r) => !r.pendingApproval);
  if (!coded.length) return t;
  const extra = trends.csvToTable(trends.toSheetCsv(coded, () => "팀원"));
  const at = (h: string) => t.header.indexOf(h);
  const byUrl = new Map(t.rows.map((r) => [r[at("URL")] ?? "", r]));
  for (const er of extra.rows) {
    const get = (h: string) => er[extra.header.indexOf(h)] ?? "";
    const row = byUrl.get(get("URL"));
    const verified = get("검수 상태") === "검수 완료";
    if (row) {
      // 시트에 있는 후기: 앱에서 검수 완료한 경우에만 점수·검수 상태를 앱 값으로
      if (verified) for (const h of [...trends.SHEET_HEADERS].filter((x) => /^E\d |검수 상태|총점/.test(x))) if (at(h) >= 0) row[at(h)] = get(h);
      continue;
    }
    t.rows.push(t.header.map((h) => get(h)));
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* 엑셀 읽기·쓰기 (lib/xlsx.ts)                                         */
/* ------------------------------------------------------------------ */

export async function xlsxToTable(buf: Buffer): Promise<trends.SheetTable> {
  return readXlsxTable(buf);
}

function templatePath() {
  return [join(process.cwd(), "..", "..", "data", "수집시트.xlsx"), join(process.cwd(), "data", "수집시트.xlsx")].find(existsSync);
}

/** 수집시트.xlsx 틀(작성 방법·코드북 탭, 목록 선택, 수식)에 지금 데이터를 채워 내려준다 */
export async function tableToXlsx(t: trends.SheetTable): Promise<Buffer> {
  const tpl = templatePath();
  if (!tpl) throw new Error("수집시트.xlsx 틀을 찾지 못했어요");
  return writeXlsxTable(await readFile(tpl), t);
}
