import { feedback } from "@supportlab/core";
import { repo, type User } from "./repo";
import { GRAPH_VERSION, graphHost } from "./meta";

/**
 * 내 게시물 지표. 가짜 숫자는 만들지 않는다.
 * - 인스타 계정을 연결했으면 공식 API(본인 계정 인사이트)
 * - 아니면 사용자가 직접 입력한 게시물 성과
 * (예전에 캘린더로 만들던 예시 데이터는 id가 demo_ 로 시작한다 → 걸러서 보여 주지 않는다)
 */
export async function myMedia(user: User): Promise<{ media: feedback.MediaMetrics[]; source: "instagram" | "manual"; igError?: boolean }> {
  if (user.ig) {
    const src = new feedback.GraphApiInstagramSource(GRAPH_VERSION, graphHost(user.ig.accessToken));
    try {
      return { media: await src.ownMedia(user.ig.accessToken, user.ig.userId, 25), source: "instagram" };
    } catch {
      return { media: await manualMedia(user.id), source: "manual", igError: true };
    }
  }
  return { media: await manualMedia(user.id), source: "manual" };
}

export async function manualMedia(userId: string): Promise<feedback.MediaMetrics[]> {
  return ((await repo.getManualMedia(userId)) ?? []).filter((m) => !m.id.startsWith("demo_"));
}
