import { redirect } from "next/navigation";

/**
 * 인스타그램 로그인 (Instagram API with Instagram Login).
 * 개발 모드에서는 앱에 테스터로 등록된 계정만 연결할 수 있다. docs/INSTAGRAM_SETUP.md 참고.
 */
export async function GET() {
  const id = process.env.INSTAGRAM_APP_ID;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!id || !redirectUri) return new Response("INSTAGRAM_APP_ID, INSTAGRAM_REDIRECT_URI 환경 변수를 먼저 설정해 주세요.", { status: 500 });
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights");
  redirect(url.toString());
}
