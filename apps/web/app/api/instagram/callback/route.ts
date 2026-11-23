import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { repo } from "@/lib/repo";

/** 인증 코드 → 액세스 토큰 → 장기 토큰으로 바꾸고 사용자에 연결한다. 토큰은 서버에만 둔다. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) redirect("/");
  const code = new URL(req.url).searchParams.get("code");
  if (!code) redirect("/feedback?ig=error#account");
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI ?? "",
    code,
  });
  const short = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body });
  if (!short.ok) redirect("/feedback?ig=error#account");
  const s = (await short.json()) as { access_token: string; user_id: number | string };
  let token = s.access_token;
  const long = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(process.env.INSTAGRAM_APP_SECRET ?? "")}&access_token=${encodeURIComponent(token)}`);
  if (long.ok) token = ((await long.json()) as { access_token: string }).access_token;
  const me = await fetch(`https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
  const info = me.ok ? ((await me.json()) as { user_id?: string; username?: string }) : {};
  await repo.setUserIg(user.id, { userId: String(info.user_id ?? s.user_id), username: info.username, accessToken: token });
  redirect("/feedback?ig=ok#account");
}
