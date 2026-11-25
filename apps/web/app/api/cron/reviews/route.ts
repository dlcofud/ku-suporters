import { autoReview, autoTodo } from "@/lib/autoreview";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 하루 한 번 아직 자동 검수하지 않은 후기를 처리한다 (apps/web/vercel.json).
 * 관리자가 화면을 열지 않아도 쌓인 후기가 검수 완료로 넘어가게 한다. 시간 안에 못 끝낸 것은 다음 날 이어서 한다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get("key");
    const auth = req.headers.get("authorization");
    if (key !== secret && auth !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  }
  const until = Date.now() + 45_000;
  const tally: Record<string, number> = {};
  for (const id of await autoTodo()) {
    if (Date.now() > until) break;
    const o = await autoReview(id);
    const k = o.state === "done" ? o.via ?? "done" : o.state;
    tally[k] = (tally[k] ?? 0) + 1;
  }
  return Response.json({ ok: true, ...tally });
}
