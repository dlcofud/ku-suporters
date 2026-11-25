import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkSheet, csvToTable, diffSheets, tableToCsv, parseCuratedCsv } from "../src/trends/index.js";

const repoCsv = readFileSync(new URL("../../../data/curated.csv", import.meta.url), "utf8");

describe("수집 시트 검사", () => {
  const base = csvToTable(repoCsv);

  it("저장소 시트는 오류 없이 통과하고, CSV로 다시 써도 같다", () => {
    const c = checkSheet(base);
    expect(c.errors).toEqual([]);
    expect(c.rows.length).toBe(base.rows.filter((r) => r.some((x) => x.trim())).length);
    expect(parseCuratedCsv(tableToCsv(c)).length).toBe(parseCuratedCsv(repoCsv).length);
  });

  it("BOM이 붙은 엑셀 CSV도 읽는다", () => {
    expect(csvToTable("﻿" + repoCsv).header[0]).toBe("ID");
  });

  it("필수 열이 없거나, 같은 URL·ID, 0~2가 아닌 점수는 오류", () => {
    expect(checkSheet({ header: ["ID", "URL"], rows: [] }).errors[0]).toContain("꼭 필요한 열");
    const h = base.header;
    const i = (n: string) => h.indexOf(n);
    const r1 = [...base.rows[0]!];
    const r2 = [...base.rows[1]!];
    r2[i("URL")] = r1[i("URL")]!;
    r2[i("E3 툴 활용")] = "3";
    const r3 = [...base.rows[2]!];
    r3[i("ID")] = "";
    const c = checkSheet({ header: h, rows: [r1, r2, r3] });
    expect(c.errors.some((e) => e.includes("3행") && e.includes("URL이 2행과 같아요"))).toBe(true);
    expect(c.errors.some((e) => e.includes("0·1·2 또는 빈칸"))).toBe(true);
    expect(c.errors.some((e) => e.includes("4행: ID가 비었어요"))).toBe(true);
  });

  it("비어 있는 자동 칸을 채우고, 긴 글과 모르는 검수 상태는 경고", () => {
    const h = base.header;
    const r = [...base.rows[0]!];
    r[h.indexOf("출처 표기 (자동)")] = "";
    r[h.indexOf("총점 (자동, 16점)")] = "";
    r[h.indexOf("핵심 팁 (내 말로, 2문장 이내)")] = "가".repeat(301);
    r[h.indexOf("검수 상태")] = "대충 봄";
    const c = checkSheet({ header: h, rows: [r] });
    expect(c.rows[0]![h.indexOf("출처 표기 (자동)")]).toContain("링커리어 커뮤니티, 「");
    expect(c.rows[0]![h.indexOf("총점 (자동, 16점)")]).toBe("13");
    expect(c.warnings.length).toBe(2);
  });
});

describe("시트 비교", () => {
  it("URL 기준으로 추가·변경·삭제를 센다 (자동 칸은 보지 않음)", () => {
    const a = csvToTable(repoCsv);
    const h = a.header;
    const b = { header: h, rows: a.rows.slice(1).map((r) => [...r]) };
    b.rows[0]![h.indexOf("E1 SNS 운영 성과")] = "0";
    b.rows[0]![h.indexOf("총점 (자동, 16점)")] = "99";
    const extra = [...a.rows[0]!];
    extra[h.indexOf("URL")] = "https://example.com/new";
    extra[h.indexOf("ID")] = "L-999";
    b.rows.push(extra);
    const d = diffSheets(a, b);
    expect(d.added).toHaveLength(1);
    expect(d.removed).toHaveLength(1);
    expect(d.changed).toEqual([{ id: expect.stringContaining("L-002"), columns: ["E1 SNS 운영 성과"] }]);
    expect(d.unchanged).toBe(a.rows.length - 2);
  });
});
