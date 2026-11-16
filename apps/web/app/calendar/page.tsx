import Link from "next/link";
import { requireUser } from "@/lib/session";
import { repo, todayISO } from "@/lib/repo";
import { setDeadlineAction } from "@/lib/actions";
import { shared, type planner } from "@supportlab/core";
import { dday, fmtLabel, md } from "@/lib/format";

const WD = ["월", "화", "수", "목", "금", "토", "일"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const act = await repo.latestActivity(user.id);
  if (!act) return <div className="card"><h1>먼저 공고를 분석해 주세요</h1><Link className="btn pri" href="/notice">공고 분석</Link></div>;
  const plan = act.plan;
  const today = todayISO();
  return (
    <>
      <header className="row between">
        <div>
          <span className="eyebrow">{act.name} · 콘텐츠 캘린더</span>
          <h1>{plan ? `마감까지 ${shared.diffDays(today, plan.deadline)}일, 콘텐츠 ${plan.items.filter((i) => i.kind === "content" && i.status !== "past").length}개 남았어요` : "마감일을 알려 주세요"}</h1>
        </div>
      </header>
      {(!plan || error) && (
        <form action={setDeadlineAction} className="card row">
          <label style={{ flex: 1 }}>모집 마감일<input type="date" name="deadline" defaultValue={act.analysis.deadline} required /></label>
          <button className="btn pri" type="submit" style={{ alignSelf: "flex-end" }}>일정 만들기</button>
          {error && <span className="note warn">마감까지 이틀 이상 남아야 일정을 짤 수 있어요.</span>}
        </form>
      )}
      {plan && <CalendarGrid plan={plan} today={today} />}
      {plan && (
        <section className="card">
          <h2>일정 목록</h2>
          <table>
            <thead><tr><th>날짜</th><th>포맷</th><th>할 일</th><th>왜</th><th>체크리스트</th><th /></tr></thead>
            <tbody>
              {plan.items.map((i) => (
                <tr key={i.id} style={{ opacity: i.status === "past" ? 0.6 : 1 }}>
                  <td className="num">{md(i.date)}<br /><span className="small muted">{dday(i.dMinus)}</span></td>
                  <td><span className={`tag k-${i.format ?? "dead"}`}>{fmtLabel(i.format)}</span></td>
                  <td><b>{i.title}</b>{i.status === "today" && <span className="tag k-reels" style={{ marginLeft: 6 }}>오늘</span>}</td>
                  <td className="small muted">{i.purpose}</td>
                  <td className="small"><ul className="clean">{i.checklist.map((c) => <li key={c}>{c}</li>)}</ul></td>
                  <td>{i.kind === "content" && i.status !== "past" && <Link className="btn" href={`/studio?item=${i.id}`}>제작</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function CalendarGrid({ plan, today }: { plan: planner.Plan; today: string }) {
  // 시작일이 속한 주의 월요일부터 마감일이 속한 주의 일요일까지
  const startDow = (shared.parseISODate(plan.start).getUTCDay() + 6) % 7;
  const first = shared.addDays(plan.start, -startDow);
  const endDow = (shared.parseISODate(plan.deadline).getUTCDay() + 6) % 7;
  const last = shared.addDays(plan.deadline, 6 - endDow);
  const days: string[] = [];
  for (let d = first; d <= last; d = shared.addDays(d, 1)) days.push(d);
  return (
    <section className="card">
      <div className="cal">
        {WD.map((w) => <span key={w} className="wd">{w}</span>)}
        {days.map((d) => {
          const items = plan.items.filter((i) => i.date === d);
          const cls = ["cell", d < today ? "past" : "", d === today ? "today" : "", d === plan.deadline ? "dead" : ""].join(" ");
          return (
            <div key={d} className={cls}>
              <span className="d">{Number(d.slice(8)) === 1 ? md(d) : Number(d.slice(8))}</span>
              {items.map((i) => (
                <span key={i.id} className={`chip k-${i.format ?? "dead"}`}><b>{fmtLabel(i.format)}</b><br />{i.title}</span>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
