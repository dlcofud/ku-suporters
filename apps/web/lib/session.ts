import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, readSessionToken } from "@supportlab/core/auth/node";
import { auth } from "@supportlab/core";
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

/** 권한은 서버 환경 변수로만 준다: ADMIN_LOGIN_IDS(검수 관리자), TEAM_LOGIN_IDS(후기 분석 팀). 쉼표로 여러 명 */
export function rolesOf(user: User | undefined): auth.Role[] {
  return auth.rolesFor(user?.loginId, { admins: auth.parseIdList(process.env.ADMIN_LOGIN_IDS), team: auth.parseIdList(process.env.TEAM_LOGIN_IDS) });
}

/** 권한이 없으면 안내 화면으로 보낸다. 페이지와 서버 액션 모두에서 부른다 (액션은 화면 없이도 불릴 수 있다) */
export async function requireRole(role: auth.Role): Promise<User> {
  const u = await requireUser();
  if (!rolesOf(u).includes(role)) redirect(`/forbidden?need=${role}`);
  return u;
}

export const ACT_COOKIE = "sl_act";

/** 사이드바에서 고른 활동. 고른 적이 없거나 없어졌으면 가장 최근 활동 */
export async function currentActivity(userId: string): Promise<Activity | undefined> {
  const list = await repo.listActivities(userId);
  const id = (await cookies()).get(ACT_COOKIE)?.value;
  return list.find((a) => a.id === id) ?? list[0];
}
