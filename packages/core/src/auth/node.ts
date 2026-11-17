/**
 * 서버 전용: 비밀번호 해시와 로그인 토큰.
 * - 비밀번호는 scrypt(솔트 16바이트, N=16384)로 해시해서 저장한다. 원문은 어디에도 남기지 않는다.
 * - 로그인 쿠키에는 "사용자ID.만료시각.서명"을 넣는다. 서명은 서버 비밀값으로 만든 HMAC이라 쿠키를 고쳐도 통과하지 못한다.
 */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 16384;
const KEYLEN = 64;

function scrypt(pw: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(pw.normalize("NFKC"), salt, KEYLEN, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));
}

/** "scrypt$16384$<salt b64>$<hash b64>" */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, N);
  return `scrypt$${N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | undefined): Promise<boolean> {
  if (!stored) {
    // 아이디가 없을 때도 비슷한 시간이 걸리게 해서, 응답 시간으로 아이디 존재 여부를 알 수 없게 한다
    await scrypt(pw, Buffer.alloc(16), N);
    return false;
  }
  const [alg, n, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const got = await scrypt(pw, Buffer.from(saltB64, "base64"), Number(n));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

/** 로그인 토큰 만들기 (기본 30일) */
export function createSessionToken(userId: string, secret: string, ttlSec = 60 * 60 * 24 * 30, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  const body = `${userId}.${exp}`;
  return `${body}.${sign(body, secret)}`;
}

/** 서명과 만료를 확인하고 사용자 ID를 돌려준다. 틀리면 undefined */
export function readSessionToken(token: string | undefined, secret: string, nowMs = Date.now()): string | undefined {
  if (!token) return undefined;
  const i = token.lastIndexOf(".");
  if (i < 0) return undefined;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const want = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  const j = body.lastIndexOf(".");
  const userId = body.slice(0, j);
  const exp = Number(body.slice(j + 1));
  if (!userId || !Number.isFinite(exp) || exp * 1000 < nowMs) return undefined;
  return userId;
}
