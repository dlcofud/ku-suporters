import { trends } from "@supportlab/core";
import { currentUser, rolesOf } from "@/lib/session";
import { repo } from "@/lib/repo";

/** 앱에서 코딩한 후기를 수집 시트와 같은 열로 내려받는다 (엑셀에서 열리도록 UTF-8 BOM 포함) */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("로그인이 필요해요", { status: 401 });
  if (!rolesOf(user).includes("team")) return new Response("후기 분석 팀만 내려받을 수 있어요", { status: 403 });
  const onlyDone = new URL(req.url).searchParams.get("status") === "done";
  const list = (await repo.listCodedReviews()).filter((r) => !onlyDone || r.status === "검수 완료");
  const csv = "﻿" + trends.toSheetCsv(list);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`후기분석_${new Date().toISOString().slice(0, 10)}.csv`)}`,
    },
  });
}
