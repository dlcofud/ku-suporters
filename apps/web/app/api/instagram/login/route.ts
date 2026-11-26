import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { GRAPH_VERSION, legacyReady, redirectUri, unifiedReady } from "@/lib/meta";

/**
 * 인스타 공식 연결 시작.
 *  - 통합 로그인(새 Meta 앱): 비즈니스용 Facebook 로그인 대화상자 + 구성 ID
 *  - 예전 Instagram 로그인(예전 앱): instagram.com/oauth/authorize
 * 개발 모드에서는 앱에 Instagram 테스터로 등록된 계정만 연결된다. docs/INSTAGRAM_SETUP.md 참고.
 */
export async function GET(req: Request) {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("ig_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  const back = redirectUri(req);
  if (unifiedReady()) {
    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", process.env.META_APP_ID!);
    url.searchParams.set("config_id", process.env.META_LOGIN_CONFIG_ID!);
    url.searchParams.set("redirect_uri", back);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("override_default_response_type", "true");
    url.searchParams.set("state", state);
    redirect(url.toString());
  }
  if (legacyReady()) {
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!);
    url.searchParams.set("redirect_uri", back);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights");
    url.searchParams.set("state", state);
    redirect(url.toString());
  }
  return new Response("META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID 환경 변수를 먼저 설정해 주세요.", { status: 500 });
}
