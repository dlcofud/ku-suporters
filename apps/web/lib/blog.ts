import { account } from "@supportlab/core";

/**
 * 연결한 네이버 블로그의 최근 글 목록 (공개 RSS: 제목·주소·날짜·카테고리만, 본문은 읽지 않는다).
 * 네이버 블로그는 통계·로그인 공식 API가 없어서 조회수는 가져올 수 없다. 1시간 동안 캐시한다.
 */
export async function blogPosts(id: string): Promise<{ posts: account.BlogPost[]; error?: boolean }> {
  try {
    // BLOG_RSS_BASE: 로컬 테스트용 (예: http://localhost:4010). 배포에선 쓰지 않는다
    const url = process.env.BLOG_RSS_BASE ? `${process.env.BLOG_RSS_BASE}/${encodeURIComponent(id)}.xml` : account.blogRssUrl(id);
    const r = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000), headers: { "user-agent": "SupportLab/1.0 (+https://ku-suporters.vercel.app)" } });
    if (!r.ok) return { posts: [], error: true };
    return { posts: account.parseBlogRss(await r.text()) };
  } catch {
    return { posts: [], error: true };
  }
}
