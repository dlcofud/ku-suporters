"use client";

import { useMemo, useState } from "react";
import type { account } from "@supportlab/core";
import { CopyButton } from "./CopyButton";

type Lab = account.LabState;
type Slot = account.LabSlot;

/**
 * 계정 실험실 (단어 모으기).
 *  1. 가운데에 질문이 하나씩 나온다 → 답하면 그 답에서 중요한 단어만 보드에 쌓인다
 *  2. 3개 이상 답하면 '한 단어로 모으기' → 계정 정체성을 대표하는 한 단어 + 소개글 · 이름 칸
 * 서버: /api/account/lab (단어 뽑기는 규칙으로, 한 단어 · 소개글은 AI로)
 */
export function AccountLab({ initial, aiOn, questions, bioMax, toDraft }: { initial: Lab; aiOn: boolean; questions: account.LabQuestion[]; bioMax: number; toDraft?: (fd: FormData) => Promise<void> }) {
  const [lab, setLab] = useState<Lab>(initial);
  const [skipped, setSkipped] = useState<Slot[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "add" | "brew">("");
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [fresh, setFresh] = useState<Slot>();

  const has = useMemo(() => new Set(lab.ingredients.map((i) => i.slot)), [lab.ingredients]);
  const q = questions.find((x) => !has.has(x.slot) && !skipped.includes(x.slot));
  const step = Math.min(has.size + skipped.length + 1, questions.length);
  const canBrew = has.size >= 3;
  const brew = lab.brew;
  const word = brew ? (brew.word ?? brew.creature ?? "") : "";
  const words = lab.ingredients.flatMap((i) => (i.words ?? []).map((w) => ({ w, slot: i.slot })));

  async function send(fields: Record<string, string>) {
    setError(undefined);
    setNotice(undefined);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const res = await fetch("/api/account/lab", { method: "POST", body: fd });
    const j = (await res.json().catch(() => ({}))) as { lab?: Lab; notice?: string; error?: string };
    if (!res.ok || !j.lab) {
      setError(j.error ?? "잠깐 문제가 생겼어요. 다시 해 보세요.");
      return undefined;
    }
    setLab(j.lab);
    if (j.notice) setNotice(j.notice);
    return j.lab;
  }

  async function add(slot: Slot, value: string) {
    if (!value.trim()) return;
    setBusy("add");
    const ok = await send({ action: "add", slot, text: value });
    setBusy("");
    if (ok) {
      setText("");
      setFresh(slot);
    }
  }

  async function run(action: "brew" | "reset" | "remove", slot?: Slot) {
    if (action === "reset" && !confirm("답과 결과를 모두 지우고 처음부터 할까요?")) return;
    setBusy(action === "brew" ? "brew" : "add");
    await send(slot ? { action, slot } : { action });
    if (action !== "brew") setSkipped([]);
    setBusy("");
  }

  // ---- 결과: 한 단어 ----
  if (brew) {
    return (
      <div className="lab2">
        <div className="lab2-final">
          <div className="lab2-cloud done" aria-hidden="true">
            {words.map((x, i) => (
              <span key={x.w + i} className="lab2-word" style={{ animationDelay: `${i * 40}ms` }}>
                {x.w}
              </span>
            ))}
          </div>
          <span className="small muted">이 계정을 대표하는 한 단어</span>
          <strong className="lab2-one">{word}</strong>
          <p className="lab2-identity">{brew.identity}</p>
          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
            <button type="button" className="btn small-btn" onClick={() => run("brew")} disabled={!!busy}>
              {busy === "brew" ? "다시 만드는 중…" : "다시 만들기"}
            </button>
            <button type="button" className="btn small-btn" onClick={() => run("reset")} disabled={!!busy}>
              처음부터
            </button>
          </div>
        </div>
        {notice && <p className="note small">{notice}</p>}
        {error && <p className="note warn small" role="alert">{error}</p>}
        <LabResult brew={brew} bioMax={bioMax} toDraft={toDraft} />
      </div>
    );
  }

  // ---- 질문 · 단어 모으기 ----
  return (
    <div className="lab2">
      <div className="lab2-ask">
        {q ? (
          <>
            <span className="small muted">
              질문 {step} / {questions.length}
            </span>
            <h3 className="lab2-q">{q.ask}</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {q.why}
            </p>
            <form
              className="lab2-input"
              onSubmit={(e) => {
                e.preventDefault();
                void add(q.slot, text);
              }}
            >
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={q.placeholder} maxLength={300} disabled={!!busy} aria-label={q.ask} />
              <button type="submit" className="btn pri" disabled={!!busy || !text.trim()}>
                {busy === "add" ? "…" : "넣기"}
              </button>
            </form>
            <div className="lab2-chips">
              {q.chips
                .filter((c) => c !== "아직 잘 모르겠어요" && c !== "아직 없어요")
                .map((c) => (
                  <button key={c} type="button" className="lab-chip" disabled={!!busy} onClick={() => add(q.slot, c)}>
                    {c}
                  </button>
                ))}
              <button type="button" className="lab-chip ghost" disabled={!!busy} onClick={() => setSkipped((s) => [...s, q.slot])}>
                건너뛰기
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="lab2-q">{canBrew ? "단어가 다 모였어요" : "답이 3개 이상 있어야 해요"}</h3>
            {!canBrew && (
              <button type="button" className="lab-chip" onClick={() => setSkipped([])}>
                건너뛴 질문 다시 보기
              </button>
            )}
          </>
        )}
      </div>

      <div className={`lab2-cloud${busy === "brew" ? " merging" : ""}`} aria-live="polite">
        {words.length === 0 ? (
          <span className="small muted">답하면 중요한 단어가 여기에 모여요</span>
        ) : (
          words.map((x, i) => (
            <span key={x.w + i} className={`lab2-word${x.slot === fresh ? " new" : ""}`}>
              {x.w}
            </span>
          ))
        )}
      </div>

      <div className="lab2-actions">
        <button type="button" className="btn pri" onClick={() => run("brew")} disabled={!canBrew || !!busy}>
          {busy === "brew" ? "한 단어로 모으는 중…" : canBrew ? "한 단어로 모으기" : `답 ${has.size}/3 · 3개부터 모을 수 있어요`}
        </button>
        {lab.ingredients.length > 0 && (
          <details className="lab2-answers">
            <summary className="small">내 답 {lab.ingredients.length}개 보기 · 고치기</summary>
            <ul className="clean small">
              {lab.ingredients.map((i) => (
                <li key={i.slot} className="row between">
                  <span>
                    <b>{questions.find((x) => x.slot === i.slot)?.potion}</b> {i.text}
                  </span>
                  <button type="button" className="lab-x" onClick={() => run("remove", i.slot)} disabled={!!busy} aria-label="이 답 지우기">
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="lab-reset small" onClick={() => run("reset")} disabled={!!busy}>
              처음부터
            </button>
          </details>
        )}
      </div>
      {notice && <p className="note small">{notice}</p>}
      {error && <p className="note warn small" role="alert">{error}</p>}
      {!aiOn && <p className="small muted" style={{ margin: 0, textAlign: "center" }}>지금은 AI가 연결되지 않아 내 답의 단어로 기본 결과를 만들어요.</p>}
    </div>
  );
}

/** 인스타 프로필 초안에 넣기 (공식 연결된 계정만) */
function ToDraft({ action, field, value }: { action: (fd: FormData) => Promise<void>; field: "bio" | "name"; value: string }) {
  return (
    <form action={action}>
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={value} />
      <button type="submit" className="btn small-btn">
        초안에 넣기
      </button>
    </form>
  );
}

const KIND: Record<account.LabPillar["kind"], string> = { teach: "알려 주기", relate: "공감하기", show: "보여 주기" };

function LabResult({ brew, bioMax, toDraft }: { brew: account.LabBrew; bioMax: number; toDraft?: (fd: FormData) => Promise<void> }) {
  return (
    <section className="lab2-result" aria-label="이 단어로 만든 프로필">
      <h3 className="acct-h">이 단어로 만든 프로필</h3>
      <div className="lab2-bios">
        {brew.bios.map((b) => (
          <div key={b.concept + b.text} className="lab2-bio">
            <span className="small muted">{b.concept}</span>
            <pre>{b.text}</pre>
            <div className="row between">
              <span className="small muted">
                {b.text.length}/{bioMax}자
              </span>
              <span className="row" style={{ gap: 6 }}>
                {toDraft && <ToDraft action={toDraft} field="bio" value={b.text} />}
                <CopyButton text={b.text} />
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid" style={{ gap: 6 }}>
        <b className="small">이름 칸</b>
        {brew.names.map((x) => (
          <div key={x} className="row between acct-line">
            <span>{x}</span>
            <span className="row" style={{ gap: 6 }}>
              {toDraft && <ToDraft action={toDraft} field="name" value={x} />}
              <CopyButton text={x} />
            </span>
          </div>
        ))}
      </div>
      <details className="lab2-more">
        <summary className="small">
          <b>콘텐츠 방향 더 보기</b> <span className="muted">기둥 3개 · 2주 할 일 · 스레드 · 블로그</span>
        </summary>
        <div className="grid" style={{ gap: 12, marginTop: 10 }}>
          <div className="lab2-pillars">
            {brew.pillars.map((p) => (
              <div key={p.name} className="lab2-pillar">
                <span className="small muted">{KIND[p.kind]}</span>
                <b>{p.name}</b>
                <ul className="small">
                  {p.ideas.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gap: 4 }}>
            <b className="small">앞으로 2주</b>
            <ol className="lab-steps small">
              {brew.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <p className="small" style={{ margin: 0 }}>
            <b>스레드</b> {brew.expand.threads}
            <br />
            <b>블로그</b> {brew.expand.blog}
            <br />
            <b>서포터즈 지원과 연결</b> {brew.fit}
          </p>
        </div>
      </details>
    </section>
  );
}
