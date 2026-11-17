"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicApp } from "@/lib/apply";

const RUBRIC: Record<string, string> = {
  E1: "SNS 운영 성과", E2: "사전 제작 콘텐츠", E3: "툴 활용", E4: "분야 연결 경험",
  E5: "브랜드 이해", E6: "기획안 구체성", E7: "협업 경험", E8: "진정성·스토리",
};
const QUICK = ["다음 문항으로 가요", "이 문항 더 짧게 다듬어 주세요", "숫자를 넣어서 다시 써 주세요", "다른 경험으로 바꿀래요"];
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
  const [input, setInput] = useState(prefill ?? "");
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState(0);
  const [notice, setNotice] = useState<string>();
  const [tab, setTab] = useState<"chat" | "sheet">("chat");
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

  async function send(raw?: string) {
    const message = (raw ?? input).trim();
    if (!message || busy) return;
    setBusy(true);
    setNotice(undefined);
    setInput("");
    const edits = collectEdits();
    // 내 말을 먼저 보여 준다
    setApp((a) => ({ ...a, chat: [...a.chat, { role: "user", text: message, at: new Date().toISOString() }] }));
    try {
      const res = await fetch("/api/apply/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, edits }) });
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
    } finally {
      setBusy(false);
    }
  }

  async function save(body: Record<string, unknown>, label = "저장했어요") {
    const res = await fetch("/api/apply/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json()) as { app?: PublicApp };
    if (data.app) {
      setApp(data.app);
      setTexts(data.app.answers.map((a) => a.text));
      setDirty(new Set());
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
              {m.edits?.map((e) => (
                <button key={e.q} type="button" className="edit-chip" onClick={() => { setTab("sheet"); cards.current[e.q]?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                  ✎ {e.q + 1}번 · {e.change}
                </button>
              ))}
            </div>
          ))}
          {busy && (
            <div className="msg coach">
              <div className="bubble thinking"><i className="spin" aria-hidden="true" /> 코치가 생각하는 중… {sec}초{aiMode === "ollama" && sec > 8 ? " (로컬 모델은 조금 걸려요)" : ""}</div>
            </div>
          )}
          <div ref={chatEnd} />
        </div>
        {notice && <p className="note warn small" style={{ margin: 0 }}>{notice}</p>}
        <div className="quick">
          {QUICK.map((q) => <button key={q} type="button" className="chip-btn" disabled={busy} onClick={() => send(q)}>{q}</button>)}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder="경험이나 생각을 편하게 적어 주세요 (Enter 보내기 · Shift+Enter 줄바꿈)"
            rows={3}
            aria-label="코치에게 보낼 말"
            disabled={busy}
          />
          <button className="btn pri" type="submit" disabled={busy || !input.trim()}>{busy ? <i className="spin" aria-hidden="true" /> : "보내기"}</button>
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
