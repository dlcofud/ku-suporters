"use client";

import { useEffect, useState } from "react";

/** 체크 상태는 이 브라우저에만 저장한다 (가벼운 개인 메모) */
export function DayChecklist({ id, items, title }: { id: string; items: string[]; title: string }) {
  const key = `sl_check:${id}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setChecked(JSON.parse(localStorage.getItem(key) || "{}"));
    } catch {
      /* 저장소를 못 쓰면 체크만 유지 */
    }
  }, [key]);
  const toggle = (c: string) =>
    setChecked((prev) => {
      const next = { ...prev, [c]: !prev[c] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  return (
    <fieldset className="checkbox-box">
      <legend className="small muted" style={{ fontWeight: 600 }}>{title}</legend>
      {items.map((c) => (
        <label key={c} className="check">
          <input type="checkbox" checked={!!checked[c]} onChange={() => toggle(c)} />
          <span style={{ textDecoration: checked[c] ? "line-through" : undefined, color: checked[c] ? "var(--mute)" : undefined }}>{c}</span>
        </label>
      ))}
    </fieldset>
  );
}
