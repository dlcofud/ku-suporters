import Link from "next/link";
import { requireUser } from "@/lib/session";
import { repo } from "@/lib/repo";
import { ClipUploader } from "@/components/ClipUploader";
import { planScenesAction, uploadClipsAction, renderAction, scheduleAction, runTickNowAction, cancelPostAction } from "@/lib/actions";
import { content } from "@supportlab/core";
import { fmtLabel, md } from "@/lib/format";

const ERR: Record<string, string> = {
  font: "자막용 한글 글꼴을 찾지 못했어요. 서버의 CAPTION_FONT_FILE 환경 변수에 글꼴 경로를 넣어 주세요.",
  noclips: "편집할 영상이 없어요. 장면별 영상을 먼저 올려 주세요.",
  render: "영상 편집에 실패했어요. 서버에 ffmpeg가 설치되어 있는지 확인해 주세요.",
};
const STATUS: Record<string, string> = { scheduled: "예약됨", container_created: "인스타 처리 중", ready: "게시 대기", published: "게시 완료", failed: "실패", canceled: "취소됨" };

export const maxDuration = 60; // 영상 편집에 시간이 걸린다

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ item?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const act = await repo.latestActivity(user.id);
  if (!act?.plan) return <div className="card"><h1>먼저 업로드 일정을 만들어 주세요</h1><Link className="btn pri" href="/calendar">콘텐츠 캘린더</Link></div>;
  const contents = act.plan.items.filter((i) => i.kind === "content");
  const item = contents.find((i) => i.id === sp.item) ?? contents.find((i) => i.status !== "past") ?? contents[0]!;
  const scenes = await repo.getScenes(user.id, item.id);
  const clips = (await repo.listClips(user.id, item.id)).map((c) => ({ id: c.id, path: c.storageKey, durationSec: c.durationSec, hasAudio: c.hasAudio, sceneIndex: c.sceneIndex }));
  const match = scenes ? content.matchClips(scenes, clips) : undefined;
  const renders = await repo.listRenders(user.id, item.id);
  const posts = (await repo.listPosts(user.id)).filter((p) => p.planItemId === item.id);
  const caption = scenes ? content.draftCaption({ title: item.title, product: act.name.split(" ")[0] ?? "" }, scenes, ["서포터즈", act.name.split(" ")[0] ?? "", "대학생"]) : "";
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
        <form action={planScenesAction} className="row">
          <input type="hidden" name="planItemId" value={item.id} />
          <label style={{ flex: 2 }}>제품·주제<input type="text" name="product" defaultValue={act.name.split(" ")[0]} /></label>
          <label style={{ flex: 1 }}>스타일
            <select name="style" defaultValue="review"><option value="review">리뷰</option><option value="challenge">챌린지</option><option value="routine">루틴</option></select>
          </label>
          <label style={{ flex: 1 }}>길이
            <select name="targetSec" defaultValue="15"><option value="15">15초</option><option value="20">20초</option><option value="30">30초</option></select>
          </label>
          <button className="btn pri" type="submit" style={{ alignSelf: "flex-end" }}>{scenes ? "장면 다시 짜기" : "찍을 장면 받기"}</button>
        </form>
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
            <button className="btn" type="submit" style={{ alignSelf: "flex-start" }}>영상 올리기</button>
          ) : (
            <ClipUploader planItemId={item.id} scenes={match.matches.map((m) => ({ index: m.scene.index, label: content.SHOT_LABEL[m.scene.shot] }))} />
          )}
        </form>
      )}

      {match && match.matches.some((m) => m.clip) && (
        <form action={renderAction} className="card row between">
          <input type="hidden" name="planItemId" value={item.id} />
          <div>
            <h2>AI 편집</h2>
            <span className="small muted">장면 길이에 맞춰 자르고, 9:16으로 맞추고, 화면 자막을 넣어 하나의 릴스로 만들어요 (오픈소스 ffmpeg).{!match.ready && " 빠진 장면은 건너뛰어요."}</span>
          </div>
          <label className="check"><input type="checkbox" name="captions" value="on" defaultChecked />화면 자막 넣기</label>
          <button className="btn pri" type="submit">편집하기</button>
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
            <button className="btn pri" type="submit">예약하기</button>
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
