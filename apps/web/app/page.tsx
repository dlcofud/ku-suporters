import Link from "next/link";
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

function Landing({ error, id, nick }: { error?: string; id?: string; nick?: string }) {
  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <section className="card dark" style={{ gap: 16, padding: 28 }}>
        <span className="eyebrow" style={{ color: "var(--hl)" }}>서포트랩</span>
        <h1 style={{ fontSize: 38, lineHeight: 1.18 }}>서포터즈 혜택은 많은데,<br /><span style={{ background: "var(--hl)", color: "var(--ink)", padding: "0 6px", borderRadius: 4 }}>하기 귀찮다면?</span></h1>
        <p style={{ margin: 0, color: "#DDE1EE" }}>공고 링크만 넣으면 코치와 대화하며 지원서를 완성하고, 업로드 일정을 짜고, 콘텐츠 촬영·편집·예약 게시까지 함께해요.</p>
        <ol className="clean" style={{ margin: 0, color: "#DDE1EE", display: "grid", gap: 4 }}>
          <li>공고 분석 → 코치와 대화하며 지원서 작성</li>
          <li>마감일에서 거꾸로 짠 콘텐츠 캘린더</li>
          <li>장면 기획 · AI 편집 · 예약 게시</li>
          <li>반응을 보고 다음 할 일 제안</li>
        </ol>
      </section>
      <form action={signup} className="card">
        <h2 className="display" style={{ fontSize: 26 }}>회원가입</h2>
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
    </div>
  );
}
