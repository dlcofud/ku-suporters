import Link from "next/link";
import { account, feedback, trends } from "@supportlab/core";
import type { Activity, User } from "@/lib/repo";
import { todayISO } from "@/lib/repo";
import { saveProfileAction, disconnectIgAction, connectInstaHandleAction, connectBlogAction, removeBlogAction, removeInstaAction } from "@/lib/actions";
import { fetchIgProfile, igLoginReady } from "@/lib/igprofile";
import { myMedia } from "@/lib/media";
import { blogPosts } from "@/lib/blog";
import { loadAllReviews } from "@/lib/trends";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./Pending";

const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
const MSG: Record<string, [boolean, string]> = {
  saved: [true, "프로필을 저장했어요. 비교·점검 결과가 바뀌었어요."],
  connected: [true, "인스타 계정을 연결했어요. 아래에서 합격 경향과 비교해 보세요."],
  removed: [true, "인스타 연결을 뺐어요."],
  blog: [true, "블로그를 연결했어요. 최근 글 목록으로 분석해요."],
  blogremoved: [true, "블로그 연결을 뺐어요."],
  disconnected: [true, "공식 연결을 끊었어요. 아이디와 옮겨 적은 프로필은 남아 있어요."],
  ok: [true, "인스타 계정을 공식으로 연결했어요. 성과 숫자를 자동으로 가져와요."],
  error: [false, "인스타 연결을 마치지 못했어요. 프로페셔널 계정인지 확인하고 다시 시도해 주세요."],
  cancel: [false, "인스타 연결을 취소했어요."],
  noaccount: [false, "로그인은 됐지만 허락한 인스타 계정을 찾지 못했어요. 로그인 중 '공유할 비즈니스 자산'에서 인스타 계정을 골랐는지, 그 계정이 앱의 Instagram 테스터인지 확인해 주세요."],
};

type Fix = "profile" | "perf";

/**
 * SNS 관리 → 계정 관리.
 * 연결 전: 1 계정 연결(인스타 공식 로그인 · 인스타 아이디 · 네이버 블로그)만 보인다.
 * 연결 뒤: 연결된 계정 → 2 합격 경향과 비교 → 3 개선하기(프로필 · 성과) → 4 분석하기.
 */
