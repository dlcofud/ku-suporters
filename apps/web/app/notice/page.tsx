import { requireUser, currentActivity } from "@/lib/session";
import { repo } from "@/lib/repo";
import { analyzeNoticeAction } from "@/lib/actions";
import { credits } from "@supportlab/core";
import Link from "next/link";

const SUB: Record<string, string> = { application: "지원서", portfolio: "포트폴리오", sns_link: "SNS 링크", intro_video: "자기소개 영상", content_plan: "콘텐츠 기획서", pre_mission: "사전 미션" };
const STAGE: Record<string, string> = { document: "서류", interview: "면접", pre_mission: "사전 과제", video: "영상 심사" };
const ERR: Record<string, string> = {
  short: "공고 내용을 조금 더 붙여넣어 주세요.",
  empty: "공고 링크를 넣거나 본문을 붙여넣어 주세요.",
  credits: "크레딧이 부족해요. 합격 경험을 공유하면 크레딧을 받을 수 있어요.",
};

export default async function NoticePage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string; url?: string }> }) {
  const user = await requireUser();
  const { error, msg, url } = await searchParams;
  const act = await currentActivity(user.id);
  const est = credits.TASK_ESTIMATES.notice_analysis;
  return (
    <>
      <header>
        <span className="eyebrow">요강 역설계</span>
        <h1>공고 분석</h1>
      </header>
      {error && <div className="note warn" role="alert">{error === "fetch" ? msg : ERR[error] ?? error}</div>}
      <form action={analyzeNoticeAction} className="card">
        <label>
          공고 링크
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input type="url" name="url" defaultValue={url} placeholder="https://linkareer.com/activity/… 처럼 공고 페이지 주소를 붙여넣으세요" style={{ flex: 1 }} autoFocus />
            <button className="btn pri" type="submit">분석하기</button>
          </div>
        </label>
        <span className="small muted">링크만 넣으면 그 페이지의 공고 내용을 읽어서 분석해요. 공고 원문은 저장하지 않고, 뽑아낸 사실과 링크만 남겨요.</span>
        <details open={error === "fetch" || undefined}>
          <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>링크로 안 될 때: 본문 직접 붙여넣기</summary>
          <div className="grid" style={{ marginTop: 12 }}>
            <label>활동 이름 (선택)<input type="text" name="name" placeholder="비우면 공고 제목을 써요" /></label>
            <label>
              공고 내용
              <textarea name="text" placeholder="로그인이 필요한 페이지나 이미지로 된 공고는 내용을 직접 붙여넣어 주세요." style={{ minHeight: 180 }} />
            </label>
            <div className="row between">
              <span className="small muted">규칙으로 다 찾으면 0 크레딧, 보강이 필요하면 최대 {est.max} 크레딧.</span>
              <button className="btn" type="submit">붙여넣은 내용으로 분석</button>
            </div>
          </div>
        </details>
      </form>
      {act && (
        <section className="grid g2" style={{ alignItems: "start" }}>
          <div className="card">
            <h2>{act.name}</h2>
            <table>
              <tbody>
                <tr><th>마감</th><td>{act.analysis.deadline ?? "찾지 못함 (캘린더에서 직접 입력)"}</td></tr>
                <tr><th>발표</th><td>{act.analysis.announcementDate ?? "-"}</td></tr>
                <tr><th>제출물</th><td>{act.analysis.submissions.map((s) => SUB[s]).join(", ") || "-"}</td></tr>
                <tr><th>전형</th><td>{act.analysis.stages.map((s) => STAGE[s]).join(" → ") || "-"}</td></tr>
                <tr><th>혜택</th><td>{act.analysis.benefits.join(" · ") || "-"}</td></tr>
                <tr><th>지원서 문항</th><td><ul className="clean">{act.analysis.questions.map((q) => <li key={q}>{q}</li>)}</ul></td></tr>
                {act.sourceUrl && <tr><th>출처</th><td><a href={act.sourceUrl}>{act.sourceUrl}</a></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card hi">
            <h2>우대사항 → 이렇게 준비하세요</h2>
            {act.guides.length === 0 && <p className="muted">우대사항을 찾지 못했어요.</p>}
            {act.guides.map((g) => (
              <div key={g.keyword} className="note">
                <span className="tag k-reels">{g.keyword}</span>
                <p style={{ margin: "6px 0 0" }}><b>{g.from}</b></p>
                <p style={{ margin: "4px 0 0" }}>{g.action}</p>
              </div>
            ))}
            <div className="row">
              <Link className="btn pri" href="/skeleton">지원서 뼈대 만들기</Link>
              <Link className="btn" href="/">업로드 일정 보기</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
