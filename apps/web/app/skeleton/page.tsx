import Link from "next/link";
import { requireUser, currentActivity } from "@/lib/session";
import { ensureApplication, publicApp, saveApp } from "@/lib/apply";
import { llmStatus } from "@/lib/llm";
import { ApplyStudio } from "@/components/ApplyStudio";

/** 지원서 작성: 코치와 대화하면서 공고 문항으로 만든 양식을 채운다 */
export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ achievement?: string }> }) {
  const { achievement } = await searchParams;
  const user = await requireUser();
  const act = await currentActivity(user.id);
  if (!act) return <div className="card"><h1>먼저 공고를 분석해 주세요</h1><Link className="btn pri" href="/notice">공고 분석</Link></div>;
  const fresh = !act.application;
  const app = ensureApplication(act);
  if (fresh) await saveApp(act, app);
  const ai = llmStatus();
  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <span className="eyebrow">{act.name}</span>
        <h1>지원서 작성</h1>
        <p className="lede" style={{ margin: 0 }}>코치의 질문에 답하면 지원서 양식에 초안이 써져요. 관련 없어 보이는 경험도 같이 연결 고리를 찾아봐요.</p>
      </header>
      <ApplyStudio
        initial={publicApp(app)}
        activityName={act.name}
        aiLabel={ai.label}
        aiMode={ai.mode}
        prefill={achievement ? `제 성과 문장이에요: ${achievement.slice(0, 300)}` : undefined}
      />
    </>
  );
}
