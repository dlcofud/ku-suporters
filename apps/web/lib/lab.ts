import { account, feedback, shared, skeleton, trends, type llm } from "@supportlab/core";
import type { Activity, User } from "./repo";
import { fetchIgProfile } from "./igprofile";
import { myMedia } from "./media";
import { loadAllReviews } from "./trends";

/** 계정 실험실에 넘길 맥락 (활동 · 합격 경향 · 지금 프로필 · 최근 게시물). 모두 사용자 본인의 데이터다 */
export async function labContextFor(user: User, act: Activity, prefetched?: { profile?: account.AccountProfile; media?: feedback.MediaMetrics[]; report?: trends.TrendReport }): Promise<account.LabContext> {
  const [profile, media, report] = await Promise.all([
    prefetched?.profile ?? fetchIgProfile(user).then((live) => {
      const saved = act.accountKit?.profile;
      return live ? { ...live, bio: live.bio ?? saved?.bio, website: live.website ?? saved?.website, interest: saved?.interest } : saved;
    }),
    prefetched?.media ?? myMedia(user).then((r) => r.media).catch(() => []),
    prefetched?.report ?? loadAllReviews().then((r) => trends.buildTrendReport(r)).catch(() => undefined),
  ]);
  const byFormat = new Map<string, number[]>();
  for (const m of media ?? []) byFormat.set(m.format, [...(byFormat.get(m.format) ?? []), m.views]);
  const mediaSummary = [...byFormat]
    .map(([f, v]) => `${shared.FORMAT_LABEL[f as keyof typeof shared.FORMAT_LABEL] ?? f} ${v.length}개 평균 조회 ${Math.round(v.reduce((a, b) => a + b, 0) / v.length)}`)
    .join(", ");
  return {
    activityName: act.name,
    brand: act.name.split(/\s+/)[0] ?? "",
    noticeWords: [...(act.analysis.signalKeywords ?? []), ...(act.analysis.activities ?? []), ...(act.analysis.preferred ?? [])].slice(0, 12),
    trendStrong: report ? trends.strongest(report.elementAverages).slice(0, 3).map((e) => skeleton.RUBRIC[e.code]) : [],
    profile,
    mediaSummary: mediaSummary || undefined,
    blogConnected: !!act.accountKit?.blog,
  };
}

export type LabImage = Parameters<typeof account.describeReference>[0];
export const LAB_IMAGE = /^image\/(png|jpeg|webp|gif)$/;
export type { llm };
