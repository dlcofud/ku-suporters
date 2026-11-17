import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * 상태 확인. GitHub Actions가 하루 한 번 불러서 무료 Supabase 프로젝트가
 * 7일 동안 요청이 없어 자동으로 멈추는 것을 막는다 (.github/workflows/keepalive.yml).
 * 사용자 데이터는 돌려주지 않는다.
 */
export async function GET() {
  const started = Date.now();
  try {
    await repo.ping();
    return Response.json({ ok: true, db: repo.kind, ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[health]", e);
    return Response.json({ ok: false, db: repo.kind }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
