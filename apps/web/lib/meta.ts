/**
 * 인스타 공식 연결 (Meta).
 *
 * 2026년 10월 말부터 새로 만든 Meta 앱은 'Instagram 로그인' 설정을 쓸 수 없고 'Unified login(통합 로그인)'만 쓴다.
 *  - 통합 로그인: 비즈니스용 Facebook 로그인 + 구성 ID(config_id). 토큰은 시스템 사용자 토큰(EAA…)이고
 *    만료되지 않으며 graph.facebook.com 에서만 동작한다. 계정은 /me 가 아니라 인스타 계정 ID로 부른다.
 *  - 예전 Instagram 로그인(IG… 토큰, graph.instagram.com)으로 연결된 계정도 그대로 동작하게 둔다.
 * 어떤 방식으로 연결했는지는 토큰 모양으로 구분한다 (DB 열을 늘리지 않는다).
 */
export const GRAPH_VERSION = "v26.0";

export type MetaLogin = "unified" | "instagram";

/** 통합 로그인 환경 변수가 모두 있는지 */
export function unifiedReady(): boolean {
  return !!process.env.META_APP_ID && !!process.env.META_APP_SECRET && !!process.env.META_LOGIN_CONFIG_ID;
}

/** 예전 Instagram 로그인 환경 변수 (새 앱에서는 못 쓰지만 예전 앱이면 그대로 둔다) */
export function legacyReady(): boolean {
  return !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET && !!process.env.INSTAGRAM_REDIRECT_URI;
}

/** 이 토큰이 어느 방식으로 받은 것인지. 예전 Instagram 로그인 토큰은 IG로 시작한다 */
export function loginOf(token: string): MetaLogin {
  return token.startsWith("IG") ? "instagram" : "unified";
}

/** 이 토큰으로 부를 그래프 API 주소 */
export function graphHost(token: string): string {
  return loginOf(token) === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com";
}

/** 로그인 후 돌아올 주소. Meta 앱의 '리디렉션 URL'에 똑같이 등록돼 있어야 한다 */
export function redirectUri(req: Request): string {
  return process.env.META_REDIRECT_URI || process.env.INSTAGRAM_REDIRECT_URI || `${new URL(req.url).origin}/api/instagram/callback`;
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  // META_GRAPH_BASE: 로컬 테스트에서 가짜 서버로 바꿀 때만 쓴다
  const url = new URL(`${process.env.META_GRAPH_BASE || "https://graph.facebook.com"}/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok || j.error) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
  return j;
}

/** 인증 코드 → 시스템 사용자 토큰 (통합 로그인) */
export async function exchangeUnifiedCode(code: string, redirect: string): Promise<string> {
  const j = await graph<{ access_token?: string }>("oauth/access_token", {
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: redirect,
    code,
  });
  if (!j.access_token) throw new Error("토큰을 받지 못했어요");
  return j.access_token;
}

/**
 * 로그인한 사람이 이 앱에 허락한 인스타 계정을 찾는다.
 *  1) /me/assigned_instagram_accounts (구성에 business_management가 있으면 됨)
 *  2) 안 되면 debug_token 의 granular_scopes 에 들어 있는 인스타 계정 ID
 */
export async function findInstagramAccount(token: string): Promise<{ id: string; username?: string }> {
  try {
    const j = await graph<{ data?: { id: string; username?: string }[] }>("me/assigned_instagram_accounts", { fields: "id,username", access_token: token });
    const first = j.data?.[0];
    if (first?.id) return first;
  } catch {
    /* 아래 방법으로 */
  }
  const app = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const d = await graph<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>("debug_token", { input_token: token, access_token: app });
  const id = d.data?.granular_scopes?.find((s) => s.scope.startsWith("instagram_") && s.target_ids?.length)?.target_ids?.[0];
  if (!id) throw new Error("허락한 인스타 계정을 찾지 못했어요");
  try {
    const u = await graph<{ id: string; username?: string }>(id, { fields: "id,username", access_token: token });
    return { id: u.id, username: u.username };
  } catch {
    return { id };
  }
}
