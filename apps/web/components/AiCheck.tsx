"use client";

import { useState } from "react";

type Result = { ok: boolean; label?: string; model?: string; ms?: number; reply?: string; error?: string };

/** 'AI 연결 확인' 버튼: 지금 설정된 AI에 짧은 요청을 보내 결과를 보여 준다 */
export function AiCheck() {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);
  async function run() {
    setBusy(true);
    setR(null);
    try {
      setR((await (await fetch("/api/ai/check", { cache: "no-store" })).json()) as Result);
    } catch (e) {
      setR({ ok: false, error: String(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid" style={{ gap: 8, justifyItems: "end" }}>
      <button className="btn" type="button" onClick={run} disabled={busy} aria-live="polite">
        {busy ? "확인 중… (로컬 모델은 처음에 1분쯤 걸려요)" : "AI 연결 확인"}
      </button>
      {r && (
        <p className={r.ok ? "note ok small" : "note warn small"} role="status" style={{ margin: 0, maxWidth: 420 }}>
          {r.ok ? `연결됐어요 · ${r.model} · ${((r.ms ?? 0) / 1000).toFixed(1)}초 · "${r.reply}"` : r.error}
        </p>
      )}
    </div>
  );
}
