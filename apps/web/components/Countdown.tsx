import Link from "next/link";
import { shared, type planner } from "@supportlab/core";
import { fmtLabel } from "@/lib/format";
import { Icon } from "./icons";

const WD = "일월화수목금토";
const kor = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const dot = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
const wd = (iso: string) => WD[shared.parseISODate(iso).getUTCDay()];

/**
 * 역산 카운트다운: 시작(또는 오늘)부터 마감까지 하루 한 눈금짜리 자 테이프.
 * 오늘 칸은 형광펜, 업로드는 형광펜 색 알약, 끝낸 일은 남색으로 칠하고, 마감은 빨간 펜 동그라미.
 * 알약을 누르면 그 날짜가 아래 패널에 열린다.
 */
export function Countdown({ plan, today, selected }: { plan: planner.Plan; today: string; selected: string }) {
  const from = plan.start < today ? plan.start : today;
  const span = Math.max(1, shared.diffDays(from, plan.deadline));
  const pos = (iso: string) => Math.min(100, Math.max(0, (shared.diffDays(from, iso) / span) * 100));
  const todayPos = pos(today);
  const marks = plan.items.filter((i) => i.kind !== "deadline");
  const daysLeft = shared.diffDays(today, plan.deadline);
  const days = Array.from({ length: span }, (_, k) => shared.addDays(from, k)); // 마감일 눈금은 동그라미가 대신한다

  return (
    <section className="cd" aria-labelledby="cd-title">
      <h2 id="cd-title" className="sr-only">마감까지 업로드 일정</h2>
      <div className="cd-track">
        <span className="cd-tape" aria-hidden="true" />
        {todayPos > 0 && <span className="cd-elapsed" style={{ width: `calc(${todayPos}% + 18px)` }} aria-hidden="true" />}
        {daysLeft >= 0 && <span className="cd-today" style={{ left: `${todayPos}%` }} aria-hidden="true" />}
        {days.map((d) => {
          const monday = shared.parseISODate(d).getUTCDay() === 1;
          return (
            <span key={d} className={monday || d === from ? "cd-tick wk" : "cd-tick"} style={{ left: `${pos(d)}%` }} aria-hidden="true">
              <i>{Number(d.slice(8, 10))}</i>
            </span>
          );
        })}
        {marks.map((i) => {
          const isContent = i.kind === "content";
          const cls = ["cd-mark", `k-${i.format ?? "check"}`, isContent ? "content" : "minor", i.status, i.date === selected ? "sel" : ""].filter(Boolean).join(" ");
          const state = i.status === "past" ? "완료" : i.status === "today" ? "오늘" : `D-${i.dMinus}`;
          return (
            <Link key={i.id} href={`/?day=${i.date}`} scroll={false} className={cls} style={{ left: `${pos(i.date)}%` }} aria-label={`${kor(i.date)} ${fmtLabel(i.format)} ${i.title}, ${state}`} aria-current={i.date === selected ? "date" : undefined}>
              {i.status === "past" && isContent && Icon.check(12)}
            </Link>
          );
        })}
        <Link href={`/?day=${plan.deadline}`} scroll={false} className={plan.deadline === selected ? "cd-flag sel" : "cd-flag"} aria-label={`${kor(plan.deadline)} 모집 마감${daysLeft >= 0 ? `, ${daysLeft}일 남음` : ""}`} aria-current={plan.deadline === selected ? "date" : undefined}>
          <span>마감</span>
        </Link>
      </div>
      <div className="cd-ends" aria-hidden="true">
        <span>{from === today ? "오늘" : "시작"} <b className="num">{dot(from)}</b></span>
        <span className="cd-end">마감 <b className="num">{dot(plan.deadline)} {wd(plan.deadline)}</b></span>
      </div>
    </section>
  );
}
