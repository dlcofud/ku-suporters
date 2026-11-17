"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * 브라우저 기본 ‘파일 선택 / 선택된 파일 없음’ 대신 쓰는 아이콘 버튼.
 * 실제 <input type=file>은 버튼 안에 투명하게 겹쳐 두어 키보드 포커스·폼 제출·검증은 그대로 동작한다.
 */
export function FileButton({
  name, id, accept, label, ariaLabel, describedBy, compact, onFile,
}: {
  name?: string; id?: string; accept?: string; label: string; ariaLabel?: string; describedBy?: string; compact?: boolean;
  onFile?: (f: File | null) => void;
}) {
  const [file, setFile] = useState<string>("");
  return (
    <label className={`filebtn${file ? " has" : ""}${compact ? " compact" : ""}`} title={file || undefined}>
      <input
        type="file" name={name} id={id} accept={accept}
        aria-label={ariaLabel ?? label} aria-describedby={describedBy}
        onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f?.name ?? ""); onFile?.(f); }}
      />
      {file ? Icon.check(16) : Icon.upload(16)}
      <span className="fb-t">{file || label}</span>
    </label>
  );
}
