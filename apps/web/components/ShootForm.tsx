"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signRefUploadAction } from "@/lib/actions";
import { shrinkImage } from "@/lib/shrink";

type Kind = "ref" | "mood" | "subjectImg";
const LIMIT: Record<Kind, number> = { ref: 6, mood: 4, subjectImg: 4 };

const SCRIPT_EX = `시험 기간, 도서관 가는 길
지하철 소음 때문에 단어가 안 들어왔는데
이어폰 하나 꽂고 집중 모드 ON
오늘은 30분 만에 한 챕터 끝`;
const SUBJECT_EX = "흰색 무선 이어폰, 이어폰 케이스, 노트북, 단어장, 머그컵, 도서관 창가 자리";
const IDEA_EX = "시험 기간에 도서관 가는 지하철에서 노이즈 캔슬링을 켜자 단어가 들어오기 시작한 순간";

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

  /** 예시 문구를 해당 칸에 넣는다 (이미 쓴 내용이 있으면 덮어쓰기 전에 묻는다). */
  function fill(e: React.MouseEvent<HTMLButtonElement>, name: string, value: string) {
    const el = e.currentTarget.form?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    if (el.value.trim() && el.value !== value && !window.confirm("지금 쓴 내용을 예시로 바꿀까요?")) return;
    el.value = value;
    el.focus();
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
        <div className="shoot-row">
          <div className="grid" style={{ gap: 10 }}>
            <label>링크 <span className="small muted">(여러 개면 줄을 바꿔서)</span>
              <textarea name="links" defaultValue={props.links} placeholder="https://www.instagram.com/reel/..." style={{ minHeight: 56 }} />
            </label>
            <Pick kind="ref" label="캡처" hint="릴스를 보면서 장면이 바뀔 때마다 3~6장 캡처해 올려 주세요. 구도·자막 위치·분위기를 읽어요." />
          </div>
          <aside className="ex" aria-label="참고 릴스 예시">
            <b className="ex-h">예시</b>
            <code className="ex-link">instagram.com/reel/Cx…</code>
            <span className="small muted">이 릴스를 보며 장면이 바뀔 때마다 캡처 →</span>
            <div className="ex-phones">
              <figure><div className="ex-phone p1" role="img" aria-label="손이 이어폰을 집는 클로즈업 예시"><i>손 클로즈업</i></div><figcaption>1 첫 장면<br />손이 이어폰을 집음</figcaption></figure>
              <figure><div className="ex-phone p2" role="img" aria-label="이어폰을 낀 뒷모습 위에 큰 자막 예시"><i className="cap">집중 모드 ON</i></div><figcaption>2 자막 화면<br />가운데 큰 글씨</figcaption></figure>
              <figure><div className="ex-phone p3" role="img" aria-label="책상 전체를 넓게 보여 주는 예시"><i>책상 전체</i></div><figcaption>3 마지막<br />넓게 보여 줌</figcaption></figure>
            </div>
            <span className="small muted">→ &ldquo;1~2초마다 컷, 손 클로즈업으로 시작, 가운데 큰 자막&rdquo;을 읽어요</span>
          </aside>
        </div>
        <details>
          <summary className="small"><b>컷 길이까지 똑같이 맞추고 싶다면: 화면 녹화 올리기</b></summary>
          <ol className="small" style={{ margin: "6px 0", paddingLeft: 18 }}>
            <li>아이폰: 제어 센터 → ⏺ 화면 기록 / 갤럭시: 빠른 설정 → 화면 녹화</li>
            <li>참고 릴스를 처음부터 끝까지 한 번 재생하고 녹화를 멈춰요</li>
            <li>아래에서 녹화 파일을 골라요. 컷이 바뀌는 시각을 재고 장면 사진을 뽑은 뒤, <b>영상은 바로 지워요</b></li>
          </ol>
          <p className="small muted" style={{ margin: "0 0 6px" }}>예시: 15초 릴스를 녹화하면 → 컷 7개 (1.2초 · 0.8초 · 2초 · 1.5초 …) 리듬 그대로 장면을 나눠요</p>
          <div className="cuts ex-cuts" aria-hidden="true">{[1.2, 0.8, 2, 1.5, 3, 2.5, 4].map((c, i) => <i key={i} style={{ flex: c }}>{c}</i>)}</div>
          <input type="file" accept="video/*" disabled={busy} onChange={(e) => void addVideo(e.target.files?.[0])} style={{ marginTop: 8 }} />
          {videoStatus && <p className="small" role="status" style={{ margin: "6px 0 0" }}>{videoStatus}</p>}
          {ref && <div className="cuts" aria-label="참고 릴스 컷 길이">{ref.cuts.map((c, i) => <i key={i} style={{ flex: c }} title={`${i + 1}컷 ${c}초`}>{c.toFixed(1)}</i>)}</div>}
        </details>
      </fieldset>

      <fieldset className="card shoot-block">
        <legend><b>② 분위기 사진</b> <span className="small muted">핀터레스트 등, 선택</span></legend>
        <div className="shoot-row">
          <Pick kind="mood" label="분위기" hint="색감·빛·소품 배치를 따라 해요." />
          <aside className="ex" aria-label="분위기 사진 예시">
            <b className="ex-h">예시</b>
            <span className="small">핀터레스트에서 <b>&ldquo;study desk aesthetic&rdquo;</b>, <b>&ldquo;베이지 책상&rdquo;</b>으로 찾은 사진 2~3장</span>
            <div className="ex-moods">
              <span className="ex-mood m1" role="img" aria-label="창가 햇빛 분위기 예시"><span>창가 햇빛</span></span>
              <span className="ex-mood m2" role="img" aria-label="베이지 책상 분위기 예시"><span>베이지 책상</span></span>
              <span className="ex-mood m3" role="img" aria-label="어두운 밤 스탠드 조명 분위기 예시"><span>밤 스탠드</span></span>
            </div>
            <span className="small muted">→ 색감 칩 <i className="swatch" style={{ background: "#efe6d8" }} /> <i className="swatch" style={{ background: "#b9a48c" }} /> <i className="swatch" style={{ background: "#2f3a45" }} />과 &ldquo;창가 자연광, 따뜻한 톤&rdquo;으로 장면마다 빛을 알려 줘요</span>
          </aside>
        </div>
      </fieldset>

      <fieldset className="card shoot-block">
        <legend><b>③ 대본</b> <span className="small muted">선택 · 없으면 AI가 써요</span></legend>
        <div className="shoot-row">
          <textarea name="script" defaultValue={props.script} maxLength={2000} placeholder="하고 싶은 말을 한 줄씩 써 주세요" style={{ minHeight: 120 }} />
          <aside className="ex" aria-label="대본 예시">
            <b className="ex-h">예시</b>
            <pre className="ex-text">{SCRIPT_EX}</pre>
            <span className="small muted">→ 한 줄이 한 장면의 대사·자막이 돼요</span>
            <button type="button" className="btn sm" onClick={(e) => fill(e, "script", SCRIPT_EX)}>이 예시로 채우기</button>
          </aside>
        </div>
      </fieldset>

      <fieldset className="card shoot-block">
        <legend><b>④ 찍을 대상·소품</b></legend>
        <div className="shoot-row">
          <div className="grid" style={{ gap: 10 }}>
            <label>제품·주제<input type="text" name="product" defaultValue={props.product} maxLength={40} /></label>
            <label>설명 <span className="small muted">(사진 대신 글로만 써도 돼요)</span><input type="text" name="subject" defaultValue={props.subject} maxLength={800} placeholder="찍을 물건·장소를 쉼표로" /></label>
            <Pick kind="subjectImg" label="대상·소품 사진" hint="실제로 찍을 물건·장소 사진이면 장면에 그대로 넣어요." />
            <label>보여 주고 싶은 내 경험 <span className="small muted">(선택)</span>
              <input type="text" name="idea" defaultValue={props.idea} maxLength={600} placeholder="내가 실제로 겪은 순간 한 줄" />
            </label>
          </div>
          <aside className="ex" aria-label="찍을 대상 예시">
            <b className="ex-h">예시</b>
            <dl className="ex-dl">
              <dt>제품·주제</dt><dd>무선 이어폰</dd>
              <dt>설명</dt><dd>{SUBJECT_EX}</dd>
              <dt>사진</dt><dd>내 책상 위 이어폰 케이스, 도서관 창가 자리
                <div className="ex-shots">
                  <figure><img src="/examples/subject-1.webp" alt="책상 위 이어폰 케이스 예시" loading="lazy" /><figcaption>이어폰 케이스</figcaption></figure>
                  <figure><img src="/examples/subject-2.webp" alt="도서관 창가 자리 예시" loading="lazy" /><figcaption>도서관 창가</figcaption></figure>
                </div>
              </dd>
              <dt>내 경험</dt><dd>{IDEA_EX}</dd>
            </dl>
            <span className="small muted">→ &ldquo;휴대폰을 책상 위 45도에 고정하고, 손이 오른쪽에서 들어와 케이스를 열어요&rdquo;처럼 찍는 법을 알려 줘요</span>
            <button type="button" className="btn sm" onClick={(e) => { fill(e, "subject", SUBJECT_EX); fill(e, "idea", IDEA_EX); }}>설명·경험 예시로 채우기</button>
          </aside>
        </div>
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
