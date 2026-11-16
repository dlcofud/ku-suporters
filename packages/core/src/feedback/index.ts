/**
 * 성과 피드백.
 *
 * 데이터 출처
 *  - 사용자 본인 계정: Instagram Graph API 인사이트 (사용자가 OAuth로 연결한 프로페셔널 계정)
 *  - 주최사 공식 계정: Business Discovery (다른 프로페셔널 계정의 공개 지표)
 * 둘 다 공식 API만 쓴다. 크롤링하지 않는다. 썸네일·캡션 원본은 저장하지 않고 지표만 쓴다.
 *
 * 하는 일
 *  1) 포맷별 성과 요약
 *  2) 남은 일정에 대한 제안 (planner.changeFormat으로 반영)
 *  3) 지원서에 넣을 성과 문장
 */

import type { ContentFormat, ISODate } from "../shared.js";
import { diffDays, FORMAT_LABEL } from "../shared.js";
import type { Plan } from "../planner/index.js";

export interface MediaMetrics {
  id: string;
  date: ISODate;
  format: Exclude<ContentFormat, "check">;
  title?: string;
  permalink?: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares?: number;
}

export interface FormatStats {
  format: Exclude<ContentFormat, "check">;
  count: number;
  avgViews: number;
  avgSaves: number;
  /** (좋아요 + 댓글 + 저장) / 조회수 */
  engagementRate: number;
}

export interface FeedbackSummary {
  count: number;
  avgViews: number;
  totalSaves: number;
  best?: MediaMetrics;
  byFormat: FormatStats[];
  topByViews?: FormatStats;
  topBySaves?: FormatStats;
}

