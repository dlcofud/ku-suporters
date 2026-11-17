import Link from "next/link";
import { requireUser } from "@/lib/session";

const NEED: Record<string, { name: string; env: string; what: string }> = {
  admin: { name: "검수 관리자", env: "ADMIN_LOGIN_IDS", what: "합격 경험 공유를 승인하고 크레딧을 지급하는" },
  team: { name: "후기 분석 팀", env: "TEAM_LOGIN_IDS", what: "합격 후기를 코딩하고 검수하는" },
};

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const user = await requireUser();
  const need = NEED[(await searchParams).need ?? ""] ?? NEED.admin!;
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <span className="eyebrow">권한 없음</span>
      <h1>{need.name}만 들어올 수 있어요</h1>
      <p style={{ margin: 0 }}>이 화면은 {need.what} 곳이에요. 다른 사용자의 자료와 크레딧이 걸려 있어서 정해진 사람만 쓸 수 있어요.</p>
      {user.loginId ? (
        <p className="small muted" style={{ margin: 0 }}>
          운영자라면 서버 환경 변수 <code>{need.env}</code>에 내 아이디 <b>{user.loginId}</b>를 넣어 달라고 요청해 주세요.
        </p>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          권한은 로그인 아이디로 줘요. 먼저 <Link href="/settings">계정 설정</Link>에서 아이디를 정해 주세요.
        </p>
      )}
      <Link className="btn" href="/">캘린더로 돌아가기</Link>
    </div>
  );
}
