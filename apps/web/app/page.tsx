import Link from "next/link";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/session";
import { repo, todayISO } from "@/lib/repo";
import { signup } from "@/lib/actions";
import { shared, credits } from "@supportlab/core";
import { SubmitButton } from "@/components/Pending";
import { fmtLabel, dday } from "@/lib/format";
import { StartScreen } from "@/components/StartScreen";
import { summarize, allItems, clashDays, itemTarget, goHref, type OverviewItem, type ActSummary } from "@/lib/overview";

const WD = ["월", "화", "수", "목", "금", "토", "일"];
const WD_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const dow = (iso: string) => shared.parseISODate(iso).getUTCDay();
const korDate = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const dotDate = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${"일월화수목금토"[dow(iso)]}`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function Home({ searchParams }: { searchParams: Promise<{ day?: string; start?: string; error?: string; id?: string; nick?: string }> }) {
  const user = await currentUser();
  const { day, start, error, id, nick } = await searchParams;
  if (!user) return <Landing error={error} id={id} nick={nick} />;
  const acts = await repo.listActivities(user.id);
  // 처음 왔으면(서포터즈가 없으면) 바로 "어떤 서포터즈에 지원하나요?"
  if (!acts.length) return <StartScreen first nickname={user.nickname} />;
  return <Overview acts={acts} day={day} start={start} />;
}

/* ------------------------------------------------------------------ */
/* 모든 서포터즈 통합 캘린더                                             */
/* ------------------------------------------------------------------ */

async function Overview({ acts, day, start }: { acts: Awaited<ReturnType<typeof repo.listActivities>>; day?: string; start?: string }) {
  const today = todayISO();
  const sums = summarize(acts, today);
  const items = allItems(acts, sums);
  const clashes = clashDays(items, today);
  const live = sums.filter((s) => s.daysLeft === undefined || s.daysLeft >= 0);
  const nearest = live.filter((s) => s.daysLeft !== undefined).sort((a, b) => a.daysLeft! - b.daysLeft!)[0];
  const weekEnd = shared.addDays(today, 6 - ((dow(today) + 6) % 7));
  const thisWeek = items.filter((i) => i.kind === "content" && i.date >= today && i.date <= weekEnd);

  // 달력: 이번 주 월요일부터 4주 (‹ › 로 한 주씩)
  const base = shared.addDays(today, -((dow(today) + 6) % 7));
  const first = start && ISO.test(start) ? shared.addDays(start, -((dow(start) + 6) % 7)) : base;
  const days = Array.from({ length: 28 }, (_, i) => shared.addDays(first, i));
  const last = days[27]!;
  const inView = items.filter((i) => i.date >= first && i.date <= last);
  const selected = day && ISO.test(day) ? day : inView.find((i) => i.date >= today)?.date ?? today;
  const selItems = items.filter((i) => i.date === selected);
  const q = (o: Record<string, string>) => "/?" + new URLSearchParams({ ...(first !== base ? { start: first } : {}), ...o }).toString();

  // 자(ruler): 오늘부터 가장 늦은 마감까지 (최소 2주, 최대 8주)
  const lastDeadline = live.map((s) => s.deadline).filter((d): d is string => !!d && d >= today).sort().at(-1) ?? shared.addDays(today, 27);
  const minEnd = shared.addDays(today, 13);
  const maxEnd = shared.addDays(today, 55);
  const rulerEnd = lastDeadline < minEnd ? minEnd : lastDeadline > maxEnd ? maxEnd : lastDeadline;
  const rulerDays: string[] = [];
  for (let d = today; d <= rulerEnd; d = shared.addDays(d, 1)) rulerDays.push(d);

  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end" }}>
        <div className="grid" style={{ gap: 4 }}>
          <span className="eyebrow">내 서포터즈 {acts.length}개 · 전체 일정</span>
          <h1>
            {nearest ? (nearest.daysLeft === 0 ? <>오늘 <span className="red">마감</span>이 있어요</> : <>가장 가까운 마감까지 <span className="hl">{nearest.daysLeft}일</span></>) : "마감일을 정해 주세요"}
          </h1>
          <p className="lede" style={{ margin: 0 }}>이번 주에 올릴 콘텐츠 {thisWeek.length}개{clashes.length ? ` · 겹치는 날 ${clashes.length}일` : ""}</p>
        </div>
        <Link className="btn pri" href="/notice">+ 새 서포터즈 추가</Link>
      </header>

      <section className="card ruler multi" aria-label="서포터즈별 마감까지 남은 날">
        {sums.map((s) => {
          const mine = items.filter((i) => i.actId === s.id);
          return (
            <div key={s.id} className="rrow">
              <a href={goHref(s.id, "/calendar")} className="rname">
                <b>{s.name}</b>
                <span className={s.daysLeft !== undefined && s.daysLeft >= 0 && s.daysLeft <= 7 ? "small red" : "small muted"}>
                  {s.daysLeft === undefined ? "마감일 없음" : s.daysLeft < 0 ? "마감 지남" : `${dday(s.daysLeft)} · ${dotDate(s.deadline!)} 마감`}
                </span>
              </a>
              <ol style={{ gridTemplateColumns: `repeat(${rulerDays.length}, minmax(0, 1fr))`, gridAutoFlow: "row" }}>
                {rulerDays.map((d) => {
                  const it = mine.find((i) => i.date === d && i.kind !== "deadline");
                  return (
                    <li key={d} className={dow(d) === 1 ? "wk" : undefined} title={`${korDate(d)}${it ? ` · ${fmtLabel(it.format)} ${it.title}` : ""}${d === s.deadline ? " · 마감" : ""}`}>
                      {d === today && <i className="td" aria-hidden="true" />}
                      {d === s.deadline ? <i className="dl" aria-hidden="true" /> : it ? <i className={`up k-${it.format ?? "check"}`} aria-hidden="true" /> : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
        <div className="ends" style={{ paddingLeft: 174 }}>
          <span>오늘 {dotDate(today)}</span>
          <span>{dotDate(rulerEnd)}</span>
        </div>
      </section>

      <section className="grid g4">
        <div className="card stat"><span className="small muted">진행 중인 서포터즈</span><span className="num big">{live.length}개</span></div>
        <div className="card stat"><span className="small muted">가장 가까운 마감</span><span className="num big red">{nearest?.deadline ? dotDate(nearest.deadline) : "-"}</span></div>
        <div className="card stat"><span className="small muted">이번 주 콘텐츠</span><span className="num big">{thisWeek.length}개</span></div>
        <div className="card stat dark">
          <span className="small" style={{ color: "#DDE1EE" }}>일정이 겹치는 날</span>
          <span className="num big" style={{ color: "var(--hl)" }}>{clashes.length ? clashes.slice(0, 2).map((d) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`).join(" · ") + (clashes.length > 2 ? ` 외 ${clashes.length - 2}일` : "") : "없음"}</span>
        </div>
      </section>

      <section className="calwrap">
        <div className="calmain">
          <div className="row between">
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn sm" href={q({ start: shared.addDays(first, -7) })} aria-label="한 주 앞으로">‹</Link>
              <h2 style={{ fontSize: 17 }}>{korDate(first)} – {korDate(last)}</h2>
              <Link className="btn sm" href={q({ start: shared.addDays(first, 7) })} aria-label="한 주 뒤로">›</Link>
              {first !== base && <Link className="small" href="/">오늘로</Link>}
            </div>
            <div className="row legend small">
              <span><i className="dot k-reels" />릴스</span>
              <span><i className="dot k-cardnews" />카드뉴스</span>
              <span><i className="dot k-post" />게시물</span>
              <span><i className="dot k-check" />점검</span>
              <span><i className="who" style={{ marginLeft: 0 }}>이름</i>어느 서포터즈인지</span>
            </div>
          </div>
          <div className="cal">
            {WD.map((w) => <span key={w} className="wd">{w}</span>)}
            {days.map((d) => (
              <OverviewCell key={d} d={d} today={today} selected={selected} items={items.filter((i) => i.date === d)} href={q({ day: d })} />
            ))}
          </div>
        </div>

        <aside className="card daypanel" aria-label={`${korDate(selected)} 할 일`}>
          <div className="row between">
            <b>{korDate(selected)} {WD_FULL[dow(selected)]}</b>
            {new Set(selItems.map((i) => i.actId)).size > 1 && <span className="small red" style={{ fontWeight: 800 }}>일정 {selItems.length}개 겹침</span>}
          </div>
          {selItems.length === 0 && <p className="muted" style={{ margin: 0 }}>이날은 일정이 없어요.</p>}
          {selItems.map((i) => <DayItem key={`${i.actId}-${i.id}`} it={i} today={today} />)}
        </aside>
      </section>

      <section className="grid g3">
        {sums.map((s) => <ActCard key={s.id} s={s} next={items.find((i) => i.actId === s.id && i.date >= today)} />)}
      </section>
    </>
  );
}

