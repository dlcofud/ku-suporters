import { requireUser, currentActivity } from "@/lib/session";
import { repo } from "@/lib/repo";
import Link from "next/link";
import { redirect } from "next/navigation";

const SUB: Record<string, string> = { application: "지원서", portfolio: "포트폴리오", sns_link: "SNS 링크", intro_video: "자기소개 영상", content_plan: "콘텐츠 기획서", pre_mission: "사전 미션" };
const STAGE: Record<string, string> = { document: "서류", interview: "면접", pre_mission: "사전 과제", video: "영상 심사" };
const ERR: Record<string, string> = {
  short: "공고 내용을 조금 더 붙여넣어 주세요.",
  empty: "공고 링크를 넣거나 본문을 붙여넣어 주세요.",
  credits: "크레딧이 부족해요. 왼쪽 아래 '충전 · 내역'에서 충전하거나, 합격 경험을 공유하면 크레딧을 받을 수 있어요.",
};

export default async function NoticeResult({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string; url?: string; form?: string; fq?: string; ff?: string; fa?: string; formerror?: string; ocr?: string; oi?: string; or?: string }> }) {
  const user = await requireUser();
  const { error, msg, url, form, fq, ff, fa, formerror, ocr, oi, or } = await searchParams;
  const act = await currentActivity(user.id);
  if (!act) redirect("/notice");
  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end" }}>
        <div>
          <span className="eyebrow">공고를 읽었어요</span>
          <h1>{act.name}</h1>
        </div>
        <Link className="btn" href="/notice">+ 다른 서포터즈 추가</Link>
      </header>
      {error && <div className="note warn" role="alert">{error === "fetch" ? msg : ERR[error] ?? error}</div>}
      {form === "ok" && (
        <div className="note ok" role="status">
          지원서 양식에서 서술형 문항 {fq}개{Number(fa) > 0 ? `(새로 더한 문항 ${fa}개)` : ""}와 직접 채울 항목 {ff}개를 읽었어요. <Link href="/skeleton"><b>지원서 작성하러 가기 →</b></Link>
        </div>
      )}
      {ocr && ocr !== "none" && Number(or) > 0 && (
        <div className="note ok" role="status">공고 이미지 {oi}장 중 {or}장에서 글자를 읽어 분석에 넣었어요 ({ocr === "ai" ? "AI가 읽음" : "글자 인식(tesseract)으로 읽음 · AI를 연결하면 더 정확해요"}). 마감일·문항이 맞는지 아래에서 확인해 주세요.</div>
      )}
      {ocr && (ocr === "none" || Number(or) === 0) && <div className="note warn" role="status">공고 이미지 {oi}장에서 글자를 읽지 못했어요. 중요한 내용이 이미지에만 있다면 직접 붙여넣어 주세요.</div>}
      {formerror && <div className="note warn" role="alert">공고 분석은 했지만 양식 파일은 읽지 못했어요: {formerror} 지원서 작성 화면에서 다시 올리거나 문항을 붙여넣을 수 있어요.</div>}
      {(
        <section className="grid g2" style={{ alignItems: "start" }}>
          <div className="card">
            <h2>공고 요약</h2>
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
              <Link className="btn pri" href="/skeleton">지원서 작성하기</Link>
              <Link className="btn" href="/calendar">업로드 일정 보기</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
