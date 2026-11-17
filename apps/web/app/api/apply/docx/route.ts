import { currentUser, currentActivity } from "@/lib/session";
import { ensureApplication } from "@/lib/apply";
import { applicationDocxName, buildApplicationDocx } from "@/lib/applyDocx";

export const dynamic = "force-dynamic";

/** 지금 활동의 지원서(문항 + 답 + 직접 채울 항목)를 워드 파일로 내려받는다 */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("로그인이 필요해요", { status: 401 });
  const act = await currentActivity(user.id);
  if (!act) return new Response("먼저 공고를 분석해 주세요", { status: 400 });
  const app = ensureApplication(act);
  const buf = await buildApplicationDocx({ activityName: act.name, nickname: user.nickname, app });
  const name = applicationDocxName(act.name);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="application.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