function OverviewCell({ d, today, selected, items, href }: { d: string; today: string; selected: string; items: OverviewItem[]; href: string }) {
  const n = Number(d.slice(8));
  const label = n === 1 ? `${Number(d.slice(5, 7))}/1` : String(n);
  const dead = items.some((i) => i.kind === "deadline");
  const clash = new Set(items.map((i) => i.actId)).size > 1;
  const cls = ["cell", d < today ? "past" : "", d === today ? "today" : "", dead ? "dead" : "", d === selected ? "sel" : ""].filter(Boolean).join(" ");
  return (
    <Link href={href} scroll={false} className={cls} aria-current={d === selected ? "date" : undefined} aria-label={`${korDate(d)}${items.length ? ` · ${items.map((i) => `${i.tag} ${i.kind === "deadline" ? "마감" : fmtLabel(i.format)}`).join(", ")}` : ""}`}>
      <span className="row between" style={{ flexWrap: "nowrap" }}>
        <span className="d">{label}</span>
        {clash && <span className="clash">겹침</span>}
      </span>
      {items.map((i) => (
        <span key={`${i.actId}-${i.id}`} className={`chip k-${i.kind === "deadline" ? "dead" : i.format ?? "check"}${d < today ? " done" : ""}`}>
          <b>{i.kind === "deadline" ? "마감" : fmtLabel(i.format)}</b>
          <i className="who">{i.tag}</i>
          <span className="ct"><br />{i.kind === "deadline" ? "서류 제출" : i.title}</span>
        </span>
      ))}
    </Link>
  );
}

