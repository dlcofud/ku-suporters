import { content, credits, planner } from "@supportlab/core";
import { repo, newId, type Activity } from "./repo";
import { getLLM, llmStatus } from "./llm";

/**
 * 크레딧을 잡아 두고 AI 작업을 돌린다. AI 결과면 사용량대로 정산, 규칙 기반이면 돌려준다.
 * (lib/actions.ts는 "use server" 파일이라 여기로 따로 뺐다. 라우트에서도 쓴다)
 */
export async function withCredits<T>(userId: string, kind: credits.TaskKind, run: (llm: ReturnType<typeof getLLM>) => Promise<content.AiResult<T>>, rules: () => T): Promise<content.AiResult<T>> {
  const rulesOnly = (note: string): content.AiResult<T> => ({ value: rules(), source: "rules", usage: { inputTokens: 0, outputTokens: 0 }, tier: "local", note });
  if (llmStatus().mode === "demo") return rulesOnly("AI가 연결되지 않아 기본 틀로 만들었어요.");
  const hold = await repo.ledger.hold(userId, kind, newId("job")).catch(() => null);
  if (!hold) return rulesOnly("크레딧이 모자라서 기본 틀로 만들었어요. 크레딧 화면에서 충전할 수 있어요.");
  try {
    const r = await run(getLLM());
    if (r.source === "ai") await repo.ledger.settle(hold, r.usage, r.tier);
    else await repo.ledger.release(hold);
    return r;
  } catch (e) {
    await repo.ledger.release(hold);
    throw e;
  }
}

export function briefFor(act: Activity, item: planner.PlanItem, product: string, idea?: string): content.ContentBrief {
  return {
    activityName: act.name,
    format: (item.format === "check" || !item.format ? "reels" : item.format) as content.MakeFormat,
    title: item.title,
    purpose: item.purpose,
    product: product || act.name.split(" ")[0] || "제품",
    idea,
    notice: { activities: act.analysis.activities ?? [], preferred: act.analysis.preferred ?? [], signalKeywords: act.analysis.signalKeywords ?? [] },
  };
}
