import { trends } from "@supportlab/core";
import { currentUser, rolesOf } from "@/lib/session";
import { fullTable, tableToXlsx, versionCsv } from "@/lib/sheet";

export const dynamic = "force-dynamic";

/**
 * 수집 시트 내려받기 (팀·관리자).
 *  ?format=xlsx|csv  (기본 xlsx: 작성 방법·코드북 탭과 목록 선택이 있는 틀)
 *  ?version=<키>     예전 버전 (없으면 지금 데이터 전체: 시트 + 앱에서 검수·코딩한 후기)
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !rolesOf(user).includes("team")) return new Response("팀원만 받을 수 있어요", { status: 403 });
  const q = new URL(req.url).searchParams;
  const version = q.get("version");
  let table: trends.SheetTable;
  if (version) {
    const csv = await versionCsv(version);
    if (!csv) return new Response("그 버전을 찾지 못했어요", { status: 404 });
    table = trends.csvToTable(csv);
  } else {
    table = await fullTable();
  }
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (q.get("format") === "csv") {
    return new Response("﻿" + trends.tableToCsv(table), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`curated-${day}.csv`)}`, "Cache-Control": "no-store" },
    });
  }
  const buf = await tableToXlsx(table);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`수집시트-${day}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
