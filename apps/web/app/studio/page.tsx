import Link from "next/link";
import { requireUser, currentActivity } from "@/lib/session";
import { repo } from "@/lib/repo";
import { ClipUploader } from "@/components/ClipUploader";
import { planScenesAction, captionAction, saveCaptionAction, uploadClipsAction, renderAction, scheduleAction, runTickNowAction, cancelPostAction } from "@/lib/actions";
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
  if (!act?.plan) return <div className="card"><h1>먼저 업로드 일정을 만들어 주세요</h1><Link className="btn pri" href="/calendar">콘텐츠 캘린더</Link></div>;
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
        <span className="eyebrow">{act.name} · 콘텐츠 제작</span>
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
          {["장면 기획", "촬영·업로드", "AI 편집", "예약 게시"].map((label, i) => (
            <span key={label} className={`step ${i === stepNow ? "on" : ""}`}><b>{i + 1}</b>{label}</span>
          ))}
        </div>
        <form action={planScenesAction} className="grid" style={{ gap: 12 }}>
          <input type="hidden" name="planItemId" value={item.id} />
          <p className="small muted" style={{ margin: 0 }}>{item.purpose}</p>
          <label>보여 주고 싶은 내 경험이나 아이디어 (선택)
            <textarea name="idea" defaultValue={item.idea ?? ""} maxLength={600} placeholder="예: 도서관 가는 길에 노이즈 캔슬링을 켜는 순간을 찍고 싶어요. 시험 기간이라 공감될 것 같아요." style={{ minHeight: 72 }} />
          </label>
          <div className="row">
            <label style={{ flex: 2 }}>제품·주제<input type="text" name="product" defaultValue={item.product ?? act.name.split(" ")[0]} maxLength={40} /></label>
            <label style={{ flex: 1 }}>스타일
              <select name="style" defaultValue="review"><option value="review">리뷰</option><option value="challenge">챌린지</option><option value="routine">루틴</option></select>
            </label>
            <label style={{ flex: 1 }}>길이
              <select name="targetSec" defaultValue="15"><option value="15">15초</option><option value="20">20초</option><option value="30">30초</option></select>
            </label>
            <SubmitButton pendingText="장면 짜는 중…" style={{ alignSelf: "flex-end" }}>{scenes ? "장면 다시 짜기" : "찍을 장면 받기"}</SubmitButton>
          </div>
          <span className="small muted">{ai.mode === "demo" ? "AI가 연결되지 않아 기본 장면 틀로 만들어요." : `${ai.label}가 공고와 내 아이디어에 맞춰 장면을 짜요. 스타일은 AI가 답을 못 줄 때 쓰는 기본 틀이에요.`}</span>
          <PendingNote steps={["공고의 활동 내용을 읽고 있어요", "내 아이디어로 장면을 짜고 있어요", "장면 길이를 맞추고 있어요"]} hint="로컬 모델은 30초~1분 걸릴 수 있어요." />
        </form>
        {sp.made && <p className={sp.made === "ai" ? "note ok small" : "note small"} role="status" style={{ margin: 0 }}>{sp.made === "ai" ? "AI가 장면을 짰어요. 마음에 안 들면 아이디어를 고쳐 다시 짜 보세요." : sp.note ?? "기본 장면 틀로 만들었어요."}</p>}
      </section>

      {scenes && match && (
        <form action={uploadClipsAction} className="card">
          <input type="hidden" name="planItemId" value={item.id} />
          <div className="row between"><h2>찍어야 할 장면 {scenes.length}개</h2><span className="small muted">장면마다 영상을 하나씩 올려 주세요. 가로·세로 모두 괜찮아요 (9:16으로 맞춰 드려요).</span></div>
          <table>
            <thead><tr><th>#</th><th>길이</th><th>구도</th><th>찍을 것</th><th>화면 자막</th><th>영상</th></tr></thead>
            <tbody>
              {match.matches.map((m) => (
                <tr key={m.scene.index}>
                  <td className="num">{m.scene.index}</td>
                  <td>{m.scene.durationSec}초</td>
                  <td>{content.SHOT_LABEL[m.scene.shot]}</td>
                  <td><b>{m.scene.what}</b><br /><span className="small muted">{m.scene.tip}</span></td>
                  <td>{m.scene.onScreenText}</td>
                  <td>
                    {m.clip ? <span className="tag k-post">올림 · {m.clip.durationSec.toFixed(1)}초</span> : <span className="tag">아직</span>}
                    {m.problem && m.clip && <div className="small" style={{ color: "var(--warn)" }}>{m.problem}</div>}
                    {repo.kind === "memory" && <input type="file" name={`scene_${m.scene.index}`} accept="video/*" aria-label={`${m.scene.index}번 장면 영상`} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <h2>캡션 코치</h2>
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
            <h2>AI 편집</h2>
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
            <form action={runTickNowAction}><button className="btn" type="submit">{user.ig ? "지금 상태 확인" : "데모: 지금 게시 진행"}</button></form>
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
