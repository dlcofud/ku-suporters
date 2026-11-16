import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { repo, type User } from "./repo";

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
