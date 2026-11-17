import Link from "next/link";
import { currentUser, currentActivity } from "@/lib/session";
import { todayISO } from "@/lib/repo";
import { signup, setDeadlineAction } from "@/lib/actions";
import { credits, shared, trends, type planner } from "@supportlab/core";
import { fmtLabel } from "@/lib/format";
import { loadAllReviews } from "@/lib/trends";
import { DayChecklist } from "@/components/DayChecklist";

const WD = ["월", "화", "수", "목", "금", "토", "일"];
const WD_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const MIX_LABEL = { reels: "숏폼 릴스", cardnews: "카드뉴스", post: "게시물" } as const;

const dow = (iso: string) => shared.parseISODate(iso).getUTCDay();
const korDate = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const dotDate = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${"일월화수목금토"[dow(iso)]}`;

export default async function Home({ searchParams }: { searchParams: Promise<{ day?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) return <Landing />;
  const act = await currentActivity(user.id);
  const { day, error } = await searchParams;
  const today = todayISO();

  if (!act) {
    return (
      <div className="card hi" style={{ maxWidth: 640 }}>
        <span className="eyebrow">{user.nickname}님, 환영해요</span>
        <h1>준비할 활동의 공고 링크를 넣어 주세요</h1>
        <p className="muted" style={{ margin: 0 }}>링크만 붙여넣으면 마감일·우대사항·지원서 문항을 뽑고, 마감일에서 거꾸로 업로드 일정을 짜 드려요.</p>
        <Link className="btn pri" href="/notice" style={{ alignSelf: "flex-start" }}>공고 분석하기</Link>
      </div>
    );
  }

  const plan = act.plan;
  if (!plan) {
    return (
      <>
        <header>
          <span className="eyebrow">{act.name} · 콘텐츠 캘린더</span>
          <h1>마감일을 알려 주세요</h1>
        </header>
        <form action={setDeadlineAction} className="card row" style={{ maxWidth: 640 }}>
          <label style={{ flex: 1 }}>모집 마감일<input type="date" name="deadline" defaultValue={act.analysis.deadline} required /></label>
          <button className="btn pri" type="submit" style={{ alignSelf: "flex-end" }}>일정 만들기</button>
          {error && <span className="note warn">마감까지 이틀 이상 남아야 일정을 짤 수 있어요.</span>}
        </form>
      </>
    );
  }

  const contents = plan.items.filter((i) => i.kind === "content");
  const done = contents.filter((i) => i.status === "past").length;
  const left = contents.length - done;
  const daysLeft = shared.diffDays(today, plan.deadline);

  // 경향 분석 기준 포맷: 팀 수집 시트에서 비율이 높은 두 포맷
  let mixText = "릴스 위주";
  try {
    const mix = trends.formatMixHint(trends.buildTrendReport(await loadAllReviews()));
    const top = (Object.entries(mix) as [keyof typeof MIX_LABEL, number][]).sort((a, b) => b[1] - a[1]).slice(0, 2);
    mixText = top.map(([k]) => MIX_LABEL[k]).join(" + ");
  } catch {
    /* 시트를 못 읽으면 기본 문구 */
  }

  // 달력 범위: 시작일이 속한 주의 월요일 ~ 마감일이 속한 주의 일요일
  const first = shared.addDays(plan.start, -((dow(plan.start) + 6) % 7));
  const last = shared.addDays(plan.deadline, 6 - ((dow(plan.deadline) + 6) % 7));
  const days: string[] = [];
  for (let d = first; d <= last; d = shared.addDays(d, 1)) days.push(d);

  // 오른쪽 패널에 보여 줄 날짜: 고른 날 → 오늘(일정 있으면) → 다음 일정
  const nextItem = plan.items.find((i) => i.date >= today && i.kind !== "deadline") ?? plan.items.find((i) => i.date >= today);
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= first && day <= last ? day : plan.items.some((i) => i.date === today) ? today : nextItem?.date ?? today;
  const dayItems = plan.items.filter((i) => i.date === selected);
  const weekEnd = shared.addDays(today, 6 - ((dow(today) + 6) % 7));
  const thisWeek = contents.find((i) => i.date >= today && i.date <= weekEnd) ?? contents.find((i) => i.date >= today);

  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end" }}>
        <div className="grid" style={{ gap: 4 }}>
          <span className="eyebrow">{act.name} · 콘텐츠 캘린더</span>
          <h1>{daysLeft > 0 ? <>마감까지 <span className="hl">{daysLeft}일</span></> : daysLeft === 0 ? <>오늘 <span className="red">마감</span>이에요</> : "모집이 마감됐어요"}</h1>
          {daysLeft >= 0 && <p className="lede" style={{ margin: 0 }}>콘텐츠 {left}개 남았어요</p>}
        </div>
        <div className="row">
          <form action={setDeadlineAction}>
            <input type="hidden" name="deadline" value={plan.deadline} />
            <button className="btn" type="submit" title="오늘부터 남은 일정을 다시 나눠요">일정 다시 계산</button>
          </form>
          {thisWeek && <Link className="btn pri" href={`/studio?item=${thisWeek.id}`}>이번 주 초안 만들기</Link>}
        </div>
      </header>

      {daysLeft > 0 && <Ruler today={today} deadline={plan.deadline} items={plan.items} />}

      <section className="grid g4">
        <div className="card stat"><span className="small muted">모집 마감</span><span className="num big red">{dotDate(plan.deadline)}</span></div>
        <div className="card stat">
          <span className="small muted">진행률</span>
          <span className="num big">{done} / {contents.length}</span>
          <div className="bar thin"><i style={{ width: `${contents.length ? (done / contents.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="card stat"><span className="small muted">업로드 간격</span><span className="num big">{plan.gapDays}~{plan.gapDays + 1}일</span></div>
        <div className="card stat"><span className="small muted">경향 분석 기준 포맷</span><span style={{ fontWeight: 800, fontSize: 17 }}>{mixText}</span></div>
      </section>

      <section className="calwrap">
        <div className="calmain">
          <div className="row between">
            <h2 style={{ fontSize: 17 }}>{korDate(first)} – {korDate(last)}</h2>
            <div className="row legend small">
              <span><i className="dot k-reels" />릴스</span>
              <span><i className="dot k-cardnews" />카드뉴스</span>
              <span><i className="dot k-post" />게시물</span>
              <span><i className="dot k-check" />점검</span>
            </div>
          </div>
          <div className="cal">
            {WD.map((w) => <span key={w} className="wd">{w}</span>)}
            {days.map((d) => (
              <DayCell key={d} d={d} today={today} selected={selected} deadline={plan.deadline} items={plan.items.filter((i) => i.date === d)} />
            ))}
          </div>
        </div>

        <aside className="card daypanel" aria-label={`${korDate(selected)} 할 일`}>
          <div className="row between">
            <b>{korDate(selected)} {WD_FULL[dow(selected)]}</b>
            <span className="small red" style={{ fontWeight: 800 }}>마감 {shared.diffDays(selected, plan.deadline) >= 0 ? `D-${shared.diffDays(selected, plan.deadline)}` : "지남"}</span>
          </div>
          {dayItems.length === 0 && <p className="muted" style={{ margin: 0 }}>이 날은 일정이 없어요. 쉬어 가거나 다음 콘텐츠를 미리 찍어 두세요.</p>}
          {dayItems.map((i) => (
            <div key={i.id} className="grid" style={{ gap: 12 }}>
              <span className={`tag k-${i.format ?? "dead"}`} style={{ justifySelf: "start" }}>{i.kind === "deadline" ? "마감" : fmtLabel(i.format)}</span>
              <h2 style={{ fontSize: 20 }}>{i.title}</h2>
              <p className="muted" style={{ margin: 0 }}>{i.purpose}</p>
              {i.checklist.length > 0 && <DayChecklist id={`${act.id}:${i.id}`} items={i.checklist} title={i.kind === "content" ? "AI 티 줄이기 체크리스트" : "확인할 것"} />}
              {i.kind === "content" && i.status !== "past" && (
                <>
                  <Link className="btn pri wide" href={`/studio?item=${i.id}`}>
                    <span>초안 만들기</span><span className="small" style={{ fontWeight: 600 }}>장면 기획 무료</span>
                  </Link>
                  <a className="btn" href={`/api/reminder?item=${i.id}`} download>업로드 알림 받기</a>
                </>
              )}
              {i.kind === "content" && i.status === "past" && <Link className="btn" href="/feedback">이 콘텐츠 성과 보기</Link>}
              {i.kind === "deadline" && <Link className="btn pri" href="/skeleton">지원서 작성하기</Link>}
            </div>
          ))}
        </aside>
      </section>

      <p className="small muted" style={{ margin: 0 }}>
        업로드 날짜를 조작하지 않아요. 실제로 나눠 올릴 수 있게 일정과 할 일을 잡아 드려요 ·{" "}
        <span>규칙으로 짠 일정이라 0 크레딧 · 콘텐츠 보강은 작업당 {credits.TASK_ESTIMATES.content_draft.min}~{credits.TASK_ESTIMATES.content_draft.max} 크레딧</span>
      </p>
    </>
  );
}

