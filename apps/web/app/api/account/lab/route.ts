import { account, credits } from "@supportlab/core";
import { currentUser, currentActivity } from "@/lib/session";
import { repo, newId } from "@/lib/repo";
import { getLLM, llmStatus } from "@/lib/llm";
import { labContextFor, LAB_IMAGE, type LabImage } from "@/lib/lab";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 계정 실험실 (components/AccountLab.tsx).
 * 받는 것: multipart  action=add (slot, text, image?) | remove (slot) | brew | chat (message) | reset
 * 주는 것: { lab, notice? }
 * 참고 이미지는 AI가 분위기만 두 문장으로 적고, 이미지 자체는 저장하지 않는다.
 * AI를 쓰는 일(끓이기 · 대화 · 이미지 읽기)은 크레딧을 쓰고, 없으면 규칙으로 만든다.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const act = await currentActivity(user.id);
  if (!act) return Response.json({ error: "먼저 서포터즈를 추가해 주세요" }, { status: 400 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "보낸 내용을 받지 못했어요" }, { status: 400 });
  const action = String(fd.get("action") ?? "");
  const at = new Date().toISOString();
  let lab: account.LabState = act.accountKit?.lab ?? account.emptyLab();
  let notice: string | undefined;

  /** AI 한 번 쓰기: 크레딧을 잡고, 실패하거나 모자라면 undefined (규칙으로 대신한다) */
  async function withAi<T>(run: (client: ReturnType<typeof getLLM>) => Promise<account.LabAiResult<T>>): Promise<T | undefined> {
    if (llmStatus().mode === "demo") {
      notice = "AI가 연결되지 않아 기본 재료로만 만들었어요.";
      return undefined;
    }
    const hold = await repo.ledger.hold(user!.id, "account_lab", newId("job")).catch((e) => (e instanceof credits.InsufficientCreditsError ? null : Promise.reject(e)));
    if (!hold) {
      notice = "크레딧이 모자라서 기본 재료로만 만들었어요. 크레딧 화면에서 충전할 수 있어요.";
      return undefined;
    }
    const client = getLLM();
    try {
      const r = await run(client);
      await repo.ledger.settle(hold, r.usage, client.tier);
      return r.value;
    } catch (e) {
      await repo.ledger.release(hold);
      console.error("[lab] AI 실패", e);
      notice = "AI가 답하지 못해서 기본 재료로 만들었어요. 잠시 뒤 다시 해 보세요.";
      return undefined;
    }
  }

  if (action === "add") {
    const slot = String(fd.get("slot") ?? "") as account.LabSlot;
    if (!account.LAB_QUESTIONS.some((q) => q.slot === slot)) return Response.json({ error: "알 수 없는 재료예요" }, { status: 400 });
    const text = String(fd.get("text") ?? "").trim();
    const file = fd.get("image");
    let imageNote: string | undefined;
    if (file instanceof File && file.size) {
      if (!LAB_IMAGE.test(file.type) || file.size > 3 * 1024 * 1024) return Response.json({ error: "이미지는 3MB 이하 PNG · JPG · WEBP만 돼요" }, { status: 400 });
      const img: LabImage = { mediaType: file.type as LabImage["mediaType"], data: Buffer.from(await file.arrayBuffer()).toString("base64") };
      if (getLLM().vision) imageNote = await withAi((c) => account.describeReference(img, c));
      else notice = "지금 연결된 AI는 이미지를 읽지 못해서 글만 넣었어요.";
    }
    if (!text && !imageNote) return Response.json({ error: "재료를 적어 주세요" }, { status: 400 });
    lab = account.addIngredient(lab, { slot, text: text || "참고 이미지", imageNote }, at);
  } else if (action === "remove") {
    lab = account.removeIngredient(lab, String(fd.get("slot") ?? "") as account.LabSlot);
  } else if (action === "reset") {
    lab = account.emptyLab();
  } else if (action === "brew") {
    if (!account.canBrew(lab)) return Response.json({ error: "재료를 3개 이상 넣어야 끓일 수 있어요" }, { status: 400 });
    const ctx = await labContextFor(user, act);
    const brew = (await withAi((c) => account.brewWithLLM(lab, ctx, c, at))) ?? account.brewByRules(lab, ctx, at);
    lab = { ...lab, brew, chat: [...lab.chat, { role: "lab" as const, text: `이 계정을 대표하는 한 단어는 '${brew.word}' · ${brew.identity}`, at }].slice(-60) };
  } else if (action === "chat") {
    const message = String(fd.get("message") ?? "").trim().slice(0, 600);
    if (!message) return Response.json({ error: "메시지가 비어 있어요" }, { status: 400 });
    const ctx = await labContextFor(user, act);
    lab = { ...lab, chat: [...lab.chat, { role: "me" as const, text: message, at }] };
    const r = (await withAi((c) => account.labChatWithLLM(lab, ctx, message, c, at))) ?? account.labChatByRules(lab, ctx, message, at);
    lab = { ...lab, brew: r.brew ?? lab.brew, chat: [...lab.chat, { role: "lab" as const, text: r.reply, at }].slice(-60) };
  } else {
    return Response.json({ error: "알 수 없는 요청이에요" }, { status: 400 });
  }

  act.accountKit = { ...(act.accountKit ?? {}), lab };
  await repo.saveActivity(act);
  return Response.json({ lab, notice });
}
