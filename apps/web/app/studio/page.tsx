import Link from "next/link";
import { requireUser, currentActivity } from "@/lib/session";
import { repo } from "@/lib/repo";
import { ClipUploader } from "@/components/ClipUploader";
import { ShootForm } from "@/components/ShootForm";
import { captionAction, saveCaptionAction, uploadClipsAction, renderAction, scheduleAction, runTickNowAction, cancelPostAction } from "@/lib/actions";
import { CopyButton } from "@/components/CopyButton";
import { llmStatus } from "@/lib/llm";
import { content } from "@supportlab/core";
import { fmtLabel, md } from "@/lib/format";
import { SubmitButton, PendingNote } from "@/components/Pending";

const ERR: Record<string, string> = {
  font: "자막용 한글 글꼴을 찾지 못했어요. 서버의 CAPTION_FONT_FILE 환경 변수에 글꼴 경로를 넣어 주세요.",
  noclips: "편집할 영상이 없어요. 장면별 영상을 먼저 올려 주세요.",
  render: "영상 편집에 실패했어요. 서버에 ffmpeg가 설치되어 있는지 확인해 주세요.",
};
const STATUS: Record<string, string> = { scheduled: "예약됨", container_created: "인스타 처리 중", ready: "게시 대기", published: "게시 완료", failed: "실패", canceled: "취소됨" };

