import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, readSessionToken } from "@supportlab/core/auth/node";
import { repo, type User, type Activity } from "./repo";

/** 로그인 쿠키. 값은 "사용자ID.만료.서명" (서버 비밀값으로 서명해서 고칠 수 없다) */
export const COOKIE = "sl_session";
const MAX_AGE = 60 * 60 * 24 * 30;

let warned = false;
/** 서명용 비밀값. 배포에서는 SESSION_SECRET을 꼭 넣는다 */
function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (s) return s;
  if (!warned) {
    console.warn("[session] SESSION_SECRET이 없어 개발용 비밀값을 써요. 배포 전에 꼭 넣어 주세요.");
    warned = true;
  }
  return "supportlab-dev-only-secret";
}

export async function startSession(userId: string) {
  (await cookies()).set(COOKIE, createSessionToken(userId, secret(), MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !!process.env.VERCEL,
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(ACT_COOKIE);
  jar.delete("sl_uid"); // 예전 방식 쿠키
}

export async function currentUser(): Promise<User | undefined> {
  const id = readSessionToken((await cookies()).get(COOKIE)?.value, secret());
  return id ? repo.getUser(id) : undefined;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export const ACT_COOKIE = "sl_act";

/** 사이드바에서 고른 활동. 고른 적이 없거나 없어졌으면 가장 최근 활동 */
export async function currentActivity(userId: string): Promise<Activity | undefined> {
  const list = await repo.listActivities(userId);
  const id = (await cookies()).get(ACT_COOKIE)?.value;
  return list.find((a) => a.id === id) ?? list[0];
}