export interface Suggestion {
  kind: "switch_format" | "keep_format" | "post_more" | "add_hook";
  planItemId?: string;
  toFormat?: Exclude<ContentFormat, "check">;
  title: string;
  detail: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(media: MediaMetrics[]): FeedbackSummary {
  const formats = [...new Set(media.map((m) => m.format))];
  const byFormat: FormatStats[] = formats.map((format) => {
    const ms = media.filter((m) => m.format === format);
    const views = ms.reduce((s, m) => s + m.views, 0);
    return {
      format,
      count: ms.length,
      avgViews: Math.round(avg(ms.map((m) => m.views))),
      avgSaves: Math.round(avg(ms.map((m) => m.saves)) * 10) / 10,
      engagementRate: views ? ms.reduce((s, m) => s + m.likes + m.comments + m.saves, 0) / views : 0,
    };
  });
  const best = [...media].sort((a, b) => b.views - a.views)[0];
  return {
    count: media.length,
    avgViews: Math.round(avg(media.map((m) => m.views))),
    totalSaves: media.reduce((s, m) => s + m.saves, 0),
    best,
    byFormat,
    topByViews: [...byFormat].sort((a, b) => b.avgViews - a.avgViews)[0],
    topBySaves: [...byFormat].sort((a, b) => b.avgSaves - a.avgSaves)[0],
  };
}

/**
 * 남은 일정에 대한 제안.
 * - 조회수 1위 포맷이 다른 포맷보다 ratio배 이상 좋으면, 다음 약한 포맷 일정 하나를 1위 포맷으로 바꾸자고 제안한다.
 *   단 저장 수가 가장 높은 포맷은 정보형 콘텐츠용으로 유지하자고 따로 알려준다.
 * - 콘텐츠가 2개 미만이면 판단을 미루고 더 올리자고 한다.
 */
export function suggest(summary: FeedbackSummary, plan: Plan, opts: { ratio?: number } = {}): Suggestion[] {
  const ratio = opts.ratio ?? 2;
  const out: Suggestion[] = [];
  if (summary.count < 2) {
    out.push({ kind: "post_more", title: "콘텐츠를 2개 이상 올린 뒤에 비교할 수 있어요", detail: "포맷별로 하나씩은 올려야 어떤 포맷이 잘 맞는지 알 수 있어요." });
    return out;
  }
  const top = summary.topByViews;
  if (!top) return out;
  const upcoming = plan.items.filter((i) => i.kind === "content" && i.status === "upcoming");
  const weaker = summary.byFormat.filter((f) => f.format !== top.format && f.avgViews > 0 && top.avgViews / f.avgViews >= ratio);
  for (const w of weaker) {
    if (summary.topBySaves?.format === w.format) {
      out.push({
        kind: "keep_format",
        title: `${FORMAT_LABEL[w.format]}는 저장이 많아요`,
        detail: `조회수는 낮아도 저장 수가 가장 높아요(평균 ${w.avgSaves}). 정보형 주제는 ${FORMAT_LABEL[w.format]}로 유지하세요.`,
      });
      continue;
    }
    const target = upcoming.find((i) => i.format === w.format);
    if (target) {
      const times = (top.avgViews / w.avgViews).toFixed(1);
      out.push({
        kind: "switch_format",
        planItemId: target.id,
        toFormat: top.format,
        title: `${target.date.slice(5).replace("-", "/")} ${FORMAT_LABEL[w.format]}를 ${FORMAT_LABEL[top.format]}로 바꿀까요?`,
        detail: `${FORMAT_LABEL[top.format]} 평균 조회수가 ${FORMAT_LABEL[w.format]}의 약 ${times}배예요.`,
      });
    }
  }
  if (top.format === "reels" && summary.best && summary.best.views < summary.avgViews * 1.2) {
    out.push({ kind: "add_hook", title: "첫 3초 훅을 바꿔 보세요", detail: "릴스 사이 조회수 차이가 작아요. 첫 장면에 제품이나 결과를 먼저 보여주세요." });
  }
  return out;
}

/** 지원서용 성과 문장. 숫자는 실제 데이터에서만 가져온다. */
export function achievementSentence(summary: FeedbackSummary, accountStart: ISODate, today: ISODate): string | null {
  if (!summary.best || summary.count === 0) return null;
  const days = Math.max(1, diffDays(accountStart, today) + 1);
  const period = days >= 14 ? `${Math.round(days / 7)}주` : `${days}일`;
  const fmt = FORMAT_LABEL[summary.best.format];
  return `지원을 위해 연 계정에서 ${period}간 콘텐츠 ${summary.count}개를 운영했고, ${fmt}로 최고 조회수 ${summary.best.views.toLocaleString("ko-KR")}회를 기록했습니다.`;
}

/* ------------------------------------------------------------------ */
/* 데이터 어댑터                                                       */
/* ------------------------------------------------------------------ */

export interface InstagramSource {
  /** 사용자 본인 계정의 게시물 지표 */
  ownMedia(accessToken: string, igUserId: string, limit?: number): Promise<MediaMetrics[]>;
  /** 주최사 공식 계정(프로페셔널 계정)의 공개 지표 */
  officialMedia(accessToken: string, igUserId: string, username: string, limit?: number): Promise<MediaMetrics[]>;
}

function mapFormat(mediaType?: string, productType?: string): Exclude<ContentFormat, "check"> {
  if (productType === "REELS" || mediaType === "VIDEO") return "reels";
  if (mediaType === "CAROUSEL_ALBUM") return "cardnews";
  return "post";
}

/**
 * Instagram Graph API(Facebook 로그인 방식) 구현.
 * - 필드 이름은 Meta 문서 기준이며, API 버전이 바뀌면 확인이 필요하다.
 * - 액세스 토큰은 서버에서만 다룬다(브라우저로 내려보내지 않는다).
 */
export class GraphApiInstagramSource implements InstagramSource {
  constructor(private readonly version = "v26.0", private readonly base = "https://graph.facebook.com") {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.base}/${this.version}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Graph API 오류 ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  async ownMedia(accessToken: string, igUserId: string, limit = 25): Promise<MediaMetrics[]> {
    type M = { id: string; timestamp: string; media_type?: string; media_product_type?: string; like_count?: number; comments_count?: number; permalink?: string };
    const list = await this.get<{ data: M[] }>(`${igUserId}/media`, {
      fields: "id,timestamp,media_type,media_product_type,like_count,comments_count,permalink",
      limit: String(limit),
      access_token: accessToken,
    });
    const out: MediaMetrics[] = [];
    for (const m of list.data) {
      let views = 0;
      let saves = 0;
      let shares = 0;
      try {
        const ins = await this.get<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`${m.id}/insights`, {
          metric: "views,saved,shares",
          access_token: accessToken,
        });
        for (const d of ins.data) {
          const v = d.total_value?.value ?? d.values?.[0]?.value ?? 0;
          if (d.name === "views") views = v;
          if (d.name === "saved") saves = v;
          if (d.name === "shares") shares = v;
        }
      } catch {
        /* 인사이트를 못 받으면 0으로 둔다 */
      }
      out.push({
        id: m.id,
        date: m.timestamp.slice(0, 10),
        format: mapFormat(m.media_type, m.media_product_type),
        permalink: m.permalink,
        views,
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        saves,
        shares,
      });
    }
    return out;
  }

  async officialMedia(accessToken: string, igUserId: string, username: string, limit = 25): Promise<MediaMetrics[]> {
    type M = { id: string; timestamp: string; media_type?: string; media_product_type?: string; like_count?: number; comments_count?: number; view_count?: number; permalink?: string };
    const res = await this.get<{ business_discovery: { media?: { data: M[] } } }>(igUserId, {
      fields: `business_discovery.username(${username}){media.limit(${limit}){id,timestamp,media_type,media_product_type,like_count,comments_count,view_count,permalink}}`,
      access_token: accessToken,
    });
    return (res.business_discovery.media?.data ?? []).map((m) => ({
      id: m.id,
      date: m.timestamp.slice(0, 10),
      format: mapFormat(m.media_type, m.media_product_type),
      permalink: m.permalink,
      views: m.view_count ?? 0,
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      saves: 0, // 다른 계정의 저장 수는 공개되지 않는다
    }));
  }
}

/** UI 개발·데모용 가짜 데이터 소스 */
export class MockInstagramSource implements InstagramSource {
  constructor(private readonly own: MediaMetrics[], private readonly official: Record<string, MediaMetrics[]> = {}) {}
  async ownMedia() {
    return this.own;
  }
  async officialMedia(_t: string, _u: string, username: string) {
    return this.official[username] ?? [];
  }
}