export const maxDuration = 60; // 영상 편집에 시간이 걸린다

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ item?: string; error?: string; made?: string; note?: string; cap?: string; ask?: string; saved?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const act = await currentActivity(user.id);
  if (!act?.plan) return <div className="card"><h1>먼저 업로드 일정을 만들어 주세요</h1><Link className="btn pri" href="/calendar">업로드 일정 만들기</Link></div>;
  const contents = act.plan.items.filter((i) => i.kind === "content");
  const item = contents.find((i) => i.id === sp.item) ?? contents.find((i) => i.status !== "past") ?? contents[0]!;
  const scenes = await repo.getScenes(user.id, item.id);
  const clips = (await repo.listClips(user.id, item.id)).map((c) => ({ id: c.id, path: c.storageKey, durationSec: c.durationSec, hasAudio: c.hasAudio, sceneIndex: c.sceneIndex }));
  const match = scenes ? content.matchClips(scenes, clips) : undefined;
  const renders = await repo.listRenders(user.id, item.id);
  const posts = (await repo.listPosts(user.id)).filter((p) => p.planItemId === item.id);
  const draft = scenes ? content.draftCaption({ title: item.title, product: item.product ?? act.name.split(" ")[0] ?? "" }, scenes, ["서포터즈", act.name.split(" ")[0] ?? "", "대학생"]) : "";
  const caption = item.caption || draft;
  const ai = llmStatus();
  // 기본 게시 시각: 일정 날짜 오후 9시. 이미 지났으면 지금부터 1시간 뒤 (한국 시간)
  const planned = new Date(`${item.date}T21:00:00+09:00`).getTime();
  const at = new Date(Math.max(planned, Date.now() + 3600_000) + 9 * 3600_000);
  const defaultAt = at.toISOString().slice(0, 16);
  const stepNow = renders.length ? 3 : match?.matches.some((m) => m.clip) ? 2 : scenes ? 1 : 0;
  return (
    <>
      <header>
        <span className="eyebrow">{act.name} · 콘텐츠 만들기</span>
        <h1>{md(item.date)} {fmtLabel(item.format)} · {item.title}</h1>
      </header>
      {sp.error && <div className="note warn">{ERR[sp.error] ?? sp.error}</div>}
      <nav className="row" aria-label="콘텐츠 선택">
        {contents.map((c) => (
          <Link key={c.id} href={`/studio?item=${c.id}`} className={c.id === item.id ? "btn pri" : "btn"}>{md(c.date)} {fmtLabel(c.format)}</Link>
        ))}
      </nav>

      <section className="card">
        <div className="steps">
          {["참고 자료", "촬영·업로드", "자동 편집", "캡션·게시"].map((label, i) => (
            <span key={label} className={`step ${i === stepNow ? "on" : ""}`}><b>{i + 1}</b>{label}</span>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>{item.purpose}</p>
      </section>

      <details className="shoot-details" open={!scenes}>
        <summary className="card"><b>① 참고 자료 넣고 촬영 가이드 받기</b>{scenes ? <span className="small muted"> · 다시 만들려면 펼치세요</span> : null}</summary>
        <ShootForm
          planItemId={item.id}
          product={item.product ?? act.name.split(" ")[0] ?? ""}
          idea={item.idea ?? ""}
          links={item.shoot?.refLinks.join("\n") ?? ""}
          script={item.shoot?.script ?? ""}
          subject={item.shoot?.subject ?? ""}
          hasPlan={!!scenes}
          aiLabel={ai.mode === "demo" ? "AI가 연결되지 않아 기본 장면 틀로 만들어요." : `${ai.label}가 사진까지 읽고 만들어요 · 20~40초`}
        />
      </details>

      {item.shoot?.analysis && (
        <section className="card">
          <h2>참고 자료에서 읽은 것</h2>
          <div className="grid g2" style={{ gap: 8 }}>
            {[
              ["컷 리듬", item.shoot.analysis.pace],
              ["첫 장면", item.shoot.analysis.hook],
              ["자막 스타일", item.shoot.analysis.textStyle],
              ["분위기", item.shoot.analysis.mood],
              ["소리", item.shoot.analysis.sound],
              ["흐름", item.shoot.analysis.structure],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="small"><b>{k}</b> · {v}</div>
            ))}
          </div>
          {item.shoot.analysis.palette.length > 0 && (
            <div className="row small" style={{ gap: 6 }}>
              <b>색감</b>
              {item.shoot.analysis.palette.map((c) => <span key={c} className="swatch" style={{ background: c }} title={c} />)}
            </div>
          )}
          {item.shoot.refLinks.length > 0 && (
            <p className="small muted" style={{ margin: 0 }}>참고: {item.shoot.refLinks.map((l, i) => <a key={l} href={l} target="_blank" rel="noreferrer">릴스 {i + 1}{" "}</a>)}</p>
          )}
        </section>
      )}

      {scenes && match && (
        <form action={uploadClipsAction} className="card">
          <input type="hidden" name="planItemId" value={item.id} />
          <div className="row between"><h2>② 촬영 가이드 · 장면 {scenes.length}개 · {scenes.reduce((s2, x) => s2 + x.durationSec, 0)}초</h2><span className="small muted">장면마다 영상을 하나씩 찍어 올려 주세요. 조금 길게 찍으면 좋은 부분만 골라 써요. 가로·세로 모두 괜찮아요 (9:16으로 맞춰요).</span></div>
          <div className="shotlist">
            {match.matches.map((m) => (
              <article key={m.scene.index} className="shot">
                <div className="row between">
                  <b>#{m.scene.index} · {m.scene.durationSec}초 · {content.SHOT_LABEL[m.scene.shot]}</b>
                  {m.clip ? <span className="tag k-post">올림 · {m.clip.durationSec.toFixed(1)}초</span> : <span className="tag">아직</span>}
                </div>
                <p style={{ margin: 0, fontWeight: 800 }}>{m.scene.what}</p>
                {m.scene.how && <p className="small" style={{ margin: 0 }}><b>찍는 법</b> {m.scene.how}</p>}
                {m.scene.line && <p className="small" style={{ margin: 0 }}><b>대사</b> “{m.scene.line}”</p>}
                <p className="small" style={{ margin: 0 }}><b>화면 자막</b> {m.scene.onScreenText}</p>
                {m.scene.props && <p className="small" style={{ margin: 0 }}><b>소품</b> {m.scene.props}</p>}
                {m.scene.light && <p className="small" style={{ margin: 0 }}><b>빛·색감</b> {m.scene.light}</p>}
                {m.scene.tip && <p className="small muted" style={{ margin: 0 }}>💡 {m.scene.tip}</p>}
                {m.problem && m.clip && <div className="small" style={{ color: "var(--warn)" }}>{m.problem}</div>}
                {repo.kind === "memory" && <input type="file" name={`scene_${m.scene.index}`} accept="video/*" aria-label={`${m.scene.index}번 장면 영상`} />}
              </article>
            ))}
          </div>
          {repo.kind === "memory" ? (
            <>
              <SubmitButton className="btn" pendingText="올리는 중…" style={{ alignSelf: "flex-start" }}>영상 올리기</SubmitButton>
              <PendingNote steps={["영상을 올리고 있어요", "영상 길이와 소리를 확인하고 있어요"]} hint="영상이 크면 1분 넘게 걸릴 수 있어요. 창을 닫지 말아 주세요." />
            </>
          ) : (
            <ClipUploader planItemId={item.id} scenes={match.matches.map((m) => ({ index: m.scene.index, label: content.SHOT_LABEL[m.scene.shot] }))} />
          )}
        </form>
      )}

      {scenes && (
        <section id="caption" className="grid g2" style={{ alignItems: "start" }}>
          <form action={captionAction} className="card">
            <input type="hidden" name="planItemId" value={item.id} />
            <h2>캡션 쓰기</h2>
            <p className="small muted" style={{ margin: 0 }}>캡션은 내가 실제로 겪은 일로만 써요. 없는 경험이나 숫자는 넣지 않아요.</p>
            {sp.ask && <div className="note warn" role="status"><b>코치</b> · {sp.ask}</div>}
            <label>이 콘텐츠에 넣을 내 경험
              <textarea name="experience" defaultValue={item.idea ?? ""} maxLength={800} placeholder="예: 시험 기간에 도서관 가는 길마다 노이즈 캔슬링을 켰는데, 지하철 소음이 사라져서 단어 외우기가 편했어요." style={{ minHeight: 96 }} />
            </label>
            <SubmitButton className="btn" pendingText="캡션 쓰는 중…">{item.caption ? "캡션 다시 쓰기" : "캡션 쓰기"}</SubmitButton>
            <PendingNote steps={["내 경험을 읽고 있어요", "첫 줄을 고르고 있어요", "지어낸 숫자가 없는지 확인하고 있어요"]} />
          </form>
          <form action={saveCaptionAction} className="card">
            <input type="hidden" name="planItemId" value={item.id} />
            <div className="row between">
              <h2>캡션</h2>
              {sp.cap === "ai" && <span className="tag k-post">AI 초안</span>}
              {sp.saved && <span className="tag">저장됨</span>}
            </div>
            {sp.cap && sp.cap !== "ai" && sp.note && <p className="note small" style={{ margin: 0 }}>{sp.note}</p>}
            <textarea name="caption" defaultValue={caption} maxLength={2200} style={{ minHeight: 200 }} aria-label="캡션" />
            <div className="row">
              <SubmitButton className="btn" pendingText="저장하는 중…">고친 캡션 저장</SubmitButton>
              <CopyButton text={caption} />
            </div>
            <span className="small muted">마지막 문장은 내 말투로 한 번 고쳐 주세요. 저장한 캡션이 예약 게시에 들어가요.</span>
          </form>
        </section>
      )}

      {match && match.matches.some((m) => m.clip) && (
        <form action={renderAction} className="card row between">
          <input type="hidden" name="planItemId" value={item.id} />
          <div>
            <h2>③ 자동 편집</h2>
            <span className="small muted">장면마다 움직임·말소리를 재서 장면에 맞는 구간을 고르고, 9:16으로 맞추고, 화면 자막을 넣어 하나의 릴스로 만들어요 (오픈소스 ffmpeg).{!match.ready && " 빠진 장면은 건너뛰어요."}</span>
          </div>
          <label className="check"><input type="checkbox" name="captions" value="on" defaultChecked />화면 자막 넣기</label>
          <SubmitButton pendingText="편집하는 중…">편집하기</SubmitButton>
          <div style={{ flexBasis: "100%" }}>
            <PendingNote steps={["클립마다 움직임과 소리를 재고 있어요", "장면에 맞는 구간을 고르고 있어요", "9:16으로 맞추고 자막을 넣고 있어요", "릴스 한 편으로 이어 붙이고 있어요"]} hint="15초 릴스 기준 보통 20초~1분 걸려요." />
          </div>
        </form>
      )}

      {renders.map((r) => (
        <section key={r.id} className="grid g2" style={{ alignItems: "start" }}>
          <div className="card">
            <h2>편집 결과 · {r.totalSec}초</h2>
            <video src={`/api/media/${r.id}`} controls playsInline style={{ maxHeight: 480 }} />
          </div>
          <form action={scheduleAction} className="card">
            <input type="hidden" name="renderId" value={r.id} />
            <h2>예약 게시</h2>
            <label>캡션 (빈칸은 직접 채워 주세요)<textarea name="caption" defaultValue={caption} /></label>
            <label>게시 시각 (한국 시간)<input type="datetime-local" name="publishAt" defaultValue={defaultAt} required /></label>
            {!user.ig && <div className="note">인스타 계정을 연결하지 않아 <b>데모 게시</b>로 동작해요. 실제 게시는 <Link href="/account">계정 만들기</Link>에서 연결해 주세요.</div>}
            <SubmitButton pendingText="예약하는 중…">예약하기</SubmitButton>
          </form>
        </section>
      ))}

      {posts.length > 0 && (
        <section className="card">
          <div className="row between">
            <h2>예약 현황</h2>
            {user.ig && <form action={runTickNowAction}><button className="btn" type="submit">지금 상태 확인</button></form>}
          </div>
          <table>
            <thead><tr><th>게시 시각</th><th>상태</th><th>기록</th><th /></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.publishAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                  <td><span className={`tag ${p.status === "published" ? "k-post" : p.status === "failed" ? "k-dead" : "k-reels"}`}>{STATUS[p.status]}</span></td>
                  <td className="small muted">{p.log.map((l) => l.message).join(" → ")}</td>
                  <td>{p.status !== "published" && p.status !== "canceled" && <form action={cancelPostAction}><input type="hidden" name="postId" value={p.id} /><button className="btn warn" type="submit">취소</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
