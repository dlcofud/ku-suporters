import { account } from "@supportlab/core";
import type { User } from "./repo";
import { todayISO } from "./repo";

/** 공식 로그인 연결이 준비됐는지 (Meta 앱 환경 변수). 없으면 '아이디로 연결'만 쓴다 */
export function igLoginReady(): boolean {
  return !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET && !!process.env.INSTAGRAM_REDIRECT_URI;
}

const FULL = "user_id,username,name,biography,website,profile_picture_url,followers_count,media_count";
const BASE = "user_id,username,name,profile_picture_url,followers_count,media_count";

/**
 * 연결된 계정의 지금 프로필을 읽는다 (읽기만 됨. 소개글·링크 변경은 인스타 API가 지원하지 않는다).
 * 소개글·링크 필드를 못 주는 계정이면 기본 필드만 다시 읽는다. 실패하면 undefined.
 */
export async function fetchIgProfile(user: User): Promise<(account.AccountProfile & { picture?: string }) | undefined> {
  if (!user.ig) return undefined;
  for (const fields of [FULL, BASE]) {
    try {
      const r = await fetch(`https://graph.instagram.com/me?fields=${fields}&access_token=${encodeURIComponent(user.ig.accessToken)}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
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
    } catch {
      /* 다음 필드 묶음으로 */
    }
  }
  return undefined;
}
