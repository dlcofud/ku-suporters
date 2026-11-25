"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 자동 검수를 한 건씩 돌린다 (동시에 2건). 서버 요청 시간 제한에 걸리지 않게 화면에서 나눠 부른다.
 * auto면 화면을 열자마자 시작한다. 끝나면 목록을 새로 그린다.
 */
type Tally = { auto: number; judge: number; human: number };

export function AutoReviewRunner({ ids, auto = false, label = "자동 검수 시작" }: { ids: string[]; auto?: boolean; label?: string }) {
  const router = useRouter();
  const [run, setRun] = useState(false);
  const [done, setDone] = useState(0);
  const [tally, setTally] = useState<Tally>({ auto: 0, judge: 0, human: 0 });
  const stop = useRef(false);
  const started = useRef(false);

  async function start() {
    if (started.current && run) return;
    started.current = true;
    setRun(true);
    stop.current = false;
    setDone(0);
    setTally({ auto: 0, judge: 0, human: 0 });
    const queue = [...ids];
    const worker = async () => {
      while (queue.length && !stop.current) {
        const id = queue.shift()!;
        try {
          const res = await fetch("/api/reviews/auto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
          const j = (await res.json()) as { state?: string; via?: string };
          setTally((t) =>
            j.state === "done" ? (j.via === "ai-judge" ? { ...t, judge: t.judge + 1 } : { ...t, auto: t.auto + 1 }) : { ...t, human: t.human + 1 },
          );
        } catch {
          setTally((t) => ({ ...t, human: t.human + 1 }));
        }
        setDone((d) => d + 1);
      }
    };
    await Promise.all([worker(), worker()]);
    setRun(false);
    router.refresh();
  }

  useEffect(() => {
    if (auto && ids.length && !started.current) void start();
    // 처음 그릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ids.length) return <span className="small muted">자동 검수할 후기가 없어요.</span>;
  return (
    <div className="grid" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8 }}>
        {run ? (
          <button type="button" className="btn" onClick={() => (stop.current = true)}>멈추기</button>
        ) : (
          <button type="button" className="btn pri" onClick={start}>{label} ({ids.length}건)</button>
        )}
        {(run || done > 0) && (
          <span className="small" role="status" aria-live="polite">
            {done} / {ids.length} · 일치해서 완료 {tally.auto} · AI 판정으로 완료 {tally.judge}{tally.human ? ` · 관리자 확인 필요 ${tally.human}` : ""}
          </span>
        )}
      </div>
      {run && <div className="progress"><i style={{ width: `${(done / ids.length) * 100}%` }} /></div>}
    </div>
  );
}
