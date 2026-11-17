import Link from "next/link";
import { currentUser, currentActivity } from "@/lib/session";
import { todayISO } from "@/lib/repo";
import { signup, setDeadlineAction } from "@/lib/actions";
import { credits, shared, trends, type planner } from "@supportlab/core";
import { fmtLabel, dday } from "@/lib/format";
import { loadAllReviews } from "@/lib/trends";
import { DayChecklist } from "@/components/DayChecklist";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/icons";
import { Countdown } from "@/components/Countdown";

const WD = ["월", "화", "수", "목", "금", "토", "일"];
const WD_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const MIX_LABEL = { reels: "숏폼 릴스", cardnews: "카드뉴스", post: "게시물" } as const;

const dow = (iso: string) => shared.parseISODate(iso).getUTCDay();
const korDate = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

export default async function Home({ searchParams }: { searchParams: Promise<{ day?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) return <Landing />;
  const act = await currentActivity(user.id);
  const { day, error } = await searchParams;
  const today = todayISO();

  if (!act) {
    return (
      <div className="card hi" style={{ maxWidth: 640 }}>
        <p className="ctx">{user.nickname}님, 환영해요</p>
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
          <p className="ctx">{act.name}</p>
          <h1>마감일을 알려 주세요</h1>
        </header>
        <form action={setDeadlineAction} className="card row" style={{ maxWidth: 640 }}>
          <label style={{ flex: 1 }}>모집 마감일<span className="sr-only"> (필수)</span><input type="date" name="deadline" defaultValue={act.analysis.deadline} required aria-describedby={error ? "deadline-err" : undefined} aria-invalid={error ? true : undefined} /></label>
          <div style={{ alignSelf: "flex-end" }}><SubmitButton pending="일정 짜는 중…">일정 만들기</SubmitButton></div>
          {error && <span id="deadline-err" className="note warn" role="alert" style={{ flexBasis: "100%" }}>마감까지 이틀 이상 남아야 일정을 짤 수 있어요. 더 늦은 날짜를 넣어 주세요.</span>}
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
  const nextContent = contents.find((i) => i.date >= today && i.status !== "past");

  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end" }}>
        <div>
          <p className="ctx">{act.name}</p>
          <h1>{daysLeft >= 0 ? `마감까지 ${daysLeft}일, 콘텐츠 ${left}개 남았어요` : "모집이 마감됐어요"}</h1>
        </div>
        <div className="row">
          <form action={setDeadlineAction}>
            <input type="hidden" name="deadline" value={plan.deadline} />
            <SubmitButton className="btn" pending="다시 계산 중…">일정 다시 계산</SubmitButton>
          </form>
          {thisWeek && <Link className="btn pri" href={`/studio?item=${thisWeek.id}`}>이번 주 초안 만들기</Link>}
        </div>
      </header>

      <Countdown plan={plan} today={today} selected={selected} />
      <p className="lede">
        {contents.length}개 중 {done}개를 올렸어요.{" "}
        {nextContent ? (nextContent.date === today ? <>오늘은 <b>{fmtLabel(nextContent.format)} ‘{nextContent.title}’</b> 올리는 날이에요. </> : <>다음은 {korDate(nextContent.date)}, <b>{fmtLabel(nextContent.format)} ‘{nextContent.title}’</b> 차례예요. </>) : null}
        {plan.gapDays}~{plan.gapDays + 1}일 간격으로, 경향 분석에서 반응이 좋았던 {mixText} 위주로 짰어요.
      </p>

      <section className="calwrap">
        <div className="calmain">
          <div className="row between">
            <h2 style={{ fontSize: 17 }}>{korDate(first)} – {korDate(last)}</h2>
            <div className="row legend small" aria-hidden="true">
              <span><i className="dot k-reels" />릴스</span>
              <span><i className="dot k-cardnews" />카드뉴스</span>
              <span><i className="dot k-post" />게시물</span>
              <span><i className="dot k-check" />점검</span>
              <span><i className="dot hollow k-check" />완료</span>
            </div>
          </div>
          <div className="cal">
            {WD.map((w) => <span key={w} className={w === "일" ? "wd sun" : "wd"} aria-hidden="true">{w}</span>)}
            {days.map((d) => (
              <DayCell key={d} d={d} today={today} selected={selected} deadline={plan.deadline} items={plan.items.filter((i) => i.date === d)} />
            ))}
          </div>
        </div>

        <aside id="daypanel" className="card daypanel" aria-label={`${korDate(selected)} 할 일`} aria-live="polite">
          <div className="row between">
            <b>{korDate(selected)} {WD_FULL[dow(selected)]}</b>
            <span className="small" style={{ color: "var(--red)", fontWeight: 800, whiteSpace: "nowrap" }}>마감 {shared.diffDays(selected, plan.deadline) >= 0 ? dday(shared.diffDays(selected, plan.deadline)) : "지남"}</span>
          </div>
          {dayItems.length === 0 && <p className="muted" style={{ margin: 0 }}>이 날은 일정이 없어요. 쉬어 가거나 다음 콘텐츠를 미리 찍어 두세요.</p>}
          {dayItems.map((i) => (
            <div key={i.id} className="grid" style={{ gap: 12 }}>
              <span className="row" style={{ gap: 6 }}>
                <span className={`tag k-${i.format ?? "dead"}`}>{i.kind === "deadline" ? "마감" : fmtLabel(i.format)}</span>
                {i.status === "past" && i.kind === "content" && <span className="tag">완료</span>}
                {i.status === "today" && <span className="tag k-reels">오늘</span>}
              </span>
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
              {i.kind === "deadline" && <Link className="btn pri" href="/skeleton">지원서 뼈대 확인</Link>}
            </div>
          ))}
        </aside>
      </section>

      <p className="small muted" style={{ margin: 0, maxWidth: "70ch" }}>
        일정은 규칙으로 짜서 크레딧이 들지 않아요. 초안을 AI로 보강할 때만 작업당 {credits.TASK_ESTIMATES.content_draft.min}~{credits.TASK_ESTIMATES.content_draft.max} 크레딧이 들어요.
        업로드 날짜를 꾸미는 기능은 없어요. 실제로 나눠 올릴 수 있게 일정만 잡아 드려요.
      </p>
    </>
  );
}

const STATE_WORD: Record<string, string> = { past: "완료", today: "오늘" };

function DayCell({ d, today, selected, deadline, items }: { d: string; today: string; selected: string; deadline: string; items: planner.PlanItem[] }) {
  const n = Number(d.slice(8));
  const label = n === 1 ? `${Number(d.slice(5, 7))}/1` : String(n);
  const cls = ["cell", d < today ? "past" : "", d === today ? "today" : "", d === deadline ? "dead" : "", d === selected ? "sel" : ""].filter(Boolean).join(" ");
  // 화면에는 줄인 칩만 보이므로, 스크린리더에는 날짜·포맷·상태·제목을 한 문장으로 읽어 준다
  const spoken = [
    `${korDate(d)}${d === today ? " 오늘" : ""}`,
    ...items.map((i) => (i.kind === "deadline" ? "모집 마감" : `${fmtLabel(i.format)}${i.status && STATE_WORD[i.status] ? ` ${STATE_WORD[i.status]}` : ""}: ${i.title}`)),
  ].join(", ");
  return (
    <Link href={`/?day=${d}`} scroll={false} className={cls} aria-label={spoken} aria-current={d === selected ? "date" : undefined}>
      <span className="d">{label}</span>
      {items.map((i) => {
        const kind = i.kind === "deadline" ? "dead" : i.format ?? "check";
        const state = i.status === "past" ? " done" : i.status === "today" ? " now" : "";
        return (
          <span key={i.id} className={`chip k-${kind}${state}`}>
            <span className="cf">
              <b>{i.kind === "deadline" ? "마감" : fmtLabel(i.format)}</b>
              {i.status === "past" && Icon.check(13)}
            </span>
            <span className="ct">{i.kind === "deadline" ? "서류 제출" : i.title}</span>
          </span>
        );
      })}
    </Link>
  );
}

/** 로그인 전 첫 화면: 무엇을 해 주는지 예시와 함께 보여 주고 바로 가입 */
async function Landing() {
  const bonus = credits.CREDIT_POLICY.signupBonus;
  const pts = credits.CREDIT_POLICY.contribution;
  const sample = trends.buildTrendReport(await loadAllReviews()).sampleSize;
  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="tag pill">대학생 서포터즈 지원·활동 매니저</span>
          <h1 id="hero-title">서포터즈 혜택은 많은데,<br /><mark>하기 귀찮다면?</mark></h1>
          <p className="lede">공고 링크 하나만 넣으세요. <b>지원서 뼈대</b>, <b>업로드 일정</b>, <b>찍을 장면</b>까지 서포트랩이 짜 드려요.</p>
          <ul className="ticks">
            <li>{Icon.check(16)}마감일·전형·우대사항을 공고에서 자동으로 뽑아요</li>
            <li>{Icon.check(16)}완성 문장은 대신 쓰지 않아요. 구조와 강조점만 제안해요</li>
            <li>{Icon.check(16)}공고 원문은 저장하지 않고, 뽑아낸 사실과 링크만 남겨요</li>
          </ul>
        </div>
        <form action={signup} className="card signup" id="signup">
          <span className="sticker" aria-hidden="true">{bonus} 크레딧 무료</span>
          <h2>시작하기</h2>
          <p className="muted" style={{ margin: 0 }}>가입하면 <b>{bonus} 크레딧</b>을 무료로 드려요. 공고 분석은 한 번에 최대 {credits.TASK_ESTIMATES.notice_analysis.max} 크레딧이에요.</p>
          <label>
            <span>닉네임<span className="req" aria-hidden="true">*</span></span>
            <input type="text" name="nickname" placeholder="예: 채령" required maxLength={20} autoComplete="nickname" />
          </label>
          <SubmitButton pending="시작하는 중…">무료 크레딧 받고 시작하기</SubmitButton>
          <p className="small muted" style={{ margin: 0 }}>데모 버전이라 서버를 다시 시작하면 데이터가 초기화돼요.</p>
        </form>
      </section>

      <section className="lsec" aria-labelledby="flow-title">
        <header>
          <h2 id="flow-title" className="poster">공고 링크 하나로 이만큼 해요</h2>
          <p className="muted" style={{ margin: 0 }}>지원 준비부터 활동 콘텐츠까지, 서포터즈 한 시즌을 한 곳에서. 아래는 예시 화면이에요.</p>
        </header>
        <ol className="flow">
          <li className="fcard">
            <span className="fno"><b>1</b>공고 분석</span>
            <p>링크를 넣으면 마감일, 전형, 제출물, 우대사항을 정리하고 우대사항별 준비 방법을 알려 줘요.</p>
            <div className="demo" aria-label="공고 분석 예시">
              <dl className="mini-facts">
                <dt>마감</dt><dd>12.04 (금)</dd>
                <dt>전형</dt><dd>서류 → 면접</dd>
                <dt>우대</dt><dd><span className="tag k-reels">#숏폼</span> <span className="tag k-reels">#툴능력</span></dd>
              </dl>
            </div>
          </li>
          <li className="fcard">
            <span className="fno"><b>2</b>지원서 뼈대</span>
            <p>문항마다 쓰는 순서, 강조할 점, 꺼낼 경험을 제안해요. 문장은 직접 채워요.</p>
            <div className="demo" aria-label="지원서 뼈대 예시">
              <span className="small" style={{ fontWeight: 800 }}>지원 동기 (500자)</span>
              <ol className="mini-ol"><li>계기</li><li>연결</li><li>기여</li><li>마무리</li></ol>
              <span className="small"><mark className="hl">E8 진정성</mark> <mark className="hl">E5 브랜드 이해</mark></span>
            </div>
          </li>
          <li className="fcard">
            <span className="fno"><b>3</b>업로드 캘린더</span>
            <p>마감일까지 릴스·카드뉴스·게시물을 언제 올릴지 형광펜 달력으로 짜 줘요.</p>
            <div className="demo" aria-label="업로드 캘린더 예시">
              <div className="mini-cal">
                {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
                  <span key={d} className={i === 1 ? "today" : undefined}>
                    <b>{d}</b>
                    {i === 1 && <i className="k-reels" />}
                    {i === 3 && <i className="k-cardnews" />}
                    {i === 5 && <i className="k-post" />}
                    {i === 6 && <i className="k-dead" />}
                  </span>
                ))}
              </div>
              <span className="mini-legend">
                {([["k-reels", "릴스"], ["k-cardnews", "카드뉴스"], ["k-post", "게시물"], ["k-dead", "마감"]] as const).map(([k, t]) => (
                  <span key={k}><i className={k} />{t}</span>
                ))}
              </span>
            </div>
          </li>
          <li className="fcard">
            <span className="fno"><b>4</b>촬영·편집·게시</span>
            <p>찍을 장면을 알려 주고, 올린 영상을 9:16 릴스로 편집해 예약 게시까지 해요.</p>
            <div className="demo" aria-label="콘텐츠 제작 예시">
              <span className="scene"><b>#1</b> 2.5초 · 클로즈업</span>
              <span className="scene"><b>#2</b> 3초 · 셀카 시점</span>
              <span className="scene"><b>#3</b> 5초 · 손 시점(POV)</span>
              <span className="small" style={{ fontWeight: 800 }}>{Icon.flag(14)} 11/23 19:00 예약 게시</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="card dark loop" aria-labelledby="loop-title">
        <div>
          <h2 id="loop-title" className="poster">합격했다면, 다음 사람에게 이어 주세요</h2>
          <p style={{ margin: "8px 0 0", color: "var(--on-dark-sub)" }}>
            합격(또는 불합격) 경험을 공유하면 크레딧을 드려요. 모인 경험은 검수를 거쳐 모두가 보는 ‘합격 경향’이 돼요.
            지금까지 합격 후기 <b style={{ color: "var(--hl)" }}>{sample}건</b>을 정리했어요.
          </p>
        </div>
        <ul className="pts">
          <li><b>+{pts.connect}</b>인스타 연결</li>
          <li><b>+{pts.proof}</b>합격 증빙</li>
          <li><b>+{pts.structure}</b>지원서 구조</li>
        </ul>
      </section>

      <div className="lend">
        <a href="#signup" className="btn pri">{bonus} 크레딧 받고 시작하기</a>
        <span className="small muted">닉네임만 있으면 바로 시작할 수 있어요.</span>
      </div>
    </div>
  );
}
