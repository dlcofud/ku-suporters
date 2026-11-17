"use client";
import { useState, type ReactNode } from "react";

/** 점선 상자 모양의 파일 고르기. 고른 파일 이름을 상자 안에 보여 준다 */
export function FilePick({ name, accept, multiple, icon, label, hint }: { name: string; accept: string; multiple?: boolean; icon: ReactNode; label: string; hint: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <label className={picked.length ? "filepick on" : "filepick"}>
      {icon}
      <span className="fp-text">
        <b>{label}</b>
        <span className="small">{picked.length ? picked.join(", ") : hint}</span>
      </span>
      <input
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        className="sr-file"
        onChange={(e) => setPicked([...(e.target.files ?? [])].map((f) => f.name).slice(0, 4))}
      />
    </label>
  );
}
