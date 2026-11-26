"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./Pending";

type Field = "name" | "bio" | "website";
type Vals = Partial<Record<Field, string>>;

const LABEL: Record<Field, string> = { name: "이름 칸", bio: "소개글", website: "프로필 링크" };
const EDIT_URL = "https://www.instagram.com/accounts/edit/";

const norm = (v?: string) => (v ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();

/**
 * 공식 연결된 인스타 프로필: 초안을 쓰고 → 복사해서 인스타에 붙여넣고 → 돌아오면 다시 읽어 '반영됐어요'를 확인한다.
 * 인스타 API는 프로필을 바꾸는 기능이 없어서 이렇게 한다 (IG User: Updating — not supported).
 * 화면으로 돌아오거나 3분마다 인스타에서 다시 읽어 늘 최신으로 둔다.
 */
export function InstaProfileSync({
  live,
  draft,
  interest,
  fetchedAt,
  bioMax,
  saveDraft,
}: {
  live: Vals & { username?: string };
  draft?: Vals;
  interest?: string;
  fetchedAt: string;
  bioMax: number;
  saveDraft: (fd: FormData) => Promise<void>;
}) {
  const [vals, setVals] = useState<Vals>({
    name: draft?.name ?? live.name ?? "",
    bio: draft?.bio ?? live.bio ?? "",
    website: draft?.website ?? live.website ?? "",
  });
  const fields: Field[] = ["name", "bio", "website"];
  const diff = fields.filter((f) => norm(vals[f]) !== norm(live[f]));
  const hasDraft = !!draft && fields.some((f) => draft[f] !== undefined);
  const applied = hasDraft && diff.length === 0;

  return (
    <div className="grid" style={{ gap: 10, alignContent: "start" }} id="now">
      <div className="row between" style={{ alignItems: "baseline" }}>
        <h3 className="acct-h">인스타 프로필</h3>
        <LiveStamp at={fetchedAt} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        여기서 초안을 고치고 <b>복사 → 인스타 편집에 붙여넣기</b>를 하면 돼요. 인스타는 다른 앱이 프로필을 직접 바꾸지 못하게 막아 둬서, 마지막 붙여넣기만 직접 해요. 돌아오면 자동으로 다시 읽어 확인해요.
      </p>
      {applied && <p className="note ok small" style={{ margin: 0 }}>초안이 인스타에 반영됐어요 ✓</p>}
      <form action={saveDraft} className="grid" style={{ gap: 10 }}>
        <label>
          아이디
          <input type="text" value={live.username ?? ""} readOnly />
        </label>
        {fields.map((f) => {
          const same = norm(vals[f]) === norm(live[f]);
          return (
            <div key={f} className="grid" style={{ gap: 4 }}>
              <div className="row between" style={{ alignItems: "baseline" }}>
                <b className="small">
                  {LABEL[f]}
                  {f === "bio" && <span className="muted"> ({(vals.bio ?? "").length}/{bioMax}자)</span>}
                </b>
                <span className={same ? "tag k-post" : "tag k-hl"}>{same ? "인스타와 같음 ✓" : "인스타와 달라요"}</span>
              </div>
              {f === "bio" ? (
                <textarea name="bio" rows={4} maxLength={bioMax} value={vals.bio} onChange={(e) => setVals((v) => ({ ...v, bio: e.target.value }))} placeholder={"예:\n자취 1년 차 🍳 10분 한 끼 기록\n편의점 재료로 버티는 중"} />
              ) : (
                <input type="text" name={f} maxLength={f === "name" ? 30 : 300} value={vals[f]} onChange={(e) => setVals((v) => ({ ...v, [f]: e.target.value }))} placeholder={f === "name" ? "예: 채령 | 자취 10분 요리" : "예: notion.so/chae-portfolio"} />
              )}
              {!same && (
                <div className="row" style={{ gap: 6 }}>
                  <CopyButton text={vals[f] ?? ""} />
                  <span className="small muted">인스타 지금 값: {norm(live[f]) ? `“${norm(live[f]).slice(0, 40)}${norm(live[f]).length > 40 ? "…" : ""}”` : "비어 있음"}</span>
                </div>
              )}
            </div>
          );
        })}
        <label>
          내 관심 분야 <span className="small muted">(추천에만 써요)</span>
          <input type="text" name="interest" defaultValue={interest ?? ""} placeholder="예: 테크, 카페, 자취 요리" maxLength={20} />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <SubmitButton className="btn" pendingText="저장 중…">초안 저장</SubmitButton>
          <a className="btn pri" href={EDIT_URL} target="_blank" rel="noreferrer">
            인스타에서 바꾸기 ↗{diff.length ? ` (${diff.length}칸)` : ""}
          </a>
        </div>
        {diff.length > 0 && <span className="small muted">① 다른 칸의 복사 → ② 인스타 프로필 편집에 붙여넣고 완료 → ③ 이 화면으로 돌아오면 자동 확인</span>}
      </form>
    </div>
  );
}

/** 인스타에서 읽어 온 시각 + 돌아오면 · 3분마다 다시 읽기 */
export function LiveStamp({ at }: { at: string }) {
  const router = useRouter();
  const last = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
    last.current = Date.now();
  }, [at]);

  useEffect(() => {
    const refresh = (minGap: number) => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < minGap) return;
      last.current = Date.now();
      setBusy(true);
      router.refresh();
    };
    const onBack = () => refresh(15_000);
    const tick = setInterval(() => {
      setNow(Date.now());
      refresh(180_000);
    }, 30_000);
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      clearInterval(tick);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [router]);

  const min = Math.max(0, Math.floor((now - new Date(at).getTime()) / 60_000));
  return (
    <span className="small muted row" style={{ gap: 6, alignItems: "center" }}>
      {busy ? "인스타에서 다시 읽는 중…" : `인스타에서 ${min ? `${min}분 전` : "방금"} 불러옴`}
      <button
        type="button"
        className="lab-reset"
        onClick={() => {
          last.current = Date.now();
          setBusy(true);
          router.refresh();
        }}
      >
        새로고침
      </button>
    </span>
  );
}
