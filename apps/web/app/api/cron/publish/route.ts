import { publish } from "@supportlab/core";
import { repo } from "@/lib/repo";
import { publisherFor } from "@/lib/publisher";

/**
 * 예약 게시 주기 작업. Vercel Cron 등으로 5분마다 호출한다 (apps/web/vercel.json).
 * Vercel Cron은 CRON_SECRET을 Authorization: Bearer 헤더로 보낸다. 직접 부를 때는 ?key= 로 보낸다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get("key");
    const auth = req.headers.get("authorization");
    if (key !== secret && auth !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  }
  const now = new Date();
  const active = await repo.listActivePosts();
  const byUser = new Map<string, publish.ScheduledPost[]>();
  for (const p of active) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
  let processed = 0;
  for (const [userId, posts] of byUser) {
    const user = await repo.getUser(userId);
    if (!user?.ig) continue; // 인스타 연결 안 된 사용자는 데모 버튼으로만 진행
    const { client, tokenFor } = publisherFor(user);
    await repo.savePosts(await publish.tick(posts, now, client, tokenFor));
    processed += posts.length;
  }
  return Response.json({ ok: true, processed });
}
