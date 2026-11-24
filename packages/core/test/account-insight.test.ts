import { describe, it, expect } from "vitest";
import { blogIdOf, parseBlogRss, analyzeAccount, compareWithTrends, type TrendLike } from "../src/account/index.js";

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>채령의 블로그</title>
<item><title><![CDATA[삼성전자 갤럭시 버즈 한 달 사용기]]></title><link><![CDATA[https://blog.naver.com/chae_blog/2234?fromRss=true&trackingCode=rss]]></link><category><![CDATA[리뷰]]></category><pubDate>Sun, 22 Nov 2026 21:10:00 +0900</pubDate></item>
<item><title>시험 기간 &amp; 도서관 루틴</title><link>https://blog.naver.com/chae_blog/2233</link><category>일상</category><pubDate>Sat, 31 Oct 2026 23:30:00 +0900</pubDate></item>
<item><title>날짜 없는 글</title><link>https://blog.naver.com/chae_blog/1</link></item>
</channel></rss>`;

describe("블로그", () => {
  it("아이디를 여러 모양에서 꺼낸다", () => {
    expect(blogIdOf("chae_blog")).toBe("chae_blog");
    expect(blogIdOf("https://m.blog.naver.com/Chae_Blog/2234")).toBe("chae_blog");
    expect(blogIdOf("blog.naver.com/chae_blog")).toBe("chae_blog");
    expect(blogIdOf("이건 아님")).toBeNull();
  });
  it("RSS에서 제목·주소·한국 날짜·카테고리만 꺼낸다", () => {
    const posts = parseBlogRss(RSS);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toEqual({ title: "삼성전자 갤럭시 버즈 한 달 사용기", link: "https://blog.naver.com/chae_blog/2234", date: "2026-11-22", category: "리뷰" });
    expect(posts[1]!.title).toBe("시험 기간 & 도서관 루틴");
  });
});

const media = [
  { date: "2026-11-20", format: "reels" as const, views: 1200, likes: 80, comments: 5, saves: 15 },
  { date: "2026-11-13", format: "reels" as const, views: 800, likes: 40, comments: 2, saves: 8 },
  { date: "2026-11-10", format: "cardnews" as const, views: 300, likes: 20, comments: 0, saves: 10 },
];

describe("analyzeAccount", () => {
  it("업로드 주기·포맷 비율·반응률·블로그 브랜드 글을 계산한다", () => {
    const a = analyzeAccount({ media, blog: parseBlogRss(RSS), brandWords: ["삼성전자"], today: "2026-11-24" });
    expect(a.insta.count).toBe(3);
    expect(a.insta.sinceLast).toBe(4);
    expect(a.insta.mix[0]).toMatchObject({ format: "reels", count: 2 });
    expect(a.insta.best?.views).toBe(1200);
    expect(a.insta.engagement).toBeGreaterThan(0);
    expect(a.blog?.brandPosts).toHaveLength(1);
    expect(a.blog?.categories.map((c) => c.name)).toEqual(["리뷰", "일상"]);
  });
  it("데이터가 없으면 0으로, 지어낸 값 없이", () => {
    const a = analyzeAccount({ media: [], brandWords: [], today: "2026-11-24" });
    expect(a.insta).toMatchObject({ count: 0, avgViews: 0, mix: [] });
    expect(a.insta.engagement).toBeUndefined();
    expect(a.blog).toBeUndefined();
  });
});

const trend: TrendLike = {
  sampleSize: 12,
  elementAverages: [
    { code: "E1", avg: 1.2, strongShare: 0.5, n: 10 },
    { code: "E2", avg: 1.5, strongShare: 0.7, n: 10 },
    { code: "E5", avg: 1.1, strongShare: 0.4, n: 10 },
    { code: "E8", avg: 1.3, strongShare: 0.6, n: 2 },
  ],
  formatMentions: [{ format: "숏폼", count: 6 }, { format: "카드뉴스", count: 3 }],
  formatMentionedIn: 8,
  newAccount: { yes: 2, mentioned: 4 },
};

describe("compareWithTrends", () => {
  it("항목마다 후기 건수와 내 상태를 맞대고, 건수가 적은 항목(E8 n=2)은 빼낸다", () => {
    const a = analyzeAccount({ media, brandWords: ["삼성전자"], today: "2026-11-24" });
    const rows = compareWithTrends({ trend, analysis: a, brandWords: ["삼성전자"], blogConnected: false, profile: { source: "manual", at: "", bio: "테크 좋아하는 대학생" } });
    expect(rows.map((r) => r.id)).toEqual(["format", "premade", "result", "brand", "newaccount"]);
    expect(rows.find((r) => r.id === "format")).toMatchObject({ status: "ok", trend: expect.stringContaining("8건 중 6건") });
    expect(rows.find((r) => r.id === "premade")?.status).toBe("ok");
    expect(rows.find((r) => r.id === "brand")).toMatchObject({ status: "gap", fix: "profile" });
    expect(rows.find((r) => r.id === "newaccount")?.status).toBe("info");
  });
  it("경향 데이터가 없으면 비교하지 않는다", () => {
    const a = analyzeAccount({ media: [], brandWords: [], today: "2026-11-24" });
    expect(compareWithTrends({ trend: { ...trend, sampleSize: 0 }, analysis: a, brandWords: [], blogConnected: false })).toEqual([]);
  });
});
