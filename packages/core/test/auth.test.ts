import { describe, expect, it } from "vitest";
import { LoginThrottle, validateLoginId, validatePassword } from "../src/auth/index.js";
import { createSessionToken, hashPassword, readSessionToken, verifyPassword } from "../src/auth/node.js";

describe("아이디·비밀번호 규칙", () => {
  it("아이디는 소문자로 바꾸고 형식을 본다", () => {
    expect(validateLoginId(" ChaeRyeong ")).toEqual({ ok: true, value: "chaeryeong" });
    expect(validateLoginId("abc").ok).toBe(false);
    expect(validateLoginId("1abcd").ok).toBe(false);
    expect(validateLoginId("chae-ryeong").ok).toBe(false);
    expect(validateLoginId("한글아이디").ok).toBe(false);
  });
  it("비밀번호는 8자 이상, 영문+숫자, 아이디를 넣지 않는다", () => {
    expect(validatePassword("abcd1234").ok).toBe(true);
    expect(validatePassword("abc123").ok).toBe(false);
    expect(validatePassword("abcdefgh").ok).toBe(false);
    expect(validatePassword("12345678").ok).toBe(false);
    expect(validatePassword("chaeryeong1", "chaeryeong").ok).toBe(false);
  });
});

describe("비밀번호 해시", () => {
  it("같은 비밀번호도 매번 다른 해시가 되고, 맞는 비밀번호만 통과한다", async () => {
    const h1 = await hashPassword("abcd1234");
    const h2 = await hashPassword("abcd1234");
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain("abcd1234");
    expect(h1.startsWith("scrypt$16384$")).toBe(true);
    expect(await verifyPassword("abcd1234", h1)).toBe(true);
    expect(await verifyPassword("abcd1235", h1)).toBe(false);
    expect(await verifyPassword("abcd1234", undefined)).toBe(false);
    expect(await verifyPassword("abcd1234", "garbage")).toBe(false);
  });
});

describe("로그인 토큰", () => {
  const secret = "test-secret";
  it("서명이 맞고 만료 전이면 사용자 ID를 돌려준다", () => {
    const t = createSessionToken("7b1c-uuid", secret, 60, 1_000_000);
    expect(readSessionToken(t, secret, 1_000_000)).toBe("7b1c-uuid");
  });
  it("만료됐거나, 비밀값이 다르거나, 사용자 ID를 바꾸면 거절한다", () => {
    const t = createSessionToken("user-a", secret, 60, 1_000_000);
    expect(readSessionToken(t, secret, 1_000_000 + 61_000)).toBeUndefined();
    expect(readSessionToken(t, "other", 1_000_000)).toBeUndefined();
    expect(readSessionToken(t.replace("user-a", "user-b"), secret, 1_000_000)).toBeUndefined();
    expect(readSessionToken("user-a", secret)).toBeUndefined();
    expect(readSessionToken(undefined, secret)).toBeUndefined();
  });
});

describe("로그인 시도 제한", () => {
  it("5번 틀리면 5분 잠기고, 시간이 지나면 풀린다", () => {
    let t = 0;
    const th = new LoginThrottle(5, 300_000, () => t);
    for (let i = 0; i < 4; i++) th.fail("a");
    expect(th.lockedFor("a")).toBe(0);
    th.fail("a");
    expect(th.lockedFor("a")).toBe(300);
    t = 300_001;
    expect(th.lockedFor("a")).toBe(0);
    th.fail("b");
    th.success("b");
    expect(th.lockedFor("b")).toBe(0);
  });
});

import { parseIdList, rolesFor } from "../src/auth/index.js";

describe("권한", () => {
  const lists = { admins: parseIdList(" Chaeryeong, boss "), team: parseIdList("member1,member2\nmember3") };
  it("환경 변수 목록을 소문자로 읽는다", () => {
    expect([...lists.admins]).toEqual(["chaeryeong", "boss"]);
    expect(lists.team.size).toBe(3);
    expect(parseIdList(undefined).size).toBe(0);
  });
  it("관리자는 팀 권한도 갖고, 목록에 없거나 아이디가 없으면 권한이 없다", () => {
    expect(rolesFor("CHAERYEONG", lists)).toEqual(["admin", "team"]);
    expect(rolesFor("member2", lists)).toEqual(["team"]);
    expect(rolesFor("someone", lists)).toEqual([]);
    expect(rolesFor(undefined, lists)).toEqual([]);
  });
});
