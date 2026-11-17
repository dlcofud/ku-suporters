"use client";

import { useState } from "react";
import { applySuggestionAction } from "@/lib/actions";
import { SubmitButton } from "./SubmitButton";

export function SuggestionCard(p: { tag: string; tagClass: string; title: string; detail: string; highlight?: boolean; itemId?: string; toFormat?: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const actionable = !!(p.itemId && p.toFormat);
  return (
    <div className={p.highlight ? "card hi" : "card"}>
      <span className={`tag ${p.tagClass}`} style={{ alignSelf: "flex-start" }}>{p.tag}</span>
      <h3 style={{ fontSize: 17 }}>{p.title}</h3>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>{p.detail}</p>
      {actionable && (
        <form action={applySuggestionAction} className="row">
          <input type="hidden" name="itemId" value={p.itemId} />
          <input type="hidden" name="to" value={p.toFormat} />
          <SubmitButton pending="반영 중…">캘린더에 반영</SubmitButton>
          <button className="btn" type="button" onClick={() => setHidden(true)}>그대로 두기</button>
        </form>
      )}
    </div>
  );
}
