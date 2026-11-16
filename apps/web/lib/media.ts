import { feedback } from "@supportlab/core";
import { db, latestActivity, type User } from "./store";

/**
 * 내 게시물 지표.
 * - 인스타 계정을 연결했으면 공식 API(본인 계정 인사이트)
 * - 아니면 캘린더의 지난 일정으로 만든 예시 데이터 (화면에 '예시'로 표시)
 */
export async function myMedia(user: User): Promise<{ media: feedback.MediaMetrics[]; demo: boolean }> {
  if (user.ig) {
    const src = new feedback.GraphApiInstagramSource("v26.0", "https://graph.instagram.com");
    try {
      return { media: await src.ownMedia(user.ig.accessToken, user.ig.userId, 25), demo: false };
    } catch {
      /* 실패하면 예시 데이터로 */
    }
  }
  const cached = db.demoMedia.get(user.id);
  if (cached) return { media: cached, demo: true };
  const act = latestActivity(user.id);
  const sample: [number, number, number][] = [[1820, 96, 12], [640, 41, 23], [380, 52, 4], [2380, 130, 18], [710, 38, 27]];
  const contents = act?.plan?.items.filter((i) => i.kind === "content") ?? [];
  const media = (contents.length ? contents : []).slice(0, 5).map((it, k) => {
    const [views, likes, saves] = sample[k % sample.length]!;
    return { id: `demo_${it.id}`, date: it.date, format: (it.format === "check" || !it.format ? "post" : it.format) as feedback.MediaMetrics["format"], title: it.title, views, likes, comments: Math.round(likes / 12), saves };
  });
  db.demoMedia.set(user.id, media);
  return { media, demo: true };
}
