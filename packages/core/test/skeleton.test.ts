import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeNotice } from "../src/notice/index.js";
import { buildSkeleton, classifyQuestion, parseCharLimit } from "../src/skeleton/index.js";

const notice = analyzeNotice(readFileSync(new URL("./fixtures/notice.txt", import.meta.url), "utf8"), { referenceYear: 2026 });

describe("skeleton", () => {
  it("문항 유형을 분류하고 글자 수를 읽는다", () => {
    expect(classifyQuestion("지원하게 된 동기를 작성해 주세요")).toBe("motivation");
    expect(classifyQuestion("본인의 역량과 경험")).toBe("competency");
    expect(classifyQuestion("만들고 싶은 SNS 콘텐츠 아이디어")).toBe("content_idea");
    expect(parseCharLimit("(500자)")).toBe(500);
  });

  it("공고 문항으로 뼈대를 만들고 성과가 있는 경험을 추천한다", () => {
    const s = buildSkeleton({
      questions: [],
      notice,
      profile: {
        experiences: [
          { title: "개인 맛집 블로그", description: "식품 리뷰 블로그 운영", metrics: ["월 방문자 1.2만"] },
          { title: "과 학생회 기획국", description: "축제 기획" },
        ],
        channels: [{ platform: "instagram" }],
      },
    });
    expect(s.sections).toHaveLength(3);
    const comp = s.sections.find((x) => x.type === "competency")!;
    expect(comp.emphasize.map((e) => e.code)).toContain("E1");
    expect(comp.suggestedExperiences[0]?.title).toBe("개인 맛집 블로그");
    expect(s.sections.every((x) => x.structure.length >= 3)).toBe(true);
  });

  it("성과 숫자가 없으면 전체 조언에 알려 준다", () => {
    const s = buildSkeleton({ questions: ["지원 동기"], profile: { experiences: [] }, notice });
    expect(s.overall.join(" ")).toContain("숫자로 말할 수 있는 성과");
    expect(s.overall.join(" ")).toContain("SNS 링크");
  });
});
