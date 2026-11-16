import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { repo, type User, type Activity } from "./repo";

export const COOKIE = "sl_uid";

export async function currentUser(): Promise<User | undefined> {
  const id = (await cookies()).get(COOKIE)?.value;
  return id ? repo.getUser(id) : undefined;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/");
  return u;
}

export const ACT_COOKIE = "sl_act";

/** 사이드바에서 고른 활동. 고른 적이 없거나 없어졌으면 가장 최근 활동 */
export async function currentActivity(userId: string): Promise<Activity | undefined> {
  const list = await repo.listActivities(userId);
  const id = (await cookies()).get(ACT_COOKIE)?.value;
  return list.find((a) => a.id === id) ?? list[0];
}
