import { publish } from "@supportlab/core";
import { db } from "@/lib/store";
import { publisherFor } from "@/lib/publisher";

/**
 * 예약 게시 주기 작업. Vercel Cron 등으로 5분마다 호출한다.
 * 예: vercel.json { "crons": [{ "path": "/api/cron/publish?key=...", "schedule": "*\/5 * * * *" }] }
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) return new Response("forbidden", { status: 403 });
  const now = new Date();
  const active = db.posts.filter((p) => !["published", "failed", "canceled"].includes(p.status));
  const byUser = new Map<string, publish.ScheduledPost[]>();
  for (const p of active) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
  let processed = 0;
  for (const [userId, posts] of byUser) {
    const user = db.users.get(userId);
    if (!user?.ig) continue; // 연결 안 된 사용자는 데모 버튼으로만 진행
    const { client, tokenFor } = publisherFor(user);
    const updated = await publish.tick(posts, now, client, tokenFor);
    const map = new Map(updated.map((p) => [p.id, p]));
    db.posts = db.posts.map((p) => map.get(p.id) ?? p);
    processed += posts.length;
  }
  return Response.json({ ok: true, processed });
}
