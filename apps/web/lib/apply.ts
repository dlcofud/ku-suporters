import { apply } from "@supportlab/core";
import { repo, type Activity } from "./repo";

/** 활동에 지원서가 없으면 공고 문항으로 새로 만든다 */
export function ensureApplication(act: Activity): apply.Application {
  if (!act.application) {
    act.application = apply.startApplication({ activityName: act.name, notice: act.analysis });
  }
  return act.application;
}

/** 화면으로 보낼 때: 규칙 코치 내부 상태는 빼고 보낸다 */
export function publicApp(a: apply.Application) {
  const { rule: _rule, ...rest } = a;
  return rest;
}
export type PublicApp = ReturnType<typeof publicApp>;

export async function saveApp(act: Activity, a: apply.Application) {
  act.application = a;
  await repo.saveActivity(act);
}
