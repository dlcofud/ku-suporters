"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signRefUploadAction } from "@/lib/actions";
import { shrinkImage } from "@/lib/shrink";

type Kind = "ref" | "mood" | "subjectImg";
const LIMIT: Record<Kind, number> = { ref: 6, mood: 4, subjectImg: 4 };

/**
 * 콘텐츠 만들기 1단계: 참고 자료 넣기 → 촬영 가이드 받기.
 * 사진은 화면에서 줄여 보내고(서버에 저장하지 않음), 화면 녹화는 저장소로 바로 올려 컷 길이를 잰다.
 */
export function ShootForm(props: {
  planItemId: string;
  product: string;
  idea: string;
  links: string;
  script: string;
  subject: string;
  hasPlan: boolean;
  aiLabel: string;
}) {
  const router = useRouter();
  const [imgs, setImgs] = useState<Record<Kind, File[]>>({ ref: [], mood: [], subjectImg: [] });
  const [ref, setRef] = useState<{ cuts: number[]; frameKeys: string[]; durationSec: number } | null>(null);
  const [videoStatus, setVideoStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sec, setSec] = useState(0);

  async function add(kind: Kind, list: FileList | null) {
    if (!list?.length) return;
    const small = await Promise.all([...list].filter((f) => f.type.startsWith("image/")).map((f) => shrinkImage(f)));
    setImgs((s) => ({ ...s, [kind]: [...s[kind], ...small].slice(0, LIMIT[kind]) }));
  }

  async function addVideo(f: File | undefined) {
    if (!f) return;
    setVideoStatus("화면 녹화 올리는 중…");
    try {
      const signed = await signRefUploadAction(props.planItemId, f.name);
      let res: Response;
      if (signed) {
        const body = new FormData();
        body.append("cacheControl", "60");
        body.append("", f);
        const up = await fetch(signed.signedUrl, { method: "PUT", body, headers: { "x-upsert": "true" } });
        if (!up.ok) throw new Error(`업로드 실패 (${up.status})`);
        setVideoStatus("컷 길이를 재는 중…");
        res = await fetch("/api/studio/refvideo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planItemId: props.planItemId, storageKey: signed.storageKey }) });
      } else {
        const fd = new FormData();
        fd.set("planItemId", props.planItemId);
        fd.set("video", f);
        setVideoStatus("컷 길이를 재는 중…");
        res = await fetch("/api/studio/refvideo", { method: "POST", body: fd });
      }
      const j = (await res.json()) as { error?: string; cuts?: number[]; frameKeys?: string[]; durationSec?: number };
      if (!res.ok || !j.cuts) throw new Error(j.error ?? "영상을 읽지 못했어요");
      setRef({ cuts: j.cuts, frameKeys: j.frameKeys ?? [], durationSec: j.durationSec ?? 0 });
      setVideoStatus(`${j.durationSec}초 · 컷 ${j.cuts.length}개 · 장면 사진 ${j.frameKeys?.length ?? 0}장을 뽑았어요`);
    } catch (e) {
      setVideoStatus(e instanceof Error ? e.message : "영상을 읽지 못했어요");
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setSec(0);
    const timer = setInterval(() => setSec((s) => s + 1), 1000);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("planItemId", props.planItemId);
      (Object.keys(imgs) as Kind[]).forEach((k) => imgs[k].forEach((f) => fd.append(k, f, f.name)));
      if (ref) {
        fd.set("refCuts", JSON.stringify(ref.cuts));
        fd.set("frameKeys", JSON.stringify(ref.frameKeys));
      }
      const res = await fetch("/api/studio/plan", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; source?: string; note?: string; scenes?: number };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "촬영 가이드를 만들지 못했어요");
      setMsg({ ok: j.source === "ai", text: j.source === "ai" ? `장면 ${j.scenes}개 촬영 가이드를 만들었어요.${j.note ? ` ${j.note}` : ""}` : (j.note ?? "기본 장면 틀로 만들었어요.") });
      setImgs({ ref: [], mood: [], subjectImg: [] });
      setRef(null);
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "촬영 가이드를 만들지 못했어요" });
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  const Pick = ({ kind, label, hint }: { kind: Kind; label: string; hint: string }) => (
    <div className="grid" style={{ gap: 6 }}>
      <div className="row between">
        <b className="small">{label}</b>
        <span className="small muted">{imgs[kind].length}/{LIMIT[kind]}장</span>
      </div>
      <label className="filepick">
        <span>＋ 사진 고르기</span>
        <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { void add(kind, e.target.files); e.target.value = ""; }} />
      </label>
      {imgs[kind].length > 0 && (
        <div className="thumbs">
          {imgs[kind].map((f, i) => (
            <span key={`${f.name}${i}`} className="thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt={`${label} ${i + 1}`} />
              <button type="button" aria-label="빼기" onClick={() => setImgs((s) => ({ ...s, [kind]: s[kind].filter((_, k) => k !== i) }))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <span className="small muted">{hint}</span>
    </div>
  );

  return (
    <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
      <fieldset className="card shoot-block">
        <legend><b>① 참고 릴스</b> <span className="small muted">따라 하고 싶은 형식</span></legend>
        <label>링크 <span className="small muted">(여러 개면 줄을 바꿔서)</span>
          <textarea name="links" defaultValue={props.links} placeholder="https://www.instagram.com/reel/..." style={{ minHeight: 56 }} />
        </label>
        <Pick kind="ref" label="캡처" hint="릴스를 보면서 장면이 바뀔 때마다 3~6장 캡처해 올려 주세요. 구도·자막 위치·분위기를 읽어요." />
        <details>
          <summary className="small"><b>컷 길이까지 똑같이 맞추고 싶다면: 화면 녹화 올리기</b></summary>
          <ol className="small" style={{ margin: "6px 0", paddingLeft: 18 }}>
            <li>아이폰: 제어 센터 → ⏺ 화면 기록 / 갤럭시: 빠른 설정 → 화면 녹화</li>
            <li>참고 릴스를 처음부터 끝까지 한 번 재생하고 녹화를 멈춰요</li>
            <li>아래에서 녹화 파일을 골라요. 컷이 바뀌는 시각을 재고 장면 사진을 뽑은 뒤, <b>영상은 바로 지워요</b></li>
          </ol>
          <input type="file" accept="video/*" disabled={busy} onChange={(e) => void addVideo(e.target.files?.[0])} />
          {videoStatus && <p className="small" role="status" style={{ margin: "6px 0 0" }}>{videoStatus}</p>}
          {ref && <div className="cuts" aria-label="참고 릴스 컷 길이">{ref.cuts.map((c, i) => <i key={i} style={{ flex: c }} title={`${i + 1}컷 ${c}초`}>{c.toFixed(1)}</i>)}</div>}
        </details>
      </fieldset>

      <fieldset className="card shoot-block">
        <legend><b>② 분위기 사진</b> <span className="small muted">핀터레스트 등, 선택</span></legend>
        <Pick kind="mood" label="분위기" hint="색감·빛·소품 배치를 따라 해요." />
      </fieldset>

      <fieldset className="card shoot-block">
        <legend><b>③ 대본</b> <span className="small muted">선택 · 없으면 AI가 써요</span></legend>
        <textarea name="script" defaultValue={props.script} maxLength={2000} placeholder="예: 시험 기간 도서관 가는 길, 이어폰 하나로 달라지는 집중력…" style={{ minHeight: 80 }} />
      </fieldset>

      <fieldset className="card shoot-block">
        <legend><b>④ 찍을 대상·소품</b></legend>
        <div className="row">
          <label style={{ flex: 1 }}>제품·주제<input type="text" name="product" defaultValue={props.product} maxLength={40} /></label>
          <label style={{ flex: 2 }}>설명 <span className="small muted">(사진 대신 글로만 써도 돼요)</span><input type="text" name="subject" defaultValue={props.subject} maxLength={800} placeholder="예: 흰색 무선 이어폰, 노트북, 머그컵, 도서관 창가 자리" /></label>
        </div>
        <Pick kind="subjectImg" label="대상·소품 사진" hint="실제로 찍을 물건·장소 사진이면 장면에 그대로 넣어요." />
        <label>보여 주고 싶은 내 경험 <span className="small muted">(선택)</span>
          <input type="text" name="idea" defaultValue={props.idea} maxLength={600} placeholder="예: 시험 기간에 도서관에서 노이즈 캔슬링을 켜는 순간" />
        </label>
      </fieldset>

      <div className="row" style={{ alignItems: "flex-end" }}>
        <label style={{ width: 180 }}>길이
          <select name="targetSec" defaultValue="">
            <option value="">{ref ? `참고 릴스대로 (${Math.round(ref.durationSec)}초)` : "참고 릴스대로 (없으면 15초)"}</option>
            <option value="15">15초</option>
            <option value="20">20초</option>
            <option value="30">30초</option>
          </select>
        </label>
        <button className="btn pri" type="submit" disabled={busy}>{busy ? `촬영 가이드 만드는 중… ${sec}초` : props.hasPlan ? "촬영 가이드 다시 만들기" : "촬영 가이드 만들기"}</button>
        <span className="small muted">{props.aiLabel}</span>
      </div>
      {msg && <p className={msg.ok ? "note ok" : "note warn"} role="status" style={{ margin: 0 }}>{msg.text}</p>}
      <p className="small muted" style={{ margin: 0 }}>사진과 화면 녹화는 분석에만 쓰고 저장하지 않아요. 참고 릴스는 형식만 빌리고 내용은 새로 만들어요.</p>
    </form>
  );
}
