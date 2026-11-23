import { account } from "@supportlab/core";
import type { Activity, User } from "@/lib/repo";
import { saveProfileAction, disconnectIgAction } from "@/lib/actions";
import { fetchIgProfile, igLoginReady } from "@/lib/igprofile";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./Pending";

const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
const MSG: Record<string, [boolean, string]> = {
  saved: [true, "프로필을 저장했어요. 아래 점검 결과가 바뀌었어요."],
  disconnected: [true, "공식 연결을 끊었어요. 아이디와 옮겨 적은 프로필은 남아 있어요."],
  ok: [true, "인스타 계정을 연결했어요. 성과 숫자를 자동으로 가져와요."],
  error: [false, "인스타 연결을 마치지 못했어요. 프로페셔널 계정인지 확인하고 다시 시도해 주세요."],
};

/**
 * 성과 화면의 '계정 관리': 이미 있는 계정을 연결하고, 프로필(아이디·이름·소개글·링크)을 점검하고, 바꿀 만한 추천을 준다.
 * 인스타 API는 프로필을 읽기만 할 수 있어서, 고치는 건 사용자가 앱에서 직접 한다 (추천은 복사해서 붙여넣기).
 */
export async function AccountPanel({ user, act, others, msg }: { user: User; act: Activity; others: Activity[]; msg?: string }) {
  const live = await fetchIgProfile(user);
  // 이 서포터즈에 저장한 게 없으면 다른 서포터즈에서 옮겨 적은 프로필을 쓴다 (같은 계정을 쓰니까)
  const saved = act.accountKit?.profile ?? others.find((a) => a.accountKit?.profile)?.accountKit?.profile;
  const handle = live?.username ?? user.ig?.username ?? saved?.username ?? user.igHandle;
  // 연결돼 있어도 소개글·링크 필드를 못 받으면 옮겨 적은 값으로 채운다
  const profile: account.AccountProfile = live
    ? { ...live, bio: live.bio ?? saved?.bio, website: live.website ?? saved?.website, interest: saved?.interest }
    : { ...(saved ?? { source: "manual" as const, at: "" }), username: handle };
  const ctx: account.ProfileContext = { activityName: act.name, brand: act.name.split(/\s+/)[0] ?? "", interests: profile.interest ? [profile.interest] : undefined };
  const hasAny = !!(handle || profile.bio || profile.website);
  const checks = hasAny ? account.checkProfile(profile, ctx) : [];
  const todo = checks.filter((c) => !c.ok);
  const sug = account.suggestProfile(profile, ctx);
  const ready = igLoginReady();
  const m = msg ? (MSG[msg] ?? [false, msg]) : undefined;

  return (
    <section id="account" className="card acct">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="grid" style={{ gap: 2 }}>
          <h2 style={{ margin: 0 }}>계정 관리</h2>
          <span className="small muted">서포터즈 활동에 쓰는 인스타 계정을 연결하고 프로필을 다듬어요</span>
        </div>
        {user.ig ? <span className="tag pill k-post">공식 연결됨</span> : handle ? <span className="tag pill">아이디로 연결됨</span> : <span className="tag pill">연결 전</span>}
      </div>
      {m && <p className={m[0] ? "note ok" : "note warn"} role="status" style={{ margin: 0 }}>{m[1]}</p>}

      <div className="acct-grid">
        {/* 1. 연결 */}
        <div className="grid" style={{ gap: 12, alignContent: "start" }}>
          <h3 className="acct-h">1 · 내 계정 연결</h3>
          {user.ig ? (
            <div className="acct-me">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {live?.picture ? <img src={live.picture} alt="" /> : <i aria-hidden="true">{(handle ?? "?").slice(0, 1).toUpperCase()}</i>}
              <div className="grid" style={{ gap: 2 }}>
                <b>@{handle}</b>
                <span className="small muted">
                  {live ? <>팔로워 {n(live.followers ?? 0)} · 게시물 {n(live.mediaCount ?? 0)}</> : "프로필을 읽지 못했어요. 연결을 다시 해 주세요"}
                </span>
              </div>
            </div>
          ) : (
            <p className="small" style={{ margin: 0 }}>이미 쓰고 있는 계정을 그대로 연결해요. 새로 만들 필요 없어요.</p>
          )}

          {!user.ig && (
            <div className="acct-opt">
              <b>공식 로그인으로 연결 <span className="tag k-post">추천</span></b>
              <span className="small">성과 숫자 자동 가져오기 · 예약 게시가 돼요. 비밀번호는 서포트랩이 받지 않아요.</span>
              <details className="small">
                <summary>연결 전에 확인할 것 (1분)</summary>
                <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li>인스타 앱 → 설정 → <b>계정 유형 및 도구 → 프로페셔널 계정으로 전환</b> (크리에이터 추천, 무료)</li>
                  <li>공개 계정으로 두기 (지원서 SNS 주소를 담당자가 열어 봐요)</li>
                  <li>아래 버튼 → 인스타 로그인 화면에서 <b>내 계정</b>으로 허용</li>
                </ol>
              </details>
              {ready ? (
                <a className="btn pri" href="/api/instagram/login">인스타그램으로 연결하기</a>
              ) : (
                <>
                  <button className="btn" type="button" disabled>인스타그램으로 연결하기</button>
                  <span className="small muted">아직 서비스 쪽 Meta 앱 설정 전이라 열리지 않아요. 지금은 아래 &lsquo;아이디로 연결&rsquo;을 써 주세요.</span>
                </>
              )}
            </div>
          )}
          {!user.ig && (
            <div className="acct-opt">
              <b>아이디로 연결 <span className="small muted">지금 바로</span></b>
              <span className="small">오른쪽 칸에 아이디를 적고 저장하면 돼요. 성과 숫자는 &lsquo;직접 넣기&rsquo;로 적어요.</span>
            </div>
          )}
          {user.ig && (
            <div className="row">
              {handle && <a className="btn" href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer">내 프로필 열기</a>}
              <form action={disconnectIgAction}>
                <button className="link-btn small" type="submit">연결 끊기</button>
              </form>
            </div>
          )}
          {!user.ig && handle && <a className="small" href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer">instagram.com/{handle} 열기</a>}
        </div>

        {/* 2. 지금 프로필 */}
        <form action={saveProfileAction} className="grid" style={{ gap: 10, alignContent: "start" }}>
          <h3 className="acct-h">2 · 지금 프로필</h3>
          {user.ig && live ? (
            <p className="small muted" style={{ margin: 0 }}>인스타에서 읽어 왔어요. 인스타는 다른 앱이 프로필을 바꾸지 못하게 해서, 고칠 땐 앱에서 직접 바꿔요.{live.bio === undefined && " 소개글·링크는 이 계정에서 읽을 수 없어서 아래에 옮겨 적어 주세요."}</p>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>인스타 앱의 <b>프로필 편집</b> 화면에 있는 그대로 옮겨 적어 주세요. 점검과 추천에만 써요.</p>
          )}
          <label>아이디<input type="text" name="username" defaultValue={handle ?? ""} readOnly={!!user.ig} placeholder="@chae.tech 또는 instagram.com/chae.tech" maxLength={60} autoCapitalize="none" /></label>
          <label>이름 칸<input type="text" name="name" defaultValue={profile.name ?? ""} readOnly={!!live} placeholder="예: 채령 | 대학생 테크 리뷰" maxLength={30} /></label>
          <label>소개글 <span className="small muted">({(profile.bio ?? "").length}/{account.BIO_MAX}자)</span>
            <textarea name="bio" defaultValue={profile.bio ?? ""} readOnly={!!live?.bio} rows={4} maxLength={300} placeholder={"예:\n테크 좋아하는 컴퓨터학과 대학생\n신제품을 대학생 시선으로 리뷰해요"} />
          </label>
          <label>프로필 링크<input type="text" name="website" defaultValue={profile.website ?? ""} readOnly={!!live?.website} placeholder="예: notion.so/chae-portfolio" maxLength={300} /></label>
          <label>내 관심 분야 <span className="small muted">(추천 문구에만 써요)</span><input type="text" name="interest" defaultValue={profile.interest ?? ""} placeholder="예: 테크, 카페, 자취 요리" maxLength={20} /></label>
          <SubmitButton className="btn pri" pendingText="저장 중…">{user.ig ? "저장" : "아이디·프로필 저장"}</SubmitButton>
          {user.ig && <a className="btn" href="https://www.instagram.com/accounts/edit/" target="_blank" rel="noreferrer">인스타에서 프로필 편집 열기</a>}
        </form>

        {/* 3. 점검 */}
        <div className="grid" style={{ gap: 10, alignContent: "start" }}>
          <h3 className="acct-h">3 · 점검 {hasAny && <span className="small muted">할 일 {todo.length}개</span>}</h3>
          {!hasAny ? (
            <p className="small muted" style={{ margin: 0 }}>계정을 연결하거나 프로필을 옮겨 적으면, 지원서 낼 때 담당자가 볼 부분을 점검해요.</p>
          ) : (
            <ul className="acct-checks">
              {checks.map((c) => (
                <li key={c.id} className={c.ok ? "ok" : "todo"}>
                  <span aria-hidden="true">{c.ok ? "✓" : "!"}</span>
                  <div><b>{c.label}</b>{!c.ok && c.tip && <><br /><span className="small">{c.tip}</span></>}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 4. 추천 */}
      <details className="acct-sug" open={hasAny && todo.some((t) => t.id === "bio" || t.id === "who" || t.id === "fit" || t.id === "name" || t.id === "link")}>
        <summary><b>4 · 바꿀 만한 추천</b> <span className="small muted">소개글 · 이름 칸 · 링크 · 하이라이트 — 복사해서 인스타 앱에 붙여넣어요</span></summary>
        <div className="acct-sug-grid">
          <div className="grid" style={{ gap: 8 }}>
            <b className="small">소개글</b>
            {sug.bios.map((b) => (
              <div key={b.concept} className="acct-bio">
                <span className="tag">{b.concept}</span>
                <pre>{b.text}</pre>
                <div className="row between"><span className="small muted">{b.text.length}/{account.BIO_MAX}자</span><CopyButton text={b.text} /></div>
              </div>
            ))}
            <span className="small muted">내 말투로 한 줄은 꼭 고쳐 주세요. 없는 경력이나 숫자는 넣지 않았어요.</span>
          </div>
          <div className="grid" style={{ gap: 12, alignContent: "start" }}>
            <div className="grid" style={{ gap: 6 }}>
              <b className="small">이름 칸 <span className="muted">(검색에 걸려요)</span></b>
              {sug.names.map((x) => <div key={x} className="row between acct-line"><span>{x}</span><CopyButton text={x} /></div>)}
            </div>
            <div className="grid" style={{ gap: 6 }}>
              <b className="small">프로필 링크로 걸 것</b>
              <ul className="clean small" style={{ margin: 0 }}>{sug.links.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div className="grid" style={{ gap: 6 }}>
              <b className="small">하이라이트</b>
              <div className="row">{sug.highlights.map((h) => <span key={h} className="tag">{h}</span>)}</div>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
