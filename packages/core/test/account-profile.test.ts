import { describe, it, expect } from "vitest";
import { checkProfile, suggestProfile, BIO_MAX } from "../src/account/index.js";

const ctx = { activityName: "삼성전자 공식 서포터즈 5기", brand: "삼성전자", interests: ["테크"] };

describe("checkProfile", () => {
  it("빈 프로필은 소개글·링크·이름이 모두 할 일로 나온다", () => {
    const c = checkProfile({ source: "manual", at: "2026-11-23" }, ctx);
    expect(c.filter((x) => !x.ok).map((x) => x.id)).toEqual(["bio", "who", "fit", "link", "name"]);
    expect(c.every((x) => x.ok || x.tip)).toBe(true);
  });
  it("대학생·브랜드가 들어간 소개글과 링크가 있으면 통과", () => {
    const c = checkProfile({ source: "manual", at: "", username: "chae.tech", name: "채령 | 대학생 테크", bio: "테크 좋아하는 대학생\n삼성전자 신제품 리뷰", website: "https://notion.so/x" }, ctx);
    expect(c.every((x) => x.ok)).toBe(true);
  });
  it("150자 넘는 소개글과 잘못된 아이디를 잡는다", () => {
    const c = checkProfile({ source: "manual", at: "", username: "Chae..tech", bio: "가".repeat(BIO_MAX + 5) }, ctx);
    expect(c.find((x) => x.id === "bio")?.tip).toContain("5자");
    expect(c.find((x) => x.id === "username")?.ok).toBe(false);
  });
  it("연결된 계정은 사진·게시물 수도 본다", () => {
    const c = checkProfile({ source: "instagram", at: "", hasPicture: false, mediaCount: 1 }, ctx);
    expect(c.find((x) => x.id === "picture")?.ok).toBe(false);
    expect(c.find((x) => x.id === "posts")?.ok).toBe(false);
  });
});

describe("suggestProfile", () => {
  it("소개글 추천은 150자 이하이고 활동 이름이 들어간다", () => {
    const s = suggestProfile({ source: "manual", at: "", name: "채령" }, ctx);
    expect(s.bios).toHaveLength(3);
    for (const b of s.bios) {
      expect(b.text.length).toBeLessThanOrEqual(BIO_MAX);
      expect(b.text).toContain("삼성전자");
    }
    expect(s.names[0]).toBe("채령 | 대학생 테크");
  });
});
