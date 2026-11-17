import { apply } from "@supportlab/core";
import { currentUser, currentActivity } from "@/lib/session";
import { ensureApplication, publicApp, saveApp } from "@/lib/apply";

/**
 * 양식 저장.
 * { edits?: {q,text}[] }  직접 고친 글
 * { addQuestion?: string } 문항 추가
 * { reset?: true }         대화와 글을 지우고 처음부터
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const act = await currentActivity(user.id);
  if (!act) return Response.json({ error: "먼저 공고를 분석해 주세요" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { edits?: { q: number; text: string }[]; addQuestion?: string; reset?: boolean };
  if (body.reset) act.application = undefined;
  let app = ensureApplication(act);
  if (Array.isArray(body.edits)) app = apply.applyUserEdits(app, body.edits);
  if (body.addQuestion) {
    const wasEmpty = app.questions.length === 0;
    app = apply.addQuestion(app, body.addQuestion);
    if (wasEmpty) app.chat.push({ role: "coach", text: `문항을 받았어요. 1번 '${app.questions[0]!.text.slice(0, 40)}'부터 해 볼게요. 이 문항에 쓸 만한 경험을 편하게 말해 주세요.`, at: new Date().toISOString() });
  }
  await saveApp(act, app);
  return Response.json({ app: publicApp(app) });
}
