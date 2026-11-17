import { apply } from "@supportlab/core";
import { readFormFile, FormReadError } from "@supportlab/core/apply/node";
import { currentUser, currentActivity } from "@/lib/session";
import { ensureApplication, publicApp, saveApp } from "@/lib/apply";

/**
 * 지원서 양식 올리기 (multipart): file(.docx/.hwpx/.txt) 또는 text(문항 붙여넣기)
 * 서술형 문항은 지원서에 합치고, 직접 채울 항목은 따로 보관한다. 파일은 저장하지 않는다.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const act = await currentActivity(user.id);
  if (!act) return Response.json({ error: "먼저 공고를 분석해 주세요" }, { status: 400 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "파일을 받지 못했어요" }, { status: 400 });
  const file = fd.get("file");
  const text = String(fd.get("text") ?? "").trim();
  let parsed: apply.FormParse;
  let name: string | undefined;
  try {
    if (file instanceof File && file.size > 0) {
      name = file.name;
      parsed = readFormFile(file.name, Buffer.from(await file.arrayBuffer()));
    } else if (text) {
      parsed = apply.parseFormText(text);
    } else {
      return Response.json({ error: "양식 파일을 고르거나 문항을 붙여넣어 주세요" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e instanceof FormReadError ? e.message : "양식을 읽지 못했어요" }, { status: 400 });
  }
  if (!parsed.questions.length && !parsed.fields.length) {
    return Response.json({ error: "양식에서 문항을 찾지 못했어요. 문항을 글로 붙여넣어 주세요." }, { status: 422 });
  }
  const app = ensureApplication(act);
  const r = apply.importForm(app, parsed, name);
  await saveApp(act, r.app);
  return Response.json({ app: publicApp(r.app), added: r.added, merged: r.merged, fields: parsed.fields.length });
}
