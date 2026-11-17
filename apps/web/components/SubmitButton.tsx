"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * 서버 액션 폼의 제출 버튼. 처리 중에는 눌리지 않게 막고 진행 문구를 보여 준다.
 * confirm 을 주면 제출 전에 한 번 더 묻는다 (되돌리기 어려운 동작용).
 */
export function SubmitButton({ children, pending, className = "btn pri", confirm }: { children: ReactNode; pending?: string; className?: string; confirm?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={busy}
      aria-disabled={busy || undefined}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {busy ? pending ?? "처리 중…" : children}
    </button>
  );
}
