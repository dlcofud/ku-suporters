/**
 * 아이디·비밀번호 규칙 (브라우저에서도 쓸 수 있는 순수 함수).
 * 비밀번호 해시와 로그인 토큰은 서버 전용 auth/node.ts 에 있다.
 */

/** 아이디: 영문 소문자로 시작, 영문 소문자·숫자·밑줄 4~20자 */
export function validateLoginId(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim().toLowerCase();
  if (v.length < 4 || v.length > 20) return { ok: false, error: "아이디는 4~20자로 정해 주세요." };
  if (!/^[a-z][a-z0-9_]*$/.test(v)) return { ok: false, error: "아이디는 영문 소문자로 시작하고, 영문 소문자·숫자·밑줄(_)만 쓸 수 있어요." };
  return { ok: true, value: v };
}

/** 비밀번호: 8~64자, 영문과 숫자를 모두 포함, 아이디와 같으면 안 됨 */
export function validatePassword(pw: string, loginId?: string): { ok: true } | { ok: false; error: string } {
  if (pw.length < 8) return { ok: false, error: "비밀번호는 8자 이상으로 정해 주세요." };
  if (pw.length > 64) return { ok: false, error: "비밀번호는 64자 이하로 정해 주세요." };
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return { ok: false, error: "비밀번호에 영문과 숫자를 모두 넣어 주세요." };
  if (loginId && pw.toLowerCase().includes(loginId.toLowerCase())) return { ok: false, error: "비밀번호에 아이디를 넣지 말아 주세요." };
  return { ok: true };
}

/**
 * 로그인 시도 제한 (같은 아이디로 연속 실패하면 잠시 막는다).
 * 서버 메모리에만 두는 간단한 방식이라 서버가 여러 대면 대수만큼 느슨해진다.
 */
export class LoginThrottle {
  private fails = new Map<string, { count: number; until?: number }>();
  constructor(private readonly max = 5, private readonly lockMs = 5 * 60 * 1000, private readonly now = () => Date.now()) {}
  /** 잠겨 있으면 남은 초 */
  lockedFor(key: string): number {
    const f = this.fails.get(key);
    if (!f?.until) return 0;
    const left = f.until - this.now();
    if (left <= 0) {
      this.fails.delete(key);
      return 0;
    }
    return Math.ceil(left / 1000);
  }
  fail(key: string) {
    const f = this.fails.get(key) ?? { count: 0 };
    f.count++;
    if (f.count >= this.max) f.until = this.now() + this.lockMs;
    this.fails.set(key, f);
  }
  success(key: string) {
    this.fails.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* 권한                                                                 */
/* ------------------------------------------------------------------ */

/** admin: 합격 경험 검수(크레딧 지급). team: 후기 분석(팀 데이터 입력·검수). admin은 team도 된다 */
export type Role = "admin" | "team";

/** "a, B ,c" → {"a","b","c"}. 아이디는 소문자로 비교한다 */
export function parseIdList(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * 로그인 아이디로 권한을 정한다. 권한은 서버 환경 변수로만 준다 (사용자가 스스로 얻을 수 없게).
 * 아이디가 없는 예전 계정(닉네임만)은 닉네임이 겹칠 수 있어 권한을 주지 않는다.
 */
export function rolesFor(loginId: string | undefined, lists: { admins: Set<string>; team: Set<string> }): Role[] {
  if (!loginId) return [];
  const id = loginId.toLowerCase();
  const roles: Role[] = [];
  if (lists.admins.has(id)) roles.push("admin", "team");
  else if (lists.team.has(id)) roles.push("team");
  return roles;
}