function DayItem({ it, today }: { it: OverviewItem; today: string }) {
  const t = itemTarget(it);
  return (
    <div className="grid" style={{ gap: 8, paddingBottom: 14, borderBottom: "1px solid var(--line2)" }}>
      <span className="row" style={{ gap: 6 }}>
        <span className={`tag k-${it.kind === "deadline" ? "dead" : it.format ?? "check"}`}>{it.kind === "deadline" ? "마감" : fmtLabel(it.format)}</span>
        <span className="small" style={{ fontWeight: 800, color: "var(--sub)" }}>{it.actName}</span>
      </span>
      <b style={{ fontSize: 17, lineHeight: 1.4 }}>{it.kind === "deadline" ? "서류 제출 마감" : it.title}</b>
      <span className="small muted">{it.purpose}</span>
      {it.date >= today && <a className="btn" href={goHref(it.actId, t.href)} style={{ alignSelf: "flex-start" }}>{t.cta}</a>}
    </div>
  );
}

function ActCard({ s, next }: { s: ActSummary; next?: OverviewItem }) {
  return (
    <a href={goHref(s.id, "/calendar")} className="card actcard">
      <span className="row between" style={{ flexWrap: "nowrap" }}>
        <b style={{ fontSize: 16 }}>{s.name}</b>
        <span className={s.daysLeft !== undefined && s.daysLeft >= 0 && s.daysLeft <= 7 ? "tag k-dead" : "tag"}>{s.daysLeft === undefined ? "마감일 없음" : s.daysLeft < 0 ? "마감 지남" : dday(s.daysLeft)}</span>
      </span>
      <span className="small muted">{s.stage}</span>
      <span className="small">{next ? <>다음: <b>{next.kind === "deadline" ? "서류 제출" : next.title}</b> · {Number(next.date.slice(5, 7))}.{Number(next.date.slice(8))}</> : s.hasPlan ? "남은 일정이 없어요" : "마감일을 정하면 일정을 짜 드려요"}</span>
      <span className="small" style={{ fontWeight: 800, marginTop: "auto" }}>열기 →</span>
    </a>
  );
}

/** 로그인 전 첫 화면에 보여 주는 캘린더 예시 (실제 캘린더와 같은 클래스를 쓴다) */
const PREVIEW_DAYS: { n: number; today?: boolean; items: { kind: "reels" | "cardnews" | "post" | "check"; label: string; tag: string; title: string }[] }[] = [
  { n: 23, today: true, items: [{ kind: "reels", label: "릴스", tag: "갤대서", title: "자기소개" }, { kind: "post", label: "게시물", tag: "모파랑", title: "첫인상 기록" }] },
  { n: 24, items: [{ kind: "check", label: "점검", tag: "모파랑", title: "성과 점검" }] },
  { n: 25, items: [{ kind: "cardnews", label: "카드뉴스", tag: "갤대서", title: "SNS 분석" }, { kind: "reels", label: "릴스", tag: "모파랑", title: "3초 리뷰" }] },
  { n: 26, items: [] },
  { n: 27, items: [{ kind: "check", label: "점검", tag: "갤대서", title: "포폴 정리" }] },
  { n: 28, items: [] },
  { n: 29, items: [{ kind: "check", label: "점검", tag: "모파랑", title: "지원서 점검" }] },
];

