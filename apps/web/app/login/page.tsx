import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { loginAction } from "@/lib/actions";
import { SubmitButton } from "@/components/Pending";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; id?: string; bye?: string; next?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error, id, bye, next } = await searchParams;
  return (
    <div className="auth-wrap">
      <form action={loginAction} className="card hi auth-card">
        <span className="eyebrow">서포트랩</span>
        <h1>로그인</h1>
        {bye && !error && <p className="note ok" style={{ margin: 0 }}>로그아웃했어요.</p>}
        {error && <p className="note warn" role="alert" style={{ margin: 0 }}>{error}</p>}
        <input type="hidden" name="next" value={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
        <label>
          아이디
          <input type="text" name="loginId" defaultValue={id} required autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus={!id} />
        </label>
        <label>
          비밀번호
          <input type="password" name="password" required autoComplete="current-password" autoFocus={!!id} />
        </label>
        <SubmitButton pendingText="로그인하는 중…">로그인</SubmitButton>
        <p className="small" style={{ margin: 0 }}>아직 계정이 없나요? <Link href="/"><b>회원가입</b></Link></p>
        <p className="small muted" style={{ margin: 0 }}>비밀번호를 잊었다면 운영진에게 알려 주세요. (데모 버전이라 비밀번호 찾기는 아직 없어요)</p>
      </form>
    </div>
  );
}
