/**
 * 계정 관리의 '비교하기 · 분석하기'.
 * 숫자는 모두 실제 데이터(연결한 계정·직접 넣은 성과·블로그 RSS·합격 후기 코딩)에서만 계산한다. 지어낸 기준값은 없다.
 */
import type { ContentFormat, ISODate } from "../shared.js";
import { FORMAT_LABEL, diffDays } from "../shared.js";
import type { AccountProfile } from "./index.js";

type Fmt = Exclude<ContentFormat, "check">;

/* ---------------- 블로그 (네이버 블로그 RSS) ---------------- */

export interface BlogPost {
  title: string;
  link: string;
  date: ISODate;
  category?: string;
}

/** "chae_blog", "blog.naver.com/chae_blog", "https://m.blog.naver.com/chae_blog/2234" → "chae_blog" */
export function blogIdOf(raw: string): string | null {
  const s = raw.trim().replace(/^(https?:\/\/)?(m\.)?blog\.naver\.com\//i, "").replace(/^@/, "");
  const id = s.split(/[/?#\s]/)[0] ?? "";
  return /^[a-z0-9_-]{3,30}$/i.test(id) ? id.toLowerCase() : null;
}

export const blogRssUrl = (id: string) => `https://rss.blog.naver.com/${encodeURIComponent(id)}.xml`;

const decode = (s: string) =>
  s
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]!) : undefined;
};

