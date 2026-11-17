import { describe, expect, it } from "vitest";
import { AnthropicClient, OllamaClient, MockLLM, type LLMRequest } from "../src/llm/index.js";
import { cleanOcr, ocrWithLLM, pickPosterImages, withImageText } from "../src/notice/ocr.js";
import { analyzeNotice } from "../src/notice/index.js";

const PAGE = `<html><head><meta property="og:image" content="https://cdn.x.com/upload/poster_main.jpg"></head><body>
<img src="/static/logo.png" alt="링커리어 로고" width="120" height="40">
<img src="/icons/share.svg">
<img src="https://cdn.x.com/upload/editor/detail_1.png" alt="공고 상세" width="800">
<img src="https://ads.x.com/ads/banner.jpg" width="728" height="90">
<img src="https://cdn.x.com/upload/editor/detail_2.png">
<img data-src="https://cdn.x.com/img/btn_apply.png">
</body></html>`;

describe("포스터 고르기", () => {
  it("og:image와 본문 큰 이미지를 먼저, 로고·아이콘·광고·버튼은 뺀다", () => {
    const r = pickPosterImages(PAGE, "https://linkareer.com/activity/1", 3);
    expect(r).toEqual(["https://cdn.x.com/upload/poster_main.jpg", "https://cdn.x.com/upload/editor/detail_1.png", "https://cdn.x.com/upload/editor/detail_2.png"]);
  });
});

describe("이미지 글자 합치기", () => {
  it("본문에 이미 있는 줄은 빼고, 이미지별로 표시해서 붙인다. 그러면 규칙 분석이 마감일을 찾는다", () => {
    const body = "갤럭시 대학생 서포터즈 7기 모집\n자세한 내용은 이미지를 확인하세요";
    const merged = withImageText(body, ["갤럭시 대학생 서포터즈 7기 모집\n모집 기간: 2026.11.09 ~ 2026.11.30\n지원서 문항\n1. 자기소개 (500자 이내)", "", "짧음"]);
    expect(merged).toContain("[공고 이미지 1에서 읽은 글]");
    expect(merged.match(/갤럭시 대학생 서포터즈 7기 모집/g)).toHaveLength(1);
    expect(merged).not.toContain("[공고 이미지 2");
    const a = analyzeNotice(merged, { referenceYear: 2026 });
    expect(a.deadline).toBe("2026-11-30");
  });
  it("코드 블록과 연속 빈 줄을 정리한다", () => {
    expect(cleanOcr("```\n가  나\n\n\n다\n```")).toBe("가 나\n\n다");
  });
});

describe("이미지를 AI에 보내기", () => {
  it("Claude: 이미지 블록 + 글 블록으로 보낸다", async () => {
    let body: any;
    const fake = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ content: [{ type: "text", text: "모집 기간: 11.30" }], usage: { input_tokens: 1500, output_tokens: 20 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new AnthropicClient("k", "claude-haiku-5-5", { fetchImpl: fake });
    expect(c.vision).toBe(true);
    const r = await ocrWithLLM([{ mediaType: "image/png", data: "AAAA" }], c);
    expect(body.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
    expect(body.messages[0].content[1].type).toBe("text");
    expect(r).toEqual({ texts: ["모집 기간: 11.30"], usage: { inputTokens: 1500, outputTokens: 20 } });
  });
  it("Ollama: 메시지에 images(base64)를 붙인다", async () => {
    const orig = globalThis.fetch;
    let body: any;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ message: { content: "글자" } }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await new OllamaClient().complete({ system: "s", user: "u", maxOutputTokens: 10, images: [{ mediaType: "image/jpeg", data: "BBBB" }] });
      expect(body.messages[1].images).toEqual(["BBBB"]);
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("한 장이 실패해도 나머지는 읽는다", async () => {
    let n = 0;
    const llm = new MockLLM((req: LLMRequest) => {
      n++;
      if (n === 1) throw new Error("x");
      return `이미지 ${req.images?.length}장`;
    });
    const r = await ocrWithLLM([{ mediaType: "image/png", data: "a" }, { mediaType: "image/png", data: "b" }], llm);
    expect(r.texts).toEqual(["", "이미지 1장"]);
  });
});

describe("포스터식 한 줄 항목", () => {
  it("'우대 사항: …', '혜택: …', '활동 내용: …' 한 줄짜리도 읽는다", () => {
    const a = analyzeNotice("서포터즈 모집\n모집 기간: 2026.11.09 ~ 2026.11.30\n활동 내용: 제품 활용 콘텐츠 제작\n우대 사항: SNS 콘텐츠 제작 경험자\n혜택: 월 활동비 20만원, 수료증 발급", { referenceYear: 2026 });
    expect(a.preferred).toEqual(["SNS 콘텐츠 제작 경험자"]);
    expect(a.benefits[0]).toContain("월 활동비");
    expect(a.activities).toEqual(["제품 활용 콘텐츠 제작"]);
  });
});
