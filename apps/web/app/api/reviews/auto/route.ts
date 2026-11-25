import { currentUser, rolesOf } from "@/lib/session";
import { autoReview } from "@/lib/autoreview";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 자동 검수 한 건 (관리자 화면에서 한 건씩 부른다).
 * 교차 검수 → 같으면 검수 완료, 다르면 AI 판정 → 검수 완료. 실패하면 '관리자 확인 필요'로 남는다.
 * 받는 것: { id }
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !rolesOf(user).includes("admin")) return Response.json({ error: "관리자만 쓸 수 있어요" }, { status: 403 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return Response.json({ error: "id가 필요해요" }, { status: 400 });
  return Response.json(await autoReview(id));
}
