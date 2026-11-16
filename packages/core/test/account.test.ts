import { describe, expect, it } from "vitest";
import { buildAccountKit, validateUsername, BIO_MAX } from "../src/account/index.js";

const input = { activityName: "달콤제과 서포터즈 13기", brand: "달콤제과", field: "F&B·식품", nickname: "Chae Ryeong", interests: ["자취 요리"] };

describe("account", () => {
  it("아이디 규칙을 검사한다", () => {
    expect(validateUsername("chae.snack")).toEqual([]);
    expect(validateUsername(".bad")).not.toEqual([]);
    expect(validateUsername("a..b")).not.toEqual([]);
    expect(validateUsername("Upper")).not.toEqual([]);
    expect(validateUsername("a".repeat(31))).not.toEqual([]);
  });

  it("계정 키트: 규칙에 맞는 아이디, 150자 이내 소개글, 9칸 그리드", () => {
    const kit = buildAccountKit(input, 1);
    expect(kit.usernames.length).toBeGreaterThanOrEqual(3);
    expect(kit.usernames.every((u) => validateUsername(u).length === 0)).toBe(true);
    expect(kit.usernames[0]).toBe("chae_ryeong.snack");
    expect([...kit.bio].length).toBeLessThanOrEqual(BIO_MAX);
    expect(kit.bio).toContain("달콤제과 서포터즈 13기");
    expect(kit.grid).toHaveLength(9);
    for (let row = 0; row < 3; row++) {
      const formats = kit.grid.slice(row * 3, row * 3 + 3).map((c) => c.format);
      expect(new Set(formats).size).toBeGreaterThanOrEqual(2);
    }
    expect(kit.professionalChecklist[0]?.step).toContain("프로페셔널");
  });
});
