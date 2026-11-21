"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * AI 교차 검수를 한 건씩 돌린다 (동시에 2건). 서버 요청 시간 제한에 걸리지 않게 화면에서 나눠 부른다.
 * 결과는 각 후기에 저장되고, 끝나면 목록을 새로 그린다.
 */
export function CrossCheckRunner({ ids, label }: { ids: string[]; label: string }) {
  const router = useRouter();
  const [run, setRun] = useState(false);
  const [done, setDone] = useState(0);
  const [tally, setTally] = useState({ match: 0, near: 0, differ: 0, error: 0 });
  const stop = useRef(false);

  async function start() {
    setRun(true);
    stop.current = false;
    setDone(0);
    setTally({ match: 0, near: 0, differ: 0, error: 0 });
    const queue = [...ids];
    const worker = async () => {
      while (queue.length && !stop.current) {
        const id = queue.shift()!;
        try {
          const res = await fetch("/api/reviews/cross", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
          const j = (await res.json()) as { ok?: boolean; verdict?: "match" | "near" | "differ" };
          setTally((t) => (j.ok && j.verdict ? { ...t, [j.verdict]: t[j.verdict] + 1 } : { ...t, error: t.error + 1 }));
        } catch {
          setTally((t) => ({ ...t, error: t.error + 1 }));
        }
        setDone((d) => d + 1);
      }
    };
    await Promise.all([worker(), worker()]);
    setRun(false);
    router.refresh();
  }

  if (!ids.length) return <span className="small muted">교차 검수할 후기가 없어요.</span>;
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
            {done} / {ids.length} · 일치 {tally.match} · 거의 일치 {tally.near} · 불일치 {tally.differ}{tally.error ? ` · 못 읽음 ${tally.error}` : ""}
          </span>
        )}
      </div>
      {run && <div className="progress"><i style={{ width: `${(done / ids.length) * 100}%` }} /></div>}
    </div>
  );
}
