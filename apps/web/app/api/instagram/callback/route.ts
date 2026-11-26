import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { repo } from "@/lib/repo";
import { exchangeUnifiedCode, findInstagramAccount, legacyReady, redirectUri, unifiedReady } from "@/lib/meta";

/**
 * 로그인을 마치고 돌아온 곳: 인증 코드 → 토큰 → 인스타 계정을 찾아 사용자에 연결한다. 토큰은 서버에만 둔다.
 * 실패하면 이유를 붙여 계정 관리로 돌려보낸다 (?ig=…).
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) redirect("/");
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const state = jar.get("ig_state")?.value;
  jar.delete("ig_state");
  if (q.get("error")) redirect("/account?ig=cancel");
  const code = q.get("code");
  if (!code || !state || q.get("state") !== state) redirect("/account?ig=error");
  const back = redirectUri(req);

  if (unifiedReady()) {
    let token: string;
    try {
      token = await exchangeUnifiedCode(code, back);
    } catch (e) {
      console.error("[ig] 토큰 교환 실패", e);
      redirect("/account?ig=error");
    }
    let acct: { id: string; username?: string };
    try {
      acct = await findInstagramAccount(token);
    } catch (e) {
      console.error("[ig] 인스타 계정 찾기 실패", e);
      redirect("/account?ig=noaccount");
    }
    await repo.setUserIg(user.id, { userId: acct.id, username: acct.username, accessToken: token });
    redirect("/account?ig=ok");
  }

  if (!legacyReady()) redirect("/account?ig=error");
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: back,
    code,
  });
  const short = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body });
  if (!short.ok) redirect("/account?ig=error");
  const s = (await short.json()) as { access_token: string; user_id: number | string };
  let token = s.access_token;
  const long = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(process.env.INSTAGRAM_APP_SECRET ?? "")}&access_token=${encodeURIComponent(token)}`);
  if (long.ok) token = ((await long.json()) as { access_token: string }).access_token;
  const me = await fetch(`https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
  const info = me.ok ? ((await me.json()) as { user_id?: string; username?: string }) : {};
  await repo.setUserIg(user.id, { userId: String(info.user_id ?? s.user_id), username: info.username, accessToken: token });
  redirect("/account?ig=ok");
}