/** 블로그 RSS에서 글 제목·주소·날짜·카테고리만 꺼낸다 (본문은 쓰지 않는다) */
export function parseBlogRss(xml: string): BlogPost[] {
  const out: BlogPost[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const it = m[1]!;
    const title = tag(it, "title");
    const link = tag(it, "link");
    const pub = tag(it, "pubDate");
    const d = pub ? new Date(pub) : undefined;
    if (!title || !link || !d || isNaN(d.getTime())) continue;
    // 한국 시간 기준 날짜
    const date = new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    out.push({ title, link: link.split("?")[0]!, date, category: tag(it, "category") || undefined });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---------------- 분석하기 ---------------- */

export interface MediaLike {
  date: ISODate;
  format: Fmt;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  title?: string;
  permalink?: string;
}

export interface AccountAnalysis {
  insta: {
    count: number;
    last30: number;
    /** 최근 8주 주당 평균 업로드 */
    perWeek: number;
    /** 마지막 업로드 후 지난 날 */
    sinceLast?: number;
    mix: { format: Fmt; label: string; count: number; share: number; avgViews: number }[];
    avgViews: number;
    /** (좋아요+댓글+저장)/조회수, 조회수가 있는 게시물만 */
    engagement?: number;
    best?: MediaLike;
    /** 조회수 평균이 가장 높은 요일 (게시물 2개 이상인 요일만) */
    bestWeekday?: { day: string; avgViews: number; n: number };
  };
  blog?: {
    count: number;
    last30: number;
    perWeek: number;
    sinceLast?: number;
    /** 브랜드·활동 이름이 제목에 들어간 글 */
    brandPosts: BlogPost[];
    categories: { name: string; count: number }[];
  };
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function cadence(dates: ISODate[], today: ISODate) {
  const ago = (d: ISODate) => diffDays(d, today);
  const recent = dates.filter((d) => ago(d) >= 0 && ago(d) < 56).length;
  const sorted = [...dates].sort();
  const last = sorted[sorted.length - 1];
  return { last30: dates.filter((d) => ago(d) >= 0 && ago(d) < 30).length, perWeek: Math.round((recent / 8) * 10) / 10, sinceLast: last ? Math.max(0, ago(last)) : undefined };
}

export function analyzeAccount(input: { media: MediaLike[]; blog?: BlogPost[]; brandWords: string[]; today: ISODate }): AccountAnalysis {
  const { media, today } = input;
  const formats = [...new Set(media.map((m) => m.format))];
  const mix = formats
    .map((format) => {
      const xs = media.filter((m) => m.format === format);
      return { format, label: FORMAT_LABEL[format], count: xs.length, share: media.length ? xs.length / media.length : 0, avgViews: Math.round(avg(xs.map((x) => x.views))) };
    })
    .sort((a, b) => b.count - a.count);
  const withViews = media.filter((m) => m.views > 0);
  const byDay = new Map<number, number[]>();
  for (const m of withViews) {
    const d = new Date(`${m.date}T00:00:00Z`).getUTCDay();
    byDay.set(d, [...(byDay.get(d) ?? []), m.views]);
  }
  const bestDay = [...byDay.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => avg(b[1]) - avg(a[1]))[0];
  const words = input.brandWords.map((w) => w.trim()).filter((w) => w.length >= 2);
  const blog = input.blog;
  return {
    insta: {
      count: media.length,
      ...cadence(media.map((m) => m.date), today),
      mix,
      avgViews: Math.round(avg(media.map((m) => m.views))),
      engagement: withViews.length ? avg(withViews.map((m) => (m.likes + m.comments + m.saves) / m.views)) : undefined,
      best: withViews.length ? [...withViews].sort((a, b) => b.views - a.views)[0] : undefined,
      bestWeekday: bestDay ? { day: DAYS[bestDay[0]]!, avgViews: Math.round(avg(bestDay[1])), n: bestDay[1].length } : undefined,
    },
    blog: blog
      ? {
          count: blog.length,
          ...cadence(blog.map((b) => b.date), today),
          brandPosts: blog.filter((b) => words.some((w) => b.title.includes(w))),
          categories: [...blog.reduce((m, b) => (b.category ? m.set(b.category, (m.get(b.category) ?? 0) + 1) : m), new Map<string, number>()).entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        }
      : undefined,
  };
}

/* ---------------- 합격 경향과 비교하기 ---------------- */

/** 합격 후기 코딩에서 필요한 것만 (trends.TrendReport와 같은 모양) */
export interface TrendLike {
  sampleSize: number;
  /** n = 그 요인을 언급한 후기 수 (언급 없음은 빠진다) */
  elementAverages: { code: string; avg: number; strongShare: number; n: number; rate?: number }[];
  formatMentions: { format: string; count: number }[];
  formatMentionedIn: number;
  newAccount: { yes: number; mentioned: number };
}

export interface CompareRow {
  id: "format" | "premade" | "result" | "brand" | "story" | "blog" | "newaccount";
  title: string;
  /** 합격 후기에서 본 것 (몇 건 중 몇 건) */
  trend: string;
  /** 내 계정에서 본 것 */
  mine: string;
  status: "ok" | "gap" | "info";
  /** 보완할 때 갈 곳 */
  fix?: "profile" | "perf";
  /** 보완할 때 할 일 한 줄 */
  todo?: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const FORMAT_OF: Record<string, Fmt | "blog"> = { 숏폼: "reels", 릴스: "reels", 카드뉴스: "cardnews", 피드: "post", 사진: "post", 블로그: "blog" };

/**
 * 합격 후기(코딩된 경향)와 내 계정을 항목별로 맞대 본다.
 * 후기에서 그 항목을 다룬 건수가 적으면(3건 미만) 비교하지 않는다.
 */
export function compareWithTrends(input: {
  trend: TrendLike;
  profile?: AccountProfile;
  analysis: AccountAnalysis;
  brandWords: string[];
  blogConnected: boolean;
}): CompareRow[] {
  const { trend: t, analysis: a, profile: p } = input;
  if (!t.sampleSize) return [];
  const rows: CompareRow[] = [];
  const el = (code: string) => t.elementAverages.find((e) => e.code === code && e.n >= 3);
  const bio = p?.bio ?? "";

  // 1. 포맷
  const top = t.formatMentions[0];
  if (top && t.formatMentionedIn >= 3) {
    const want = FORMAT_OF[top.format];
    const share = top.count / t.formatMentionedIn;
    if (want === "blog") {
      rows.push({ id: "format", title: "많이 쓴 포맷", trend: `포맷을 말한 후기 ${t.formatMentionedIn}건 중 ${top.count}건(${pct(share)})이 블로그`, mine: input.blogConnected ? `블로그 글 ${a.blog?.count ?? 0}개` : "블로그 연결 전", status: input.blogConnected && (a.blog?.count ?? 0) > 0 ? "ok" : "gap", fix: "perf", todo: "블로그를 연결하고 활동과 이어지는 글을 1개 올려 보세요" });
    } else if (want) {
      const mine = a.insta.mix.find((m) => m.format === want);
      rows.push({
        id: "format",
        title: "많이 쓴 포맷",
        trend: `포맷을 말한 후기 ${t.formatMentionedIn}건 중 ${top.count}건(${pct(share)})이 ${top.format}`,
        mine: a.insta.count ? (mine ? `${FORMAT_LABEL[want]} ${mine.count}개 (내 게시물의 ${pct(mine.share)})` : `${FORMAT_LABEL[want]} 0개`) : "올린 게시물 기록 없음",
        status: mine && mine.share >= 0.3 ? "ok" : "gap",
        fix: "perf",
        todo: `업로드 일정에서 ${FORMAT_LABEL[want]} 비중을 늘려 보세요`,
      });
    }
  }
  // 2. 사전 제작 콘텐츠
  const e2 = el("E2");
  if (e2) {
    const posts = a.insta.count + (a.blog?.count ?? 0);
    rows.push({ id: "premade", title: "지원 전에 올린 콘텐츠", trend: `이 요인을 언급한 후기 ${e2.n}건 중 ${pct(e2.strongShare)}가 지원 전 콘텐츠를 강하게 보여 줌`, mine: `기록된 콘텐츠 ${posts}개`, status: posts >= 3 ? "ok" : "gap", fix: "perf", todo: "지원 전에 활동 주제로 콘텐츠 3개를 먼저 올려 두세요" });
  }
  // 3. 운영 성과 숫자
  const e1 = el("E1");
  if (e1) {
    const has = a.insta.avgViews > 0;
    rows.push({ id: "result", title: "운영 성과 숫자", trend: `이 요인을 언급한 후기 ${e1.n}건 중 ${pct(e1.strongShare)}가 조회수·팔로워 같은 숫자로 성과를 보여 줌`, mine: has ? `평균 조회수 ${a.insta.avgViews.toLocaleString("ko-KR")}${a.insta.engagement !== undefined ? ` · 반응률 ${(a.insta.engagement * 100).toFixed(1)}%` : ""}` : "성과 숫자 없음", status: has ? "ok" : "gap", fix: "perf", todo: "올린 게시물의 조회수·저장 수를 넣으면 지원서에 쓸 성과 문장이 생겨요" });
  }
  // 4. 브랜드 이해
  const e5 = el("E5");
  if (e5) {
    const words = input.brandWords.filter((w) => w.length >= 2);
    const inBio = words.some((w) => bio.includes(w));
    const inBlog = (a.blog?.brandPosts.length ?? 0) > 0;
    rows.push({ id: "brand", title: "브랜드와 이어짐", trend: `이 요인을 언급한 후기 ${e5.n}건 중 ${pct(e5.strongShare)}가 브랜드 이해를 강하게 보여 줌`, mine: [inBio ? "소개글에 브랜드 있음" : "소개글에 브랜드 없음", input.blogConnected ? `브랜드 글 ${a.blog?.brandPosts.length ?? 0}개` : ""].filter(Boolean).join(" · "), status: inBio || inBlog ? "ok" : "gap", fix: "profile", todo: "소개글에 브랜드나 관심 분야를 한 줄 넣어 보세요" });
  }
  // 5. 진정성·스토리
  const e8 = el("E8");
  if (e8) {
    const who = /대학생|학생|\d{2}학번|대학교|학과|전공/.test(bio);
    rows.push({ id: "story", title: "누구인지 보이는 계정", trend: `이 요인을 언급한 후기 ${e8.n}건 중 ${pct(e8.strongShare)}가 자기 이야기를 강하게 보여 줌`, mine: who ? "소개글에 누구인지 보임" : bio ? "소개글에 누구인지 안 보임" : "소개글 없음", status: who ? "ok" : "gap", fix: "profile", todo: "‘대학생’, 학과처럼 누구인지 보이는 말을 소개글에 넣어 보세요" });
  }
  // 6. 새 계정
  if (t.newAccount.mentioned >= 3) {
    rows.push({ id: "newaccount", title: "새로 만든 계정", trend: `계정을 말한 후기 ${t.newAccount.mentioned}건 중 ${t.newAccount.yes}건이 새 계정으로 합격`, mine: p?.followers !== undefined ? `팔로워 ${p.followers.toLocaleString("ko-KR")}명` : "팔로워 수는 공식 연결 때 보여요", status: "info" });
  }
  return rows;
}