/** 맨 위 자: 오늘부터 마감까지 하루 한 눈금. 업로드 날은 포맷 색 칸, 마감은 빨간 펜 동그라미 */
function Ruler({ today, deadline, items }: { today: string; deadline: string; items: planner.PlanItem[] }) {
  const days: string[] = [];
  for (let d = today; d <= deadline; d = shared.addDays(d, 1)) days.push(d);
  const uploads = items.filter((i) => i.kind === "content" && i.date >= today);
  return (
    <section className="card ruler" aria-label={`오늘부터 마감까지 ${days.length - 1}일, 업로드 ${uploads.length}번`}>
      <ol>
        {days.map((d) => {
          const it = items.find((i) => i.date === d && i.kind !== "deadline");
          const wk = dow(d) === 1;
          return (
            <li key={d} className={wk ? "wk" : undefined} title={`${korDate(d)}${it ? ` · ${fmtLabel(it.format)} ${it.title}` : ""}${d === deadline ? " · 마감" : ""}`}>
              {d === today && <i className="td" aria-hidden="true" />}
              {d === deadline ? <i className="dl" aria-hidden="true" /> : it ? <i className={`up k-${it.format ?? "check"}`} aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
      <div className="ends">
        <span>오늘 {dotDate(today)}</span>
        <span>업로드 {uploads.length}번 남음</span>
        <span className="red">마감 {dotDate(deadline)}</span>
      </div>
    </section>
  );
}

function DayCell({ d, today, selected, deadline, items }: { d: string; today: string; selected: string; deadline: string; items: planner.PlanItem[] }) {
  const n = Number(d.slice(8));
  const label = n === 1 ? `${Number(d.slice(5, 7))}/1` : String(n);
  const cls = ["cell", d < today ? "past" : "", d === today ? "today" : "", d === deadline ? "dead" : "", d === selected ? "sel" : ""].filter(Boolean).join(" ");
  return (
    <Link href={`/?day=${d}`} scroll={false} className={cls} aria-label={`${d}${items.length ? ` · ${items.map((i) => i.title).join(", ")}` : ""}`} aria-current={d === selected ? "date" : undefined}>
      <span className="d">{label}</span>
      {items.map((i) => {
        const state = i.status === "past" ? " · 완료" : i.status === "today" ? " · 오늘" : "";
        return (
          <span key={i.id} className={`chip k-${i.kind === "deadline" ? "dead" : i.format ?? "check"}${i.status === "past" ? " done" : ""}`}>
            <b>{i.kind === "deadline" ? "마감" : fmtLabel(i.format)}{state}</b>
            <span className="ct"><br />{i.kind === "deadline" ? "서류 제출" : i.title}</span>
          </span>
        );
      })}
    </Link>
  );
}

function Landing() {
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
        <h2 className="display" style={{ fontSize: 26 }}>시작하기</h2>
        <p className="muted" style={{ margin: 0 }}>가입하면 <b className="hl">{credits.CREDIT_POLICY.signupBonus} 크레딧</b>을 무료로 드려요.</p>
        <label>
          닉네임
          <input type="text" name="nickname" placeholder="예: 채령" required maxLength={20} />
        </label>
        <button className="btn pri" type="submit">무료 크레딧 받고 시작하기</button>
        <p className="small muted" style={{ margin: 0 }}>데모 버전이라 서버를 다시 시작하면 데이터가 초기화돼요.</p>
      </form>
    </div>
  );
}
