import { account } from "@supportlab/core";
import type { User } from "./repo";
import { todayISO } from "./repo";
import { GRAPH_VERSION, graphHost, legacyReady, loginOf, unifiedReady } from "./meta";

/** 공식 로그인 연결이 준비됐는지 (Meta 앱 환경 변수). 없으면 '아이디로 연결'만 쓴다 */
export function igLoginReady(): boolean {
  return unifiedReady() || legacyReady();
}

const FULL = "username,name,biography,website,profile_picture_url,followers_count,media_count";
const BASE = "username,name,profile_picture_url,followers_count,media_count";

/**
 * 연결된 계정의 지금 프로필을 읽는다 (읽기만 됨. 소개글·링크 변경은 인스타 API가 지원하지 않는다).
 * 소개글·링크 필드를 못 주는 계정이면 기본 필드만 다시 읽는다. 실패하면 undefined.
 */
export async function fetchIgProfile(user: User): Promise<(account.AccountProfile & { picture?: string }) | undefined> {
  if (!user.ig) return undefined;
  const { accessToken, userId } = user.ig;
  // 통합 로그인 토큰은 graph.facebook.com 에서 계정 ID로, 예전 토큰은 graph.instagram.com/me 로 읽는다
  const node = loginOf(accessToken) === "unified" ? `${GRAPH_VERSION}/${userId}` : "me";
  for (const fields of [FULL, BASE]) {
    try {
      const r = await fetch(`${graphHost(accessToken)}/${node}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!r.ok) {
        // 왜 못 읽었는지 Vercel 로그에 남긴다 (토큰은 남기지 않는다)
        const err = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } };
        console.error("[ig] 프로필 읽기 실패", { status: r.status, fields: fields === FULL ? "full" : "base", login: loginOf(accessToken), code: err.error?.code, subcode: err.error?.error_subcode, message: err.error?.message });
        continue;
      }
      const j = (await r.json()) as { username?: string; name?: string; biography?: string; website?: string; profile_picture_url?: string; followers_count?: number; media_count?: number };
      return {
        username: j.username ?? user.ig.username,
        name: j.name,
        bio: fields === FULL ? (j.biography ?? "") : undefined,
        website: fields === FULL ? (j.website ?? "") : undefined,
        followers: j.followers_count,
        mediaCount: j.media_count,
        hasPicture: !!j.profile_picture_url,
        picture: j.profile_picture_url,
        source: "instagram",
        at: todayISO(),
      };
    } catch (e) {
      console.error("[ig] 프로필 읽기 오류", e instanceof Error ? e.message : e);
    }
  }
  return undefined;
}
