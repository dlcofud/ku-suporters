"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicApp } from "@/lib/apply";

const RUBRIC: Record<string, string> = {
  E1: "SNS 운영 성과", E2: "사전 제작 콘텐츠", E3: "툴 활용", E4: "분야 연결 경험",
  E5: "브랜드 이해", E6: "기획안 구체성", E7: "협업 경험", E8: "진정성·스토리",
};
/** core apply.DRAFT_ALL 과 같은 문장 (클라이언트에서 core 전체를 불러오지 않으려고 따로 둔다) */
const DRAFT_ALL = "합격 경향을 참고해서 모든 문항 초안을 먼저 써 주세요";
const blanksOf = (t: string) => [...t.matchAll(/【([^】]{1,30})】/g)].map((m) => m[1]!.trim());
const QUICK = ["다음 문항으로 가요", "이 문항 더 짧게 다듬어 주세요", "숫자를 넣어서 다시 써 주세요", "다른 경험으로 바꿀래요", "관련 자료가 없어요"];
const ACCEPT = ".txt,.md,.docx,.hwpx,.pdf,.png,.jpg,.jpeg,.webp,image/*";
const MAX_FILES = 6;
/** Vercel 요청 크기(4.5MB) 안에 들어가게 */
const MAX_TOTAL = 4 * 1024 * 1024;

