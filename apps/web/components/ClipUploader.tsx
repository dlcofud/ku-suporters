"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signClipUploadAction, registerClipAction } from "@/lib/actions";

/**
 * 배포 환경용 업로더: 영상을 서버를 거치지 않고 Supabase Storage로 바로 올린다.
 * (서버리스 함수는 요청 크기 제한이 있어 큰 영상을 받을 수 없다)
 */
export function ClipUploader({ planItemId, scenes }: { planItemId: string; scenes: { index: number; label: string }[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<Record<number, File>>({});
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    setBusy(true);
    try {
      for (const [idx, file] of Object.entries(files)) {
        const sceneIndex = Number(idx);
        setStatus(`${sceneIndex}번 장면 올리는 중…`);
        const { storageKey, signedUrl } = await signClipUploadAction(planItemId, sceneIndex, file.name);
        const body = new FormData();
        body.append("cacheControl", "3600");
        body.append("", file);
        const res = await fetch(signedUrl, { method: "PUT", body, headers: { "x-upsert": "true" } });
        if (!res.ok) throw new Error(`업로드 실패 (${res.status})`);
        setStatus(`${sceneIndex}번 장면 확인 중…`);
        await registerClipAction(planItemId, sceneIndex, storageKey);
      }
      setFiles({});
      setStatus("업로드 완료");
      router.refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="grid g3">
        {scenes.map((s) => (
          <label key={s.index}>
            {s.index}번 · {s.label}
            <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles((p) => ({ ...p, [s.index]: f })); }} />
          </label>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={upload} disabled={busy || Object.keys(files).length === 0}>영상 올리기</button>
        <span className="small muted" role="status">{status}</span>
      </div>
    </div>
  );
}
