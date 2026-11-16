import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractNoticeFromHtml, htmlToText, detectCharset, analyzeNotice } from "../src/notice/index.js";

const NOTICE = readFileSync(new URL("./fixtures/notice.txt", import.meta.url), "utf8");
const asHtml = (t: string) => t.split("\n").map((l) => (l.startsWith("-") ? `<li>${l.slice(1).trim()}</li>` : `<p>${l}</p>`)).join("");

describe("notice/html: 공고 페이지에서 본문 뽑기", () => {
  it("일반 게시판형: 메뉴·푸터를 버리고 본문 영역을 고른다", () => {
    const html = `<html><head><title>달콤제과 서포터즈 13기 모집 | 사이트</title><script>var x=1</script></head><body>
      <nav><a>홈</a><a>대외활동</a><a>공모전</a></nav>
      <div class="board-view"><h2>달콤제과 서포터즈 13기 모집</h2>${asHtml(NOTICE)}</div>
      <footer>회사소개 이용약관 개인정보처리방침</footer></body></html>`;
    const r = extractNoticeFromHtml(html, "https://example.com/a/1");
    expect(r.title).toBe("달콤제과 서포터즈 13기 모집 | 사이트");
    expect(r.text).not.toContain("이용약관");
    expect(r.text).not.toContain("var x");
    // 뽑은 글로 분석하면 붙여넣기와 같은 마감일이 나온다
    expect(analyzeNotice(r.text, { referenceYear: 2026 }).deadline).toBe(analyzeNotice(NOTICE, { referenceYear: 2026 }).deadline);
    expect(r.imageOnly).toBe(false);
  });

  it("앱 데이터에 심어 둔 공고 (Next.js __NEXT_DATA__)", () => {
    const data = { props: { pageProps: { activity: { title: "달콤제과 서포터즈 13기", detailText: asHtml(NOTICE) } } } };
    const html = `<html><head><meta property="og:title" content="달콤제과 서포터즈 13기"></head><body><div id="__next">불러오는 중…</div>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
    const r = extractNoticeFromHtml(html);
    expect(r.source).toBe("embedded");
    expect(r.title).toBe("달콤제과 서포터즈 13기");
    expect(r.text).toContain("우대");
  });

  it("구조화 데이터 (JSON-LD)", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "t", description: asHtml(NOTICE) })}</script><body><p>짧은 글</p></body>`;
    expect(extractNoticeFromHtml(html).source).toBe("jsonld");
  });

  it("포스터 이미지뿐인 공고는 imageOnly로 알려 준다", () => {
    const html = `<body><div class="content"><img src="/poster.jpg"><p>자세한 내용은 이미지 참고</p></div></body>`;
    const r = extractNoticeFromHtml(html, "https://example.com/x");
    expect(r.imageOnly).toBe(true);
    expect(r.images).toEqual(["https://example.com/poster.jpg"]);
  });

  it("HTML 엔티티·줄바꿈 처리", () => {
    expect(htmlToText("<p>A&amp;B&nbsp;&#54620;&#xAE00;</p><ul><li>하나</li><li>둘</li></ul>")).toBe("A&B 한글\n\n- 하나\n- 둘");
  });

  it("문자 인코딩: 헤더 > meta, EUC-KR 별칭 통일", () => {
    expect(detectCharset("text/html; charset=ks_c_5601-1987", "")).toBe("euc-kr");
    expect(detectCharset(null, '<meta charset="EUC-KR">')).toBe("euc-kr");
    expect(detectCharset(null, "")).toBe("utf-8");
  });
});
