import { NextResponse } from "next/server";
import { currentUser, ACT_COOKIE } from "@/lib/session";
import { repo } from "@/lib/repo";

/**
 * 서포터즈 하나를 고르고 next 주소로 간다 (통합 캘린더·사이드바에서 쓰는 링크).
 * 내 서포터즈가 아니면 고르지 않는다. next는 같은 사이트 안의 경로만 받는다.
 * 쿠키를 바꾸는 주소라서 next/link(미리 불러오기)로 걸지 말고 <a>로만 건다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));
  const { id } = await params;
  const raw = url.searchParams.get("next") || "/calendar";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/calendar";
  const mine = (await repo.listActivities(user.id)).some((a) => a.id === id);
  const res = NextResponse.redirect(new URL(mine ? next : "/", url));
  if (mine) res.cookies.set(ACT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
