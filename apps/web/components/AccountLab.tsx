"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { account } from "@supportlab/core";
import { LabCreature } from "./LabCreature";
import { CopyButton } from "./CopyButton";

type Lab = account.LabState;
type Slot = account.LabSlot;

const KIND: Record<account.LabPillar["kind"], [string, string]> = {
  teach: ["알려 주기", "📘"],
  relate: ["공감하기", "💬"],
  show: ["보여 주기", "🎬"],
};

const TWEAKS = ["더 유쾌한 말투로", "더 전문가처럼", "블로그 중심으로", "스레드도 같이 키우고 싶어요", "다시 만들어 줘"];

/**
 * 계정 실험실: 질문에 답하면 재료가 쌓이고 새싹이 자란다 → 실험하면 계정 방향이 나온다 → 대화로 다듬는다.
 * 서버: /api/account/lab
 */
export function AccountLab({ initial, aiOn, questions, stages, bioMax }: { initial: Lab; aiOn: boolean; questions: account.LabQuestion[]; stages: readonly string[]; bioMax: number }) {
  const questionFor = (slot: Slot) => questions.find((x) => x.slot === slot)!;
  const [lab, setLab] = useState<Lab>(initial);
  const [skipped, setSkipped] = useState<Slot[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "add" | "brew" | "chat">("");
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [drop, setDrop] = useState<{ key: number; color: string } | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const has = useMemo(() => new Set(lab.ingredients.map((i) => i.slot)), [lab.ingredients]);
  const q = questions.find((x) => !has.has(x.slot) && !skipped.includes(x.slot));
  // core account.stageOf · canBrew 와 같은 규칙 (클라이언트에서는 core를 불러오지 않는다)
  const stage = lab.brew ? 6 : Math.min(has.size, 5);
  const colors = lab.ingredients.map((i) => questionFor(i.slot).color);
  const canBrew = has.size >= 3;
  const brewed = !!lab.brew;

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [lab.chat.length, q?.slot, busy]);

  async function send(fields: Record<string, string | File>) {
    setError(undefined);
    setNotice(undefined);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const res = await fetch("/api/account/lab", { method: "POST", body: fd });
    const j = (await res.json().catch(() => ({}))) as { lab?: Lab; notice?: string; error?: string };
    if (!res.ok || !j.lab) {
      setError(j.error ?? "실험이 잠깐 멈췄어요. 다시 해 보세요.");
      return undefined;
    }
    setLab(j.lab);
    if (j.notice) setNotice(j.notice);
    return j.lab;
  }

  async function add(slot: Slot, value: string) {
    if (!value.trim() && !image) return;
    setBusy("add");
    const color = questionFor(slot).color;
    const fields: Record<string, string | File> = { action: "add", slot, text: value };
    if (image && slot === "reference") fields.image = image;
    const ok = await send(fields);
    setBusy("");
    if (ok) {
      setDrop({ key: Date.now(), color });
      setText("");
      setImage(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function brew() {
    setBusy("brew");
    setDrop({ key: Date.now(), color: "#ffe45c" });
    await send({ action: "brew" });
    setBusy("");
  }

  async function chat(message: string) {
    if (!message.trim()) return;
    setBusy("chat");
    setLab((l) => ({ ...l, chat: [...l.chat, { role: "me", text: message, at: "" }] }));
    setText("");
    const r = message.includes("다시 만들어") ? await send({ action: "brew" }) : await send({ action: "chat", message });
    if (!r) setLab((l) => ({ ...l, chat: l.chat.slice(0, -1) }));
    setBusy("");
  }

  async function remove(slot: Slot) {
    setBusy("add");
    await send({ action: "remove", slot });
    setSkipped((s) => s.filter((x) => x !== slot));
    setBusy("");
  }

  async function reset() {
    if (!confirm("재료와 결과를 모두 비우고 처음부터 할까요?")) return;
    setBusy("add");
    await send({ action: "reset" });
    setSkipped([]);
    setBusy("");
  }

  const stageName = stages[stage];
  const placeholder = brewed ? "결과를 어떻게 바꿀까요? 예: 소개글을 더 짧게" : (q?.placeholder ?? "끓이기 전에 더 하고 싶은 말이 있으면 적어 주세요");

  return (
    <div className="lab">
      <div className="lab-stage">
        <div className="lab-vat">
          {drop && <span key={drop.key} className="lab-drop" style={{ background: drop.color }} aria-hidden="true" />}
          <div className={busy === "brew" ? "lab-shake" : undefined} key={stage}>
            <LabCreature stage={stage} colors={colors} title={`${lab.brew?.creature ?? "계정 새싹"} · ${stageName}`} />
          </div>
        </div>
        <div className="lab-meter">
          <b>{lab.brew?.creature ?? "아직 이름 없음"}</b>
          <span className="small muted">
            {stageName} · {stage}/6단계
          </span>
          <div className="lab-bar" aria-hidden="true">
            <i style={{ width: `${(stage / 6) * 100}%` }} />
          </div>
        </div>
        <ul className="lab-shelf" aria-label="넣은 재료">
          {questions.map((x) => {
            const ing = lab.ingredients.find((i) => i.slot === x.slot);
            return (
              <li key={x.slot} className={ing ? "on" : undefined}>
                <span className="lab-bottle" style={{ ["--c" as string]: x.color }} aria-hidden="true" />
                <div>
                  <b className="small">{x.potion}</b>
                  <span className="small muted">{ing ? ing.text : "아직 비어 있어요"}</span>
                </div>
                {ing && (
                  <button type="button" className="lab-x" onClick={() => remove(x.slot)} disabled={!!busy} aria-label={`${x.potion} 빼기`}>
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn pri lab-brew" onClick={brew} disabled={!canBrew || !!busy}>
          {busy === "brew" ? "실험하는 중…" : brewed ? "같은 재료로 다시 실험" : canBrew ? "실험하기 · 방향 만들기" : `재료 ${has.size}/3 · 3개부터 실험할 수 있어요`}
        </button>
        {(lab.ingredients.length > 0 || brewed) && (
          <button type="button" className="lab-reset small" onClick={reset} disabled={!!busy}>
            처음부터 다시
          </button>
        )}
      </div>

      <div className="lab-talk">
        <div className="lab-log" aria-live="polite">
          {lab.chat.length === 0 && (
            <div className="lab-msg from-lab">
              <p>
                계정 실험실이에요. 질문 6개에 답하면 이 계정이 갈 방향을 같이 만들어요. 답할 때마다 플라스크 속 새싹이 한 단계씩 자라요.
              </p>
            </div>
          )}
          {lab.chat.map((c, i) => (
            <div key={i} className={`lab-msg from-${c.role}`}>
              <p>{c.text}</p>
            </div>
          ))}
          {!brewed && q && busy !== "brew" && (
            <div className="lab-msg from-lab ask">
              <p>
                <b>{q.ask}</b>
                <br />
                <span className="small muted">{q.why}</span>
              </p>
              <div className="lab-chips">
                {q.chips.map((c) => (
                  <button key={c} type="button" className="lab-chip" disabled={!!busy} onClick={() => (c === "아직 잘 모르겠어요" || c === "아직 없어요" ? setSkipped((s) => [...s, q.slot]) : add(q.slot, c))}>
                    {c}
                  </button>
                ))}
                <button type="button" className="lab-chip ghost" disabled={!!busy} onClick={() => setSkipped((s) => [...s, q.slot])}>
                  건너뛰기
                </button>
              </div>
            </div>
          )}
          {!brewed && !q && canBrew && busy !== "brew" && (
            <div className="lab-msg from-lab ask">
              <p>재료가 다 모였어요. <b>실험하기</b>를 누르면 이 계정의 방향이 나와요.</p>
            </div>
          )}
          {busy && (
            <div className="lab-msg from-lab">
              <p className="lab-dots">{busy === "brew" ? "방향을 만드는 중" : busy === "chat" ? "고치는 중" : "재료를 넣는 중"}</p>
            </div>
          )}
          <div ref={chatEnd} />
        </div>

        {brewed && (
          <div className="lab-chips">
            {TWEAKS.map((t) => (
              <button key={t} type="button" className="lab-chip" disabled={!!busy} onClick={() => chat(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        <form
          className="lab-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (brewed) void chat(text);
            else if (q) void add(q.slot, text);
          }}
        >
          {q?.slot === "reference" && !brewed && (
            <label className="lab-attach" title="참고 이미지 (분위기만 읽고 저장하지 않아요)">
              📎
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={300} disabled={!!busy || (!brewed && !q)} aria-label="실험실에 보낼 말" />
          <button type="submit" className="btn pri" disabled={!!busy || (!text.trim() && !image) || (!brewed && !q)}>
            {brewed ? "보내기" : "넣기"}
          </button>
        </form>
        {image && <span className="small muted">참고 이미지: {image.name} (분위기만 읽고 저장하지 않아요)</span>}
        {notice && <p className="note small" style={{ margin: 0 }}>{notice}</p>}
        {error && <p className="note warn small" style={{ margin: 0 }} role="alert">{error}</p>}
        {!aiOn && <p className="small muted" style={{ margin: 0 }}>지금은 AI가 연결되지 않아 넣은 말로 기본 결과를 만들어요.</p>}
      </div>

      {lab.brew && <LabResult brew={lab.brew} bioMax={bioMax} />}
    </div>
  );
}

function LabResult({ brew, bioMax }: { brew: account.LabBrew; bioMax: number }) {
  return (
    <section className="lab-result" aria-label="실험 결과">
      <div className="lab-id">
        <span className="tag">실험 결과 · {brew.creature}</span>
        <p>{brew.identity}</p>
        <CopyButton text={brew.identity} />
      </div>

      <div className="lab-res-grid">
        <div className="grid" style={{ gap: 8, alignContent: "start" }}>
          <b>소개글</b>
          {brew.bios.map((b) => (
            <div key={b.concept + b.text} className="acct-bio">
              <span className="tag">{b.concept}</span>
              <pre>{b.text}</pre>
              <span className="small muted">{b.why}</span>
              <div className="row between">
                <span className="small muted">{b.text.length}/{bioMax}자</span>
                <CopyButton text={b.text} />
              </div>
            </div>
          ))}
          <span className="small muted">내 말투로 한 줄은 꼭 고쳐 주세요. 없는 경력이나 숫자는 넣지 않았어요.</span>
        </div>
        <div className="grid" style={{ gap: 14, alignContent: "start" }}>
          <div className="grid" style={{ gap: 6 }}>
            <b>이름 칸 <span className="small muted">(검색에 걸려요)</span></b>
            {brew.names.map((x) => (
              <div key={x} className="row between acct-line">
                <span>{x}</span>
                <CopyButton text={x} />
              </div>
            ))}
          </div>
          <div className="grid" style={{ gap: 6 }}>
            <b>콘텐츠 기둥 3개 <span className="small muted">번갈아 올려요</span></b>
            <div className="lab-pillars">
              {brew.pillars.map((p) => (
                <div key={p.name} className="lab-pillar">
                  <span className="small muted">
                    {KIND[p.kind][1]} {KIND[p.kind][0]}
                  </span>
                  <b>{p.name}</b>
                  <ul className="small">{p.ideas.map((i) => <li key={i}>{i}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lab-res-grid">
        <div className="grid" style={{ gap: 6, alignContent: "start" }}>
          <b>앞으로 2주 성장 방향</b>
          <ol className="lab-steps">{brew.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
        <div className="grid" style={{ gap: 8, alignContent: "start" }}>
          <div className="lab-expand">
            <b className="small">🧵 스레드로 넓히기</b>
            <p className="small">{brew.expand.threads}</p>
          </div>
          <div className="lab-expand">
            <b className="small">📝 블로그로 넓히기</b>
            <p className="small">{brew.expand.blog}</p>
          </div>
          <div className="lab-expand fit">
            <b className="small">🎯 서포터즈 지원과 연결</b>
            <p className="small">{brew.fit}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