export async function AccountPanel({ user, act, others, msg, fix }: { user: User; act: Activity; others: Activity[]; msg?: string; fix?: string }) {
  const saved = act.accountKit?.profile ?? others.find((a) => a.accountKit?.profile)?.accountKit?.profile;
  const blogId = act.accountKit?.blog?.id ?? others.find((a) => a.accountKit?.blog)?.accountKit?.blog?.id;
  const m = msg ? (MSG[msg] ?? [false, msg]) : undefined;
  const note = m && <p className={m[0] ? "note ok" : "note warn"} role="status" style={{ margin: 0 }}>{m[1]}</p>;
  const handle0 = user.ig?.username ?? user.igHandle;

  if (!handle0 && !user.ig && !blogId) {
    return (
      <>
        {note}
        <section className="card acct">
          <h2 className="acct-h2">1 · 계정 연결</h2>
          <p className="small muted" style={{ margin: 0 }}>서포터즈 활동에 쓰는 계정을 연결하면 합격 경향과 비교하고, 무엇을 고치면 좋을지 알려 줘요. 이미 쓰는 계정을 그대로 연결하면 돼요.</p>
          <ConnectOptions insta instaHandle blog />
        </section>
      </>
    );
  }

  const today = todayISO();
  const [live, mediaRes, blogRes, report] = await Promise.all([
    fetchIgProfile(user),
    myMedia(user),
    blogId ? blogPosts(blogId) : Promise.resolve(undefined),
    loadAllReviews()
      .then((r) => trends.buildTrendReport(r))
      .catch(() => undefined),
  ]);
  const handle = live?.username ?? handle0;
  const instaOn = !!(handle || user.ig);
  const profile: account.AccountProfile = live
    ? { ...live, bio: live.bio ?? saved?.bio, website: live.website ?? saved?.website, interest: saved?.interest }
    : { ...(saved ?? { source: "manual" as const, at: "" }), username: handle };
  const brand = act.name.split(/\s+/)[0] ?? "";
  const brandWords = [brand, ...(profile.interest ? [profile.interest] : [])];
  const ctx: account.ProfileContext = { activityName: act.name, brand, interests: profile.interest ? [profile.interest] : undefined };
  const media = mediaRes.media;
  const analysis = account.analyzeAccount({ media, blog: blogRes?.posts, brandWords, today });
  const rows = report ? account.compareWithTrends({ trend: report, profile, analysis, brandWords, blogConnected: !!blogId }) : [];
  const checks = account.checkProfile(profile, ctx);
  const sug = account.suggestProfile(profile, ctx);
  const summary = feedback.summarize(media);
  const perfSug = act.plan ? feedback.suggest(summary, act.plan) : [];
  const start = media.map((x) => x.date).sort()[0] ?? today;
  const sentence = feedback.achievementSentence(summary, start, today);
  const perfGaps = rows.filter((r) => r.status === "gap" && r.fix === "perf");
  const blogQuiet = !!blogId && !!analysis.blog && !blogRes?.error && analysis.blog.last30 === 0;
  const profTodo = checks.filter((c) => !c.ok).length;
  const perfTodo = perfGaps.length + perfSug.filter((s) => s.kind !== "keep_format").length + (blogQuiet ? 1 : 0);
  const tab: Fix = fix === "perf" || fix === "profile" ? fix : profTodo >= perfTodo ? "profile" : "perf";
  const best = analysis.insta.best;

  return (
    <>
      {note}

      {/* 1. 연결된 계정 */}
      <section className="card acct">
        <div className="row between">
          <h2 className="acct-h2">1 · 연결된 계정</h2>
          <span className="small muted">합격 경향과 비교 → 개선하기 → 분석하기 순서로 봐요</span>
        </div>
        <div className="acct-linked">
          {instaOn && (
            <div className="acct-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {live?.picture ? <img src={live.picture} alt="" /> : <i aria-hidden="true">IG</i>}
              <div className="grid" style={{ gap: 1, minWidth: 0 }}>
                <b>@{handle}</b>
                <span className="small muted">
                  {user.ig ? (live ? `공식 연결 · 팔로워 ${n(live.followers ?? 0)} · 게시물 ${n(live.mediaCount ?? 0)}` : "공식 연결 · 프로필을 읽지 못했어요") : "아이디로 연결 · 성과는 직접 넣기"}
                </span>
              </div>
              <div className="row acct-chip-act">
                <a className="small" href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer">열기</a>
                {user.ig ? (
                  <form action={disconnectIgAction}><button className="link-btn small" type="submit">공식 연결 끊기</button></form>
                ) : (
                  <form action={removeInstaAction}><button className="link-btn small" type="submit">빼기</button></form>
                )}
              </div>
            </div>
          )}
          {blogId && (
            <div className="acct-chip">
              <i aria-hidden="true" className="blog">N</i>
              <div className="grid" style={{ gap: 1, minWidth: 0 }}>
                <b>blog.naver.com/{blogId}</b>
                <span className="small muted">{blogRes?.error ? "글 목록을 읽지 못했어요 (비공개 블로그거나 아이디가 달라요)" : `블로그 · 최근 글 ${blogRes?.posts.length ?? 0}개 읽음`}</span>
              </div>
              <div className="row acct-chip-act">
                <a className="small" href={`https://blog.naver.com/${blogId}`} target="_blank" rel="noreferrer">열기</a>
                <form action={removeBlogAction}><button className="link-btn small" type="submit">빼기</button></form>
              </div>
            </div>
          )}
        </div>
        {(!user.ig || !blogId) && (
          <details className="small">
            <summary>{!instaOn ? "인스타그램도 연결하기" : !blogId ? "블로그도 연결하기" : "인스타 공식 로그인으로 바꾸기"}</summary>
            <ConnectOptions insta={!user.ig} instaHandle={!instaOn} blog={!blogId} />
          </details>
        )}
      </section>

      {/* 2. 비교 */}
      <section className="card acct" id="compare">
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <h2 className="acct-h2">2 · 합격 경향과 내 계정 비교</h2>
          {report && report.sampleSize > 0 && <span className="small muted">합격 후기 {report.sampleSize}건 · {report.confidence.label}</span>}
        </div>
        {!rows.length ? (
          <p className="small muted" style={{ margin: 0 }}>비교할 합격 후기가 아직 모자라요. 후기가 쌓이면 항목별로 맞대 볼게요.</p>
        ) : (
          <div className="cmp" role="table" aria-label="합격 경향과 내 계정 비교">
            <div className="cmp-r cmp-head" role="row"><span role="columnheader">항목</span><span role="columnheader">합격 후기에서는</span><span role="columnheader">내 계정은</span><span role="columnheader">상태</span></div>
            {rows.map((r) => (
              <div className="cmp-r" role="row" key={r.id}>
                <b role="cell">{r.title}</b>
                <span role="cell" className="small">{r.trend}</span>
                <span role="cell" className="small">{r.mine}</span>
                <span role="cell" className="cmp-st">
                  <span className={`tag ${r.status === "ok" ? "k-post" : r.status === "gap" ? "k-hl" : ""}`}>{r.status === "ok" ? "맞아요" : r.status === "gap" ? "보완" : "참고"}</span>
                  {r.status === "gap" && r.fix && <Link className="small" href={`/account?fix=${r.fix}#improve`}>{r.fix === "profile" ? "프로필 고치기" : "성과 고치기"} →</Link>}
                </span>
              </div>
            ))}
          </div>
        )}
        <span className="small muted">후기 수는 그 항목을 다룬 후기만 세요. 3건 미만인 항목은 비교하지 않아요.</span>
      </section>

      {/* 3. 개선하기 */}
      <section className="card acct" id="improve">
        <h2 className="acct-h2">3 · 개선하기</h2>
        <nav className="seg" aria-label="개선하기">
          <Link href="/account?fix=profile#improve" className={tab === "profile" ? "on" : undefined} aria-current={tab === "profile" ? "true" : undefined}>프로필 {profTodo > 0 && <em>{profTodo}</em>}</Link>
          <Link href="/account?fix=perf#improve" className={tab === "perf" ? "on" : undefined} aria-current={tab === "perf" ? "true" : undefined}>성과 {perfTodo > 0 && <em>{perfTodo}</em>}</Link>
        </nav>

        {tab === "profile" ? (
          <>
            <div className="acct-grid two">
              <form action={saveProfileAction} className="grid" style={{ gap: 10, alignContent: "start" }}>
                <h3 className="acct-h">지금 프로필</h3>
                {user.ig && live ? (
                  <p className="small muted" style={{ margin: 0 }}>인스타에서 읽어 왔어요. 인스타는 다른 앱이 프로필을 바꾸지 못하게 해서, 고칠 땐 앱에서 직접 바꿔요.</p>
                ) : (
                  <p className="small muted" style={{ margin: 0 }}>인스타 앱의 <b>프로필 편집</b> 화면에 있는 그대로 옮겨 적어 주세요. 점검과 추천에만 써요.</p>
                )}
                <label>아이디<input type="text" name="username" defaultValue={handle ?? ""} readOnly={!!user.ig} maxLength={60} autoCapitalize="none" /></label>
                <label>이름 칸<input type="text" name="name" defaultValue={profile.name ?? ""} readOnly={!!live} placeholder="예: 채령 | 대학생 테크 리뷰" maxLength={30} /></label>
                <label>소개글 <span className="small muted">({(profile.bio ?? "").length}/{account.BIO_MAX}자)</span>
                  <textarea name="bio" defaultValue={profile.bio ?? ""} readOnly={!!live?.bio} rows={4} maxLength={300} placeholder={"예:\n테크 좋아하는 컴퓨터학과 대학생\n신제품을 대학생 시선으로 리뷰해요"} />
                </label>
                <label>프로필 링크<input type="text" name="website" defaultValue={profile.website ?? ""} readOnly={!!live?.website} placeholder="예: notion.so/chae-portfolio" maxLength={300} /></label>
                <label>내 관심 분야 <span className="small muted">(추천 문구에만 써요)</span><input type="text" name="interest" defaultValue={profile.interest ?? ""} placeholder="예: 테크, 카페, 자취 요리" maxLength={20} /></label>
                <SubmitButton className="btn pri" pendingText="저장 중…">저장</SubmitButton>
                {user.ig && <a className="btn" href="https://www.instagram.com/accounts/edit/" target="_blank" rel="noreferrer">인스타에서 프로필 편집 열기</a>}
              </form>
              <div className="grid" style={{ gap: 10, alignContent: "start" }}>
                <h3 className="acct-h">점검 <span className="small muted">할 일 {profTodo}개</span></h3>
                <ul className="acct-checks">
                  {checks.map((c) => (
                    <li key={c.id} className={c.ok ? "ok" : "todo"}>
                      <span aria-hidden="true">{c.ok ? "✓" : "!"}</span>
                      <div><b>{c.label}</b>{!c.ok && c.tip && <><br /><span className="small">{c.tip}</span></>}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="acct-sug">
              <b>바꿀 만한 추천</b> <span className="small muted">복사해서 인스타 앱에 붙여넣어요</span>
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
            </div>
          </>
        ) : (
          <div className="acct-grid two">
            <div className="grid" style={{ gap: 10, alignContent: "start" }}>
              <h3 className="acct-h">합격 경향에 맞추려면</h3>
              {perfGaps.length || blogQuiet ? (
                <ul className="acct-checks">
                  {perfGaps.map((g) => (
                    <li key={g.id} className="todo"><span aria-hidden="true">!</span><div><b>{g.title}</b><br /><span className="small">{g.todo}</span></div></li>
                  ))}
                  {blogQuiet && <li className="todo"><span aria-hidden="true">!</span><div><b>블로그 최근 30일 글 0개</b><br /><span className="small">담당자가 블로그를 열면 최근 글부터 봐요. 활동과 이어지는 글을 1개 올려 보세요.</span></div></li>}
                </ul>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>성과 쪽은 합격 경향과 어긋나는 항목이 없어요.</p>
              )}
              <div className="row">
                <Link className="btn" href="/calendar">업로드 일정 보기</Link>
                <Link className="btn" href="/feedback">업로드 성과 · 숫자 넣기</Link>
              </div>
            </div>
            <div className="grid" style={{ gap: 10, alignContent: "start" }}>
              <h3 className="acct-h">내 게시물 성과로 본 다음 할 일</h3>
              {!media.length ? (
                <p className="small muted" style={{ margin: 0 }}>올린 게시물 기록이 없어요. {user.ig ? "인스타에 게시물을 올리면 자동으로 들어와요." : <>업로드 성과에서 <Link href="/feedback">숫자를 넣어 주세요</Link>.</>}</p>
              ) : perfSug.length ? (
                <ul className="acct-checks">
                  {perfSug.map((s, i) => (
                    <li key={i} className={s.kind === "keep_format" ? "ok" : "todo"}><span aria-hidden="true">{s.kind === "keep_format" ? "✓" : "!"}</span><div><b>{s.title}</b><br /><span className="small">{s.detail}</span></div></li>
                  ))}
                </ul>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>업로드 일정을 만들면 남은 일정에 맞춘 제안이 나와요.</p>
              )}
              {sentence && (
                <div className="acct-bio">
                  <span className="tag">지원서에 쓸 성과 문장</span>
                  <pre>{sentence}</pre>
                  <div className="row between"><span className="small muted">실제 숫자로만 만들었어요</span><CopyButton text={sentence} /></div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 4. 분석하기 */}
      <section className="card acct" id="analyze">
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <h2 className="acct-h2">4 · 분석하기</h2>
          <span className="small muted">{instaOn ? (mediaRes.source === "instagram" ? "인스타 공식 데이터" : "직접 넣은 성과") : ""}{instaOn && blogId ? " · " : ""}{blogId ? "블로그 최근 글 목록" : ""} 기준</span>
        </div>
        {instaOn && (
          <div className="grid" style={{ gap: 12 }}>
            <h3 className="acct-h">인스타그램</h3>
            <div className="an-tiles">
              <Tile label="기록된 게시물" value={`${analysis.insta.count}개`} />
              <Tile label="최근 30일" value={`${analysis.insta.last30}개`} />
              <Tile label="주당 업로드 (8주)" value={`${analysis.insta.perWeek}개`} />
              <Tile label="마지막 업로드" value={analysis.insta.sinceLast === undefined ? "-" : analysis.insta.sinceLast === 0 ? "오늘" : `${analysis.insta.sinceLast}일 전`} />
              <Tile label="평균 조회수" value={n(analysis.insta.avgViews)} />
              <Tile label="반응률" value={analysis.insta.engagement === undefined ? "-" : `${(analysis.insta.engagement * 100).toFixed(1)}%`} hint="(좋아요+댓글+저장)÷조회수" />
            </div>
            {analysis.insta.count > 0 ? (
              <div className="an-grid">
                <div className="grid" style={{ gap: 8 }}>
                  <b className="small">포맷 비율</b>
                  {analysis.insta.mix.map((x) => (
                    <div key={x.format} className="an-mix">
                      <span className={`tag k-${x.format}`}>{x.label}</span>
                      <div className="bar thin" role="img" aria-label={`${x.label} ${Math.round(x.share * 100)}%`}><i style={{ width: `${Math.round(x.share * 100)}%` }} /></div>
                      <span className="small">{x.count}개 · 평균 조회수 {n(x.avgViews)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid" style={{ gap: 10, alignContent: "start" }}>
                  {best && (
                    <div className="small"><b>가장 많이 본 게시물</b><br />{best.date} · {analysis.insta.mix.find((x) => x.format === best.format)?.label} · 조회수 {n(best.views)}{best.permalink && <> · <a href={best.permalink} target="_blank" rel="noreferrer">원본</a></>}</div>
                  )}
                  {analysis.insta.bestWeekday ? (
                    <div className="small"><b>반응 좋은 요일</b><br />{analysis.insta.bestWeekday.day}요일 (게시물 {analysis.insta.bestWeekday.n}개 평균 조회수 {n(analysis.insta.bestWeekday.avgViews)})</div>
                  ) : (
                    <div className="small muted">같은 요일에 올린 게시물이 2개 이상 쌓이면 반응 좋은 요일을 알려 줘요.</div>
                  )}
                </div>
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>게시물 기록이 쌓이면 포맷 비율·가장 많이 본 게시물·반응 좋은 요일을 보여 줘요.</p>
            )}
          </div>
        )}
        {blogId && analysis.blog && (
          <div className="grid" style={{ gap: 12 }}>
            <h3 className="acct-h">네이버 블로그</h3>
            {blogRes?.error ? (
              <p className="small muted" style={{ margin: 0 }}>블로그 글 목록을 읽지 못했어요. 블로그가 공개인지, 아이디가 맞는지 확인해 주세요.</p>
            ) : (
              <>
                <div className="an-tiles">
                  <Tile label="읽은 최근 글" value={`${analysis.blog.count}개`} />
                  <Tile label="최근 30일" value={`${analysis.blog.last30}개`} />
                  <Tile label="주당 글 (8주)" value={`${analysis.blog.perWeek}개`} />
                  <Tile label="마지막 글" value={analysis.blog.sinceLast === undefined ? "-" : analysis.blog.sinceLast === 0 ? "오늘" : `${analysis.blog.sinceLast}일 전`} />
                  <Tile label="브랜드·관심 분야 글" value={`${analysis.blog.brandPosts.length}개`} />
                </div>
                <div className="an-grid">
                  <div className="grid" style={{ gap: 6 }}>
                    <b className="small">브랜드·관심 분야 글</b>
                    {analysis.blog.brandPosts.length ? (
                      <ul className="clean small" style={{ margin: 0 }}>{analysis.blog.brandPosts.slice(0, 5).map((p) => <li key={p.link}>{p.date} · <a href={p.link} target="_blank" rel="noreferrer">{p.title}</a></li>)}</ul>
                    ) : (
                      <span className="small muted">제목에 ‘{brand}’{profile.interest ? `나 ‘${profile.interest}’` : ""}가 들어간 글이 아직 없어요.</span>
                    )}
                  </div>
                  <div className="grid" style={{ gap: 6, alignContent: "start" }}>
                    <b className="small">많이 쓴 카테고리</b>
                    {analysis.blog.categories.length ? <div className="row">{analysis.blog.categories.map((c) => <span key={c.name} className="tag">{c.name} {c.count}</span>)}</div> : <span className="small muted">-</span>}
                  </div>
                </div>
              </>
            )}
            <span className="small muted">네이버는 블로그 조회수를 다른 서비스에 공개하지 않아서, 글 목록(제목·날짜)으로만 분석해요.</span>
          </div>
        )}
      </section>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="an-tile" title={hint}>
      <span className="small muted">{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** 계정 연결 버튼들. 연결 전에는 이것만 보인다 */
function ConnectOptions({ insta, instaHandle, blog }: { insta?: boolean; instaHandle?: boolean; blog?: boolean }) {
  const ready = igLoginReady();
  return (
    <div className="connect-grid">
      {insta && (
        <div className="acct-opt">
          <b>인스타그램 · 공식 로그인 <span className="tag k-post">추천</span></b>
          <span className="small">성과 숫자 자동 · 예약 게시. 비밀번호는 서포트랩이 받지 않아요.</span>
          <details className="small">
            <summary>연결 전에 확인할 것</summary>
            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>인스타 앱 → 설정 → <b>계정 유형 및 도구 → 프로페셔널 계정으로 전환</b></li>
              <li>공개 계정으로 두기</li>
            </ol>
          </details>
          {ready ? (
            <a className="btn pri" href="/api/instagram/login">인스타그램으로 연결</a>
          ) : (
            <>
              <button className="btn" type="button" disabled>인스타그램으로 연결</button>
              <span className="small muted">서비스 쪽 Meta 앱 설정 전이라 아직 열리지 않아요. 아이디로 먼저 연결해 주세요.</span>
            </>
          )}
        </div>
      )}
      {instaHandle && (
        <form action={connectInstaHandleAction} className="acct-opt">
          <b>인스타그램 · 아이디로 연결</b>
          <span className="small">지금 바로 돼요. 성과 숫자는 직접 넣어요.</span>
          <input type="text" name="username" placeholder="@아이디 또는 instagram.com/아이디" maxLength={60} autoCapitalize="none" required aria-label="인스타 아이디" />
          <SubmitButton className="btn" pendingText="연결 중…">아이디로 연결</SubmitButton>
        </form>
      )}
      {blog && (
        <form action={connectBlogAction} className="acct-opt">
          <b>네이버 블로그</b>
          <span className="small">공개 글 목록(제목·날짜)으로 분석해요. 네이버는 조회수를 공개하지 않아요.</span>
          <input type="text" name="blog" placeholder="blog.naver.com/아이디" maxLength={80} autoCapitalize="none" required aria-label="블로그 주소" />
          <SubmitButton className="btn" pendingText="연결 중…">블로그 연결</SubmitButton>
        </form>
      )}
    </div>
  );
}
