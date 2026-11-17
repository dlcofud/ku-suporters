import { requireUser } from "@/lib/session";
import { credentialsAction, logout, nicknameAction } from "@/lib/actions";
import { SubmitButton } from "@/components/Pending";

const SAVED: Record<string, string> = { id: "아이디와 비밀번호를 정했어요. 이제 다른 기기에서도 로그인할 수 있어요.", pw: "비밀번호를 바꿨어요.", nick: "닉네임을 바꿨어요." };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { error, saved } = await searchParams;
  return (
    <>
      <header className="grid" style={{ gap: 4 }}>
        <span className="eyebrow">{user.nickname}</span>
        <h1>계정 설정</h1>
      </header>
      {saved && SAVED[saved] && <p className="note ok" role="status" style={{ margin: 0 }}>{SAVED[saved]}</p>}
      {error && <p className="note warn" role="alert" style={{ margin: 0 }}>{error}</p>}
      <section className="grid g2" style={{ alignItems: "start" }}>
        <form action={credentialsAction} className={user.loginId ? "card" : "card hi"}>
          {user.loginId ? (
            <>
              <h2>비밀번호 바꾸기</h2>
              <p className="small muted" style={{ margin: 0 }}>아이디: <b>{user.loginId}</b></p>
              <input type="text" name="username" value={user.loginId} autoComplete="username" readOnly hidden />
              <label>지금 비밀번호<input type="password" name="current" required autoComplete="current-password" /></label>
            </>
          ) : (
            <>
              <h2>아이디·비밀번호 정하기</h2>
              <p className="small muted" style={{ margin: 0 }}>닉네임만으로 시작한 계정이에요. 아이디와 비밀번호를 정해야 로그아웃한 뒤나 다른 기기에서 다시 들어올 수 있어요.</p>
              <label>아이디<input type="text" name="loginId" required minLength={4} maxLength={20} pattern="[A-Za-z][A-Za-z0-9_]{3,19}" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="영문 소문자로 시작, 4~20자" /></label>
            </>
          )}
          <label>새 비밀번호<input type="password" name="password" required minLength={8} maxLength={64} autoComplete="new-password" placeholder="영문+숫자 8자 이상" /></label>
          <label>새 비밀번호 확인<input type="password" name="password2" required minLength={8} maxLength={64} autoComplete="new-password" /></label>
          <SubmitButton pendingText="저장하는 중…">{user.loginId ? "비밀번호 바꾸기" : "아이디·비밀번호 정하기"}</SubmitButton>
        </form>
        <div className="grid" style={{ gap: 12 }}>
          <form action={nicknameAction} className="card">
            <h2>닉네임</h2>
            <label>화면에 보이는 이름<input type="text" name="nickname" defaultValue={user.nickname} required maxLength={20} /></label>
            <SubmitButton className="btn" pendingText="저장하는 중…">닉네임 바꾸기</SubmitButton>
          </form>
          <form action={logout} className="card">
            <h2>로그아웃</h2>
            <p className="small muted" style={{ margin: 0 }}>{user.loginId ? "다음에 아이디와 비밀번호로 다시 들어오면 돼요." : "아이디·비밀번호를 정하지 않고 로그아웃하면 이 계정으로 다시 들어올 수 없어요."}</p>
            <button className="btn warn" type="submit" style={{ alignSelf: "flex-start" }}>로그아웃</button>
          </form>
        </div>
      </section>
    </>
  );
}
