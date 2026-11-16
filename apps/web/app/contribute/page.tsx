import { requireUser } from "@/lib/session";
import { db } from "@/lib/store";
import { contributeAction, withdrawAction } from "@/lib/actions";
import { contribution } from "@supportlab/core";
import { myMedia } from "@/lib/media";
import { fmtLabel, md } from "@/lib/format";

const STATUS: Record<string, string> = { submitted: "검수 대기", in_review: "검수 중", approved: "승인 · 지급 완료", rejected: "반려", withdrawn: "철회됨", draft: "작성 중" };

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { media } = await myMedia(user);
  const mine = [...db.contributions.values()].filter((c) => c.userId === user.id);
  return (
    <>
      <header>
        <span className="eyebrow">합격 경험 공유하고 크레딧 받기</span>
        <h1>합격 경험 공유</h1>
      </header>
      {sp.error && <div className="note warn" style={{ whiteSpace: "pre-line" }}>{sp.error}</div>}
      {sp.done && <div className="note ok">제출했어요. 검수가 끝나면 크레딧이 지급돼요. 그 전까지는 ‘지급 예정’으로 보여요.</div>}
      <section className="grid g2" style={{ alignItems: "start" }}>
        <form action={contributeAction} className="card">
          <label>활동 이름<input type="text" name="activityName" placeholder="예: 달콤제과 서포터즈 13기" required /></label>
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>결과</b></legend>
            <div className="row">
              <label className="check"><input type="radio" name="result" value="final_pass" defaultChecked />최종 합격</label>
              <label className="check"><input type="radio" name="result" value="document_pass" />서류 합격</label>
              <label className="check"><input type="radio" name="result" value="fail" />불합격</label>
            </div>
            <span className="small muted">불합격 결과도 다음 지원자에게 비교 기준이 돼요.</span>
          </fieldset>
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>지원할 때 쓴 게시물만 골라 주세요</b></legend>
            {!user.ig && <label className="check"><input type="checkbox" name="demoConnect" defaultChecked />데모 계정으로 연결 (인스타 연결 전)</label>}
            {media.map((m) => <label key={m.id} className="check"><input type="checkbox" name="media" value={m.id} />{md(m.date)} · {fmtLabel(m.format)} · {m.title ?? m.id}</label>)}
            <span className="small muted">고르지 않은 게시물은 가져오지 않아요.</span>
          </fieldset>
          <label>합격 증빙 (문자·메일 캡처, 합격자만)<input type="file" name="proof" accept="image/*" /></label>
          <label className="check"><input type="checkbox" name="redacted" />증빙에서 이름·전화번호·이메일을 가렸어요</label>
          <label className="check"><input type="checkbox" name="shareStructure" />지원서 구조도 공유할게요 (+20, 원문 아님)</label>
          <label>문항별 강조점 (한 줄에 하나 · <code>문항 | E1, E4</code>)<textarea name="structure" style={{ minHeight: 70 }} placeholder="지원 동기 | E8, E5" /></label>
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>필수 동의</b> <span className="small muted">(버전 {contribution.CONSENT_VERSION})</span></legend>
            {contribution.REQUIRED_CONSENTS.map((k) => (
              <label key={k} className="check"><input type="checkbox" name={`consent_${k}`} required /><span className="small">{contribution.CONSENT_TEXT[k]}</span></label>
            ))}
          </fieldset>
          <button className="btn pri" type="submit">제출하기</button>
        </form>
        <div className="grid">
          <div className="card">
            <h2>받을 수 있는 크레딧</h2>
            <table><tbody>
              <tr><td>계정 연결 · 게시물 선택</td><td className="num">+10</td></tr>
              <tr><td>합격 증빙 (합격자)</td><td className="num">+20</td></tr>
              <tr><td>지원서 구조 공유</td><td className="num">+20</td></tr>
            </tbody></table>
            <span className="small muted">검수 후 지급 · 같은 활동은 한 번만 · 철회하면 지급 예정 크레딧은 취소되고 데이터는 삭제돼요.</span>
          </div>
          {mine.map((c) => (
            <div key={c.id} className="card">
              <div className="row between"><h3>{c.activityName}</h3><span className="tag">{STATUS[c.status]}</span></div>
              <span className="small muted">보상 {contribution.computeReward(c).total} 크레딧 · {c.history.map((h) => STATUS[h.to]).join(" → ")}</span>
              {c.review?.reason && <div className="note warn">반려 사유: {c.review.reason}</div>}
              {c.status !== "withdrawn" && (
                <form action={withdrawAction}><input type="hidden" name="id" value={c.id} /><button className="btn warn" type="submit">공유 철회 (데이터 삭제)</button></form>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