/** 큰 사진은 긴 변 1600px JPEG로 줄인다 (글씨는 읽을 수 있을 만큼) */
async function shrinkImage(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.type === "image/gif" || f.size < 900 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const count = (s: string) => [...s].length;
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Edit = { q: number; change: string };

/**
 * 지원서 작성 화면.
 * 왼쪽: 코치와 대화 / 오른쪽: 공고 문항으로 만든 지원서 양식.
 * 코치가 글을 쓰거나 고치면 해당 문항으로 스크롤하고 한 글자씩 써지는 모습으로 보여 준다.
 */
export function ApplyStudio({ initial, activityName, aiLabel, aiMode, prefill }: { initial: PublicApp; activityName: string; aiLabel: string; aiMode: string; prefill?: string }) {
  const [app, setApp] = useState(initial);
  const [texts, setTexts] = useState<string[]>(initial.answers.map((a) => a.text));
  const [typing, setTyping] = useState<Record<number, boolean>>({});
  const [flash, setFlash] = useState<Record<number, boolean>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  /** 응답이 왔을 때 '지금 화면의 글'을 읽기 위한 거울 (setTexts 클로저가 오래된 값을 보지 않게) */
  const textsRef = useRef<string[]>(texts);
  textsRef.current = texts;
  const [input, setInput] = useState(prefill ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState(0);
  const [notice, setNotice] = useState<string>();
  const [tab, setTab] = useState<"chat" | "sheet">("chat");
  const chatInput = useRef<HTMLTextAreaElement>(null);
  /** 빈칸 칩을 누르면 대화창에 '【빈칸】: '을 넣어 바로 답하게 한다 */
  function answerBlank(i: number, b: string) {
    setTab("chat");
    setInput(`${i + 1}번 【${b}】: `);
    setTimeout(() => chatInput.current?.focus(), 50);
  }
  const [unseen, setUnseen] = useState(0);
  const [saved, setSaved] = useState<string>();
  const [newQ, setNewQ] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string }>();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const [revealLast, setRevealLast] = useState<number | null>(null);

  // 효과 함수는 정리 함수 말고는 아무것도 돌려주면 안 된다 (scrollIntoView가 Promise를 돌려주는 브라우저가 있다)
  useEffect(() => {
    void chatEnd.current?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "end" });
  }, [app.chat.length, busy]);
  useEffect(() => {
    if (!busy) {
      setSec(0);
      return;
    }
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const done = useMemo(() => texts.filter((t) => t.trim().length > 0).length, [texts]);

  /** 코치가 고친 문항을 한 글자씩 써 내려간다 */
  function typeInto(q: number, target: string) {
    void cards.current[q]?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
    setFlash((f) => ({ ...f, [q]: true }));
    setTimeout(() => setFlash((f) => ({ ...f, [q]: false })), 2400);
    if (reduceMotion()) {
      setTexts((t) => t.map((x, i) => (i === q ? target : x)));
      return;
    }
    const chars = [...target];
    const total = Math.min(2200, 300 + chars.length * 6); // 길어도 2.2초 안에
    const start = performance.now();
    setTyping((t) => ({ ...t, [q]: true }));
    const step = (nowT: number) => {
      const k = Math.min(chars.length, Math.ceil(((nowT - start) / total) * chars.length));
      setTexts((t) => t.map((x, i) => (i === q ? chars.slice(0, k).join("") : x)));
      if (k < chars.length) requestAnimationFrame(step);
      else setTyping((t) => ({ ...t, [q]: false }));
    };
    requestAnimationFrame(step);
  }

  function collectEdits() {
    return [...dirty].map((q) => ({ q, text: texts[q] ?? "" }));
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const picked = await Promise.all([...list].map(shrinkImage));
    const next = [...files, ...picked].slice(0, MAX_FILES);
    const total = next.reduce((n, f) => n + f.size, 0);
    if (files.length + picked.length > MAX_FILES) setNotice(`자료는 한 번에 ${MAX_FILES}개까지 올릴 수 있어요`);
    else if (total > MAX_TOTAL) setNotice(`자료가 모두 ${kb(total)}예요. 한 번에 4MB까지 보낼 수 있어서 나눠 보내 주세요.`);
    else setNotice(undefined);
    setFiles(total > MAX_TOTAL ? files : next);
  }

  async function send(raw?: string) {
    const sending = raw === undefined ? files : [];
    const message = (raw ?? input).trim();
    if ((!message && !sending.length) || busy) return;
    setBusy(true);
    setNotice(undefined);
    setInput("");
    if (sending.length) setFiles([]);
    const edits = collectEdits();
    const shown = message || "자료를 올렸어요. 정리해서 맞는 문항에 써 주세요.";
    // 내 말을 먼저 보여 준다
    setApp((a) => ({ ...a, chat: [...a.chat, { role: "user", text: shown, at: new Date().toISOString(), ...(sending.length ? { files: sending.map((f) => f.name) } : {}) }] }));
    try {
      let init: RequestInit;
      if (sending.length) {
        const fd = new FormData();
        fd.set("message", message);
        fd.set("edits", JSON.stringify(edits));
        for (const f of sending) fd.append("files", f, f.name);
        init = { method: "POST", body: fd };
      } else {
        init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, edits }) };
      }
      const res = await fetch("/api/apply/chat", init);
      const data = (await res.json()) as { app?: PublicApp; edits?: Edit[]; notice?: string; error?: string };
      if (!res.ok || !data.app) throw new Error(data.error || "답을 받지 못했어요");
      setDirty(new Set());
      setApp(data.app);
      setRevealLast(data.app.chat.length - 1);
      setNotice(data.notice);
      const changed = data.edits ?? [];
      // 바뀌지 않은 문항은 서버 값으로 맞춘다
      setTexts((t) => data.app!.answers.map((a, i) => (changed.some((e) => e.q === i) ? t[i] ?? "" : a.text)));
      if (changed.length) {
        if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches && tab === "chat") setUnseen((n) => n + changed.length);
        changed.forEach((e, k) => setTimeout(() => typeInto(e.q, data.app!.answers[e.q]!.text), 350 + k * 400));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "연결에 실패했어요");
      setApp((a) => ({ ...a, chat: a.chat.slice(0, -1) }));
      setInput(message);
      if (sending.length) setFiles(sending);
    } finally {
      setBusy(false);
    }
  }

  async function save(body: Record<string, unknown>, label = "저장했어요") {
    const sent = new Map((Array.isArray(body.edits) ? (body.edits as { q: number; text: string }[]) : []).map((e) => [e.q, e.text]));
    const res = await fetch("/api/apply/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json()) as { app?: PublicApp };
    if (data.app) {
      // 저장하는 동안 다른 문항(또는 같은 문항)에 더 쓴 글은 지우지 않는다:
      // 화면 글이 '보낸 글(안 보낸 문항은 서버 글)'과 다르면 아직 고치는 중이므로 그대로 두고 저장 대기로 남긴다
      const local = textsRef.current;
      const keep = new Set<number>();
      const next = data.app.answers.map((a, i) => {
        const mine = local[i];
        if (!body.reset && mine !== undefined && mine !== (sent.get(i) ?? a.text)) {
          keep.add(i);
          return mine;
        }
        return a.text;
      });
      setApp(data.app);
      setTexts(next);
      setDirty(keep);
      setSaved(label);
      setTimeout(() => setSaved(undefined), 1800);
    }
  }

  /** 지원서 양식 파일(또는 붙여넣은 문항)을 올려 문항을 합친다 */
  async function uploadForm(fd: FormData) {
    setFormBusy(true);
    setFormMsg(undefined);
    try {
      const res = await fetch("/api/apply/form", { method: "POST", body: fd });
      const data = (await res.json()) as { app?: PublicApp; added?: number; merged?: number; fields?: number; error?: string };
      if (!res.ok || !data.app) throw new Error(data.error || "양식을 읽지 못했어요");
      setApp(data.app);
      setTexts(data.app.answers.map((a) => a.text));
      setRevealLast(data.app.chat.length - 1);
      setFormMsg({ ok: true, text: `문항 ${data.added ?? 0}개를 더하고 ${data.merged ?? 0}개를 합쳤어요${data.fields ? ` · 직접 채울 항목 ${data.fields}개` : ""}` });
      setPaste("");
      setPasteOpen(false);
    } catch (e) {
      setFormMsg({ ok: false, text: e instanceof Error ? e.message : "양식을 읽지 못했어요" });
    } finally {
      setFormBusy(false);
    }
  }

  /** 고치는 중이던 글을 먼저 저장하고 워드 파일을 받는다 (blur 저장과 내려받기가 엇갈리지 않게) */
  const [downloading, setDownloading] = useState(false);
  async function downloadDocx() {
    const left = texts.reduce((n, t) => n + blanksOf(t ?? "").length, 0);
    if (left && !confirm(`아직 채우지 않은 【빈칸】이 ${left}개 있어요. 그래도 받을까요?`)) return;
    setDownloading(true);
    try {
      if (dirty.size) {
        const res = await fetch("/api/apply/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits: [...dirty].map((q) => ({ q, text: texts[q] ?? "" })) }) });
        if (!res.ok) throw new Error("저장하지 못했어요");
        setDirty(new Set());
      }
      window.location.href = "/api/apply/docx";
      setSaved("워드 파일을 내려받아요");
    } catch (e) {
      setSaved(e instanceof Error ? e.message : "내려받지 못했어요");
    } finally {
      setTimeout(() => { setDownloading(false); setSaved(undefined); }, 1800);
    }
  }

  async function copyAll() {
    const all = app.questions.map((q, i) => `${i + 1}. ${q.text}\n\n${texts[i] ?? ""}`).join("\n\n\n");
    await navigator.clipboard.writeText(all).catch(() => undefined);
    setSaved("전체 복사했어요");
    setTimeout(() => setSaved(undefined), 1800);
  }

  const last = app.chat.length - 1;

  return (
    <div className="apply">
      <div className="apply-tabs" role="tablist" aria-label="지원서 작성 화면">
        <button role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "on" : undefined} onClick={() => setTab("chat")}>코치와 대화</button>
        <button role="tab" aria-selected={tab === "sheet"} className={tab === "sheet" ? "on" : undefined} onClick={() => { setTab("sheet"); setUnseen(0); }}>
          지원서 {done}/{app.questions.length}{unseen > 0 && <i className="badge">{unseen}</i>}
        </button>
      </div>

      {/* ---------------- 대화 ---------------- */}
      <section className={`card chat${tab === "chat" ? " show" : ""}`} aria-label="코치와 대화">
        <div className="row between chat-head">
          <b>지원서 코치</b>
          <span className={aiMode === "demo" ? "tag" : "tag k-post"}>{aiLabel}</span>
        </div>
        <div className="msgs" aria-live="polite">
          {app.chat.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <Bubble text={m.text} animate={i === last && i === revealLast && m.role === "coach"} />
              {m.files?.length ? <div className="msg-files">{m.files.map((f) => <span key={f} className="file-chip">📎 {f}</span>)}</div> : null}
              {m.edits?.map((e) => (
                <button key={e.q} type="button" className="edit-chip" onClick={() => { setTab("sheet"); cards.current[e.q]?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                  ✎ {e.q + 1}번 · {e.change}
                </button>
              ))}
            </div>
          ))}
          {busy && (
            <div className="msg coach">
              <div className="bubble thinking"><i className="spin" aria-hidden="true" /> {app.chat.at(-1)?.files?.length ? "자료를 읽고 정리하는 중…" : "코치가 생각하는 중…"} {sec}초{aiMode === "ollama" && sec > 8 ? " (로컬 모델은 조금 걸려요)" : ""}</div>
            </div>
          )}
          <div ref={chatEnd} />
        </div>
        {notice && <p className="note warn small" style={{ margin: 0 }}>{notice}</p>}
        <div className="quick">
          <button type="button" className="chip-btn hl" disabled={busy} onClick={() => send(DRAFT_ALL)} title="합격 후기 경향을 참고해 모든 문항 초안을 한 번에 써요. 모르는 내용은 【빈칸】으로 남겨요">✨ 경향 보고 전체 초안</button>
          {QUICK.map((q) => <button key={q} type="button" className="chip-btn" disabled={busy} onClick={() => send(q)}>{q}</button>)}
        </div>
        {files.length > 0 && (
          <div className="pending-files" aria-label="보낼 자료">
            {files.map((f, k) => (
              <span key={`${f.name}${k}`} className="file-chip">
                📎 {f.name} <span className="muted">{kb(f.size)}</span>
                <button type="button" aria-label={`${f.name} 빼기`} onClick={() => setFiles((l) => l.filter((_, j) => j !== k))}>✕</button>
              </span>
            ))}
          </div>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="btn attach" title="자료 올리기: 예전 자소서·활동 보고서·포트폴리오·캡처 (워드·한글·PDF·이미지, 여러 개)" aria-label="자료 올리기" style={{ cursor: busy ? "not-allowed" : "pointer" }}>
            📎
            <input type="file" multiple accept={ACCEPT} hidden disabled={busy} onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <textarea
            ref={chatInput}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={files.length ? "자료에 대해 한마디 덧붙여도 돼요 (예: 2번 문항에 써 주세요)" : "경험이나 생각을 편하게 적어 주세요. 📎로 자료를 올려도 돼요 (Enter 보내기)"}
            rows={3}
            aria-label="코치에게 보낼 말"
            disabled={busy}
          />
          <button className="btn pri" type="submit" disabled={busy || (!input.trim() && !files.length)}>{busy ? <i className="spin" aria-hidden="true" /> : "보내기"}</button>
        </form>
      </section>

      {/* ---------------- 지원서 양식 ---------------- */}
      <section className={`sheet${tab === "sheet" ? " show" : ""}`} aria-label="지원서 양식">
        <div className="row between sheet-head">
          <div>
            <span className="eyebrow">공고에서 가져온 문항 · {activityName}</span>
            <h2>지원서 <span className="num">{done}/{app.questions.length}</span></h2>
          </div>
          <div className="row">
            {saved && <span className="small" role="status" style={{ fontWeight: 800 }}>{saved}</span>}
            <button type="button" className="btn" onClick={copyAll}>전체 복사</button>
            <button type="button" className="btn" onClick={downloadDocx} disabled={downloading || !app.questions.length} title="문항과 답을 워드(.docx)로 받아요">{downloading ? "만드는 중…" : "워드로 받기"}</button>
            <button type="button" className="btn" onClick={() => { if (confirm("대화와 지원서 글을 모두 지우고 처음부터 할까요?")) save({ reset: true }, "처음부터 다시 시작해요"); }}>처음부터</button>
          </div>
        </div>
        {app.questions.map((q, i) => {
          const n = count(texts[i] ?? "");
          const over = q.charLimit ? n > q.charLimit : false;
          const a = app.answers[i];
          return (
            <article key={i} ref={(el) => { cards.current[i] = el; }} className={`card qcard${app.focus === i ? " focus" : ""}${flash[i] ? " flash" : ""}`}>
              <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <h3><span className="qn">{i + 1}</span>{q.text}</h3>
                {app.focus === i && <span className="tag k-hl" style={{ flex: "none" }}>지금 이야기 중</span>}
              </div>
              <div className="row small">
                {q.emphasize.slice(0, 3).map((c) => <span key={c} className="tag" title="이 문항에서 강조하면 좋은 합격 요인">{c} {RUBRIC[c]}</span>)}
              </div>
              <textarea
                value={texts[i] ?? ""}
                readOnly={!!typing[i]}
                onChange={(e) => { const v = e.target.value; setTexts((t) => t.map((x, k) => (k === i ? v : x))); setDirty((d) => new Set(d).add(i)); }}
                onBlur={() => { if (dirty.has(i)) save({ edits: [{ q: i, text: texts[i] ?? "" }] }); }}
                placeholder="코치와 이야기하면 여기에 초안이 써져요. 직접 써도 돼요."
                aria-label={`${i + 1}번 문항 답`}
                className={typing[i] ? "typing" : undefined}
              />
              {blanksOf(texts[i] ?? "").length > 0 && !typing[i] && (
                <div className="blanks" aria-label="채울 빈칸">
                  <span className="small">채울 빈칸</span>
                  {blanksOf(texts[i] ?? "").map((b, k) => (
                    <button key={`${b}${k}`} type="button" className="blank-chip" disabled={busy} onClick={() => answerBlank(i, b)} title="눌러서 대화창에서 답하기">【{b}】</button>
                  ))}
                </div>
              )}
              <div className="row between small">
                <span className="muted">
                  {typing[i] ? "코치가 쓰는 중…" : a?.text ? (dirty.has(i) || a.by === "user" ? "내가 고친 글" : "코치가 쓴 초안 · 직접 고쳐도 돼요") : "아직 비어 있어요"}
                </span>
                <span className={over ? "red" : undefined} style={{ fontWeight: 800 }}>{n}{q.charLimit ? ` / ${q.charLimit}자` : "자"}{over ? " · 초과" : ""}</span>
              </div>
              {app.focus !== i && (
                <button type="button" className="link-btn small" disabled={busy} onClick={() => { setTab("chat"); send(`${i + 1}번 문항 이야기해요`); }}>이 문항 이야기하기 →</button>
              )}
            </article>
          );
        })}
        {app.materials && app.materials.length > 0 && (
          <section className="card">
            <div className="row between">
              <h3>올린 자료</h3>
              <span className="small muted">{app.materials.length}개</span>
            </div>
            <ul className="fields">
              {app.materials.map((m) => (
                <li key={m.id}>
                  <b>📎 {m.name}</b>
                  <span className="small muted"> — {m.summary ?? (m.text ? "아직 정리 전이에요. 코치에게 '자료 정리해 줘'라고 보내 주세요." : "정리하지 못했어요. 다시 올려 주세요.")}</span>
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ margin: 0 }}>코치가 정리한 내용만 남기고, 이미지·PDF 원본은 저장하지 않아요.</p>
          </section>
        )}
        {app.formFields && app.formFields.length > 0 && (
          <section className="card">
            <div className="row between">
              <h3>양식에서 직접 채울 항목</h3>
              {app.formName && <span className="small muted">{app.formName}</span>}
            </div>
            <p className="small muted" style={{ margin: 0 }}>서술형이 아니라 칸을 채우는 항목이에요. 코치와 이야기한 경험은 여기에도 쓸 수 있어요.</p>
            <ul className="fields">
              {app.formFields.map((f) => (
                <li key={f.title}><b>{f.title}</b>{f.detail && <span className="small muted"> — {f.detail}</span>}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="card formup">
          <h3>지원서 양식 올리기</h3>
          <p className="small muted" style={{ margin: 0 }}>로그인해야 받을 수 있는 양식이 있다면 받아서 올려 주세요. 서술형 문항과 글자 수를 읽어 위에 더하고, 공고 문항과 겹치면 하나로 합쳐요. 파일은 저장하지 않아요.</p>
          <div className="row">
            <label className="btn" style={{ cursor: formBusy ? "progress" : "pointer" }}>
              {formBusy ? <><i className="spin" aria-hidden="true" /> 읽는 중…</> : "파일 고르기 (.docx · .hwpx)"}
              <input type="file" accept=".docx,.hwpx,.txt" hidden disabled={formBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.set("file", f); uploadForm(fd); } e.target.value = ""; }} />
            </label>
            <button type="button" className="link-btn small" onClick={() => setPasteOpen((v) => !v)}>{pasteOpen ? "닫기" : "글로 붙여넣기"}</button>
          </div>
          {pasteOpen && (
            <form className="grid" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (paste.trim()) { const fd = new FormData(); fd.set("text", paste); uploadForm(fd); } }}>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"1. 지원 동기를 작성해 주세요 (500자)\n2. 만들고 싶은 콘텐츠를 제안해 주세요 (300자)"} style={{ minHeight: 100 }} aria-label="양식 문항 붙여넣기" />
              <button className="btn" type="submit" disabled={formBusy || !paste.trim()} style={{ justifySelf: "start" }}>문항 읽기</button>
            </form>
          )}
          {formMsg && <p className={formMsg.ok ? "note ok small" : "note warn small"} role="status" style={{ margin: 0 }}>{formMsg.text}</p>}
        </section>
        <form className="card" onSubmit={(e) => { e.preventDefault(); if (newQ.trim()) { save({ addQuestion: newQ }, "문항을 더했어요"); setNewQ(""); } }}>
          <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
            <label style={{ flex: 1, minWidth: 0 }}>문항 하나 직접 추가<input type="text" value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="예: 만들고 싶은 콘텐츠를 제안해 주세요 (300자)" /></label>
            <button className="btn" type="submit">더하기</button>
          </div>
        </form>
        <p className="small muted" style={{ margin: 0 }}>코치는 대화에서 말씀해 주신 사실만 써요. 숫자나 경험을 지어내지 않으니, 비어 있는 부분은 코치의 질문에 답하며 채워 주세요. 최종 제출 전에 꼭 내 말투로 한 번 더 다듬어 주세요.</p>
      </section>
    </div>
  );
}

/** 말풍선. 새로 온 코치 말은 한 글자씩 나타난다 */
function Bubble({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate && !reduceMotion() ? "" : text);
  useEffect(() => {
    if (!animate || reduceMotion()) {
      setShown(text);
      return;
    }
    const chars = [...text];
    const total = Math.min(1400, 200 + chars.length * 12);
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(chars.length, Math.ceil(((t - start) / total) * chars.length));
      setShown(chars.slice(0, k).join(""));
      if (k < chars.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, animate]);
  return <div className="bubble">{shown}</div>;
}
