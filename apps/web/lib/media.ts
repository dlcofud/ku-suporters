import { currentActivity } from "./session";
import { feedback, shared } from "@supportlab/core";
import { repo, todayISO, type User } from "./repo";

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
  const cached = await repo.getDemoMedia(user.id);
  if (cached) return { media: cached, demo: true };
  const act = await currentActivity(user.id);
  const sample: [number, number, number][] = [[1820, 96, 12], [640, 41, 23], [380, 52, 4], [2380, 130, 18], [710, 38, 27]];
  const contents = act?.plan?.items.filter((i) => i.kind === "content") ?? [];
  const picked = contents.slice(0, 5);
  const media = picked.map((it, k) => {
    const [views, likes, saves] = sample[k % sample.length]!;
    // 예시는 "이미 올린 콘텐츠"처럼 보여야 하므로 오늘까지 2일 간격으로 지난 날짜를 쓴다
    const date = shared.addDays(todayISO(), -2 * (picked.length - 1 - k));
    return { id: `demo_${it.id}`, date, format: (it.format === "check" || !it.format ? "post" : it.format) as feedback.MediaMetrics["format"], title: it.title, views, likes, comments: Math.round(likes / 12), saves };
  });
  if (media.length) await repo.setDemoMedia(user.id, media);
  return { media, demo: true };
}
