"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 감싼 <form>이 제출돼 서버 작업이 도는 중인지.
 * useFormStatus만으로는 페이지가 다시 그려질 때 상태가 금방 풀리는 경우가 있어서,
 * form의 submit 이벤트도 직접 듣고 '주소가 바뀔 때(결과 화면으로 이동하거나 ?error로 돌아올 때)'까지 켜 둔다.
 */
function useSubmitting(ref: RefObject<HTMLElement | null>): boolean {
  const { pending } = useFormStatus();
  const [started, setStarted] = useState(false);
  const path = usePathname();
  const query = useSearchParams()?.toString();
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    // submit 이벤트는 브라우저의 필수 입력 검사를 통과했을 때만 온다
    const on = () => setStarted(true);
    form.addEventListener("submit", on);
    return () => form.removeEventListener("submit", on);
  }, [ref]);
  useEffect(() => {
    setStarted(false);
  }, [path, query]);
  return pending || started;
}

/** 제출 버튼. 서버 작업이 도는 동안 '분석 중…'처럼 바꾸고 다시 누를 수 없게 막는다. <form> 안에 넣는다. */
export function SubmitButton({ children, pendingText, className = "btn pri", style, title }: { children: ReactNode; pendingText: string; className?: string; style?: CSSProperties; title?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const busy = useSubmitting(ref);
  return (
    <button ref={ref} className={className} type="submit" style={style} title={title} disabled={busy} aria-busy={busy || undefined}>
      {busy ? (
        <>
          <i className="spin" aria-hidden="true" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * 작업이 도는 동안 폼 안에 안내 상자를 띄운다. 지난 시간을 보여 줘서 멈춘 게 아니라는 걸 알린다.
 * steps는 6초마다 다음 문구로 넘어간다 (실제 진행률이 아니라 대략적인 안내).
 */
export function PendingNote({ steps, hint }: { steps: string[]; hint?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const busy = useSubmitting(ref);
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!busy) {
      setSec(0);
      return;
    }
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const step = steps[Math.min(steps.length - 1, Math.floor(sec / 6))];
  return (
    <div ref={ref} className={busy ? "pending" : undefined} role="status" aria-live="polite" hidden={!busy}>
      {busy && (
        <>
          <i className="spin" aria-hidden="true" />
          <div>
            <b>{step}</b>
            <span className="small muted"> · {sec}초</span>
            {hint && <div className="small muted">{hint}</div>}
          </div>
        </>
      )}
    </div>
  );
}