const STEPS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "공고를 읽고 지원서를 같이 써요",
    body: "공고 링크를 넣으면 우대 사항을 정리하고, 코치와 대화하며 합격 후기 경향에 맞춰 지원서를 완성해요.",
    icon: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" /><path d="M14 3v5h5" /><circle cx="16.5" cy="16.5" r="3.5" /><path d="m19 19 2.5 2.5" /></>,
  },
  {
    title: "마감일에서 거꾸로 일정을 짜요",
    body: "언제 무엇을 올릴지 캘린더로 보여 주고, 서포터즈 여러 개의 일정이 겹치는 날도 알려 줘요.",
    icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  },
  {
    title: "찍을 장면을 알려 주고 편집해요",
    body: "필요한 장면을 정리해 주고, 찍은 영상을 올리면 AI가 편집해서 예약 게시까지 해요.",
    icon: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></>,
  },
  {
    title: "반응을 보고 다음 할 일을 알려 줘요",
    body: "조회수와 좋아요를 보고 다음 콘텐츠 방향을 제안해요.",
    icon: <><path d="M3 21h18" /><path d="m4 16 5-5 4 4 7-7" /><path d="M15 8h5v5" /></>,
  },
];

function Landing({ error, id, nick }: { error?: string; id?: string; nick?: string }) {
  return (
    <div className="lp">
      <section className="lp-hero" aria-labelledby="lp-title">
        <span className="lp-badge">서포터즈 혜택은 많은데, 하기 귀찮다면?</span>
        <h1 id="lp-title">대학생 서포터즈<br />지원·활동 <span className="lp-mark">AI 매니저</span></h1>
        <p className="lp-lede">공고 링크만 넣으면 코치와 대화하며 지원서를 완성하고, 업로드 일정을 짜고, 콘텐츠 촬영·편집·예약 게시까지 함께해요.</p>
      </section>

        <form action={signup} className="card hi lp-form" aria-labelledby="lp-signup">
          <h2 className="display" id="lp-signup" style={{ fontSize: 26 }}>회원가입</h2>
          <p className="muted" style={{ margin: 0 }}>가입하면 <b className="hl">{credits.CREDIT_POLICY.signupBonus} 크레딧</b>을 무료로 드려요.</p>
          {error && <p className="note warn" role="alert" style={{ margin: 0 }}>{error}</p>}
          <label>
            아이디
            <input type="text" name="loginId" defaultValue={id} required minLength={4} maxLength={20} pattern="[A-Za-z][A-Za-z0-9_]{3,19}" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="영문 소문자로 시작, 4~20자" />
          </label>
          <label>
            비밀번호
            <input type="password" name="password" required minLength={8} maxLength={64} autoComplete="new-password" placeholder="영문+숫자 8자 이상" />
          </label>
          <label>
            비밀번호 확인
            <input type="password" name="password2" required minLength={8} maxLength={64} autoComplete="new-password" />
          </label>
          <label>
            <span className="lbl">닉네임 <span className="small muted" style={{ fontWeight: 400 }}>(선택 · 화면에 보이는 이름)</span></span>
            <input type="text" name="nickname" defaultValue={nick} maxLength={20} placeholder="예: 채령" />
          </label>
          <SubmitButton pendingText="가입하는 중…">무료 크레딧 받고 시작하기</SubmitButton>
          <p className="small" style={{ margin: 0 }}>이미 계정이 있나요? <Link href="/login"><b>로그인</b></Link></p>
        </form>

      <section className="card lp-preview" aria-label="서포트랩 캘린더 화면 미리보기">
        <div className="lp-preview-head">
          <span className="eyebrow">내 서포터즈 2개 · 전체 일정</span>
          <b className="display lp-preview-title">가장 가까운 마감까지 <span className="lp-mark">7일</span></b>
        </div>
        <div className="row legend small" aria-hidden="true">
          <span><i className="dot k-reels" />릴스</span>
          <span><i className="dot k-cardnews" />카드뉴스</span>
          <span><i className="dot k-post" />게시물</span>
          <span><i className="dot k-check" />점검</span>
        </div>
        <div className="cal" role="presentation">
          {WD.map((w) => <span key={w} className="wd">{w}</span>)}
          {PREVIEW_DAYS.map((d) => (
            <div key={d.n} className={d.today ? "cell today" : "cell"}>
              <span className="row between" style={{ flexWrap: "nowrap" }}>
                <span className="d">{d.n}</span>
                {new Set(d.items.map((i) => i.tag)).size > 1 && <span className="clash">겹침</span>}
              </span>
              {d.items.map((i) => (
                <span key={i.tag + i.title} className={`chip k-${i.kind}`}>
                  <b>{i.label}</b>
                  <i className="who">{i.tag}</i>
                  <span className="ct">{i.title}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="lp-steps" aria-labelledby="lp-steps-title">
        <h2 id="lp-steps-title">서포트랩이 하는 일 4가지</h2>
        <ol className="lp-steplist">
          {STEPS.map((st, n) => (
            <li key={st.title} className="card lp-step">
              <span className="row" style={{ gap: 10 }}>
                <span className="lp-num" aria-hidden="true">{n + 1}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{st.icon}</svg>
              </span>
              <h3>{st.title}</h3>
              <p className="small muted" style={{ margin: 0 }}>{st.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
