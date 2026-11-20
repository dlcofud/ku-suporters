import { requireUser } from "@/lib/session";
import { repo } from "@/lib/repo";
import { contributeAction, withdrawAction } from "@/lib/actions";
import { contribution } from "@supportlab/core";
import { myMedia } from "@/lib/media";
import { fmtLabel, md } from "@/lib/format";
import { SubmitButton, PendingNote } from "@/components/Pending";

const FIELDS = ["뷰티·패션", "F&B·식품", "IT·테크", "금융", "언론·미디어", "음악·엔터", "공공·기관", "여행·레저", "기타"];
const STORY_GUIDE = [
  "이런 것들을 적어 주면 다음 지원자에게 도움이 돼요.",
  "· 지원서에 어떤 경험을 썼나요? (예: 동아리 인스타 운영, 팔로워·조회수 같은 숫자)",
  "· 미리 만들어 둔 콘텐츠나 포트폴리오가 있었나요?",
  "· 브랜드를 어떻게 분석했고, 무엇을 기획해 냈나요?",
  "· 사전미션·면접이 있었나요? 면접에서 어떤 질문을 받았나요?",
  "· 다음 지원자에게 하고 싶은 팁",
].join("\n");

const STATUS: Record<string, string> = { submitted: "검수 대기", in_review: "검수 중", approved: "승인 · 지급 완료", rejected: "반려", withdrawn: "철회됨", draft: "작성 중" };

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { media } = await myMedia(user);
  const mine = await repo.listContributions({ userId: user.id });
  return (
    <>
      <header>
        <span className="eyebrow">합격 경험 공유하고 크레딧 받기</span>
        <h1>합격 경험 공유</h1>
        <p className="muted" style={{ margin: 0 }}>내가 겪은 지원 과정을 적어 주면, 점수·요약으로만 바꿔 다음 지원자의 <a href="/trends">합격 경향</a>에 더해져요. 이름이 드러나지 않아요.</p>
      </header>
      {sp.error && <div className="note warn" style={{ whiteSpace: "pre-line" }}>{sp.error}</div>}
      {sp.done && <div className="note ok">제출했어요. 검수가 끝나면 크레딧이 지급돼요. 그 전까지는 ‘지급 예정’으로 보여요.</div>}
      <section className="grid g2" style={{ alignItems: "start" }}>
        <form action={contributeAction} className="card">
          <div className="grid g2">
            <label>활동 이름<input type="text" name="activityName" placeholder="예: 달콤제과 서포터즈 13기" required /></label>
            <label>분야
              <select name="field" defaultValue="">
                <option value="">고르기</option>
                {FIELDS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>결과</b></legend>
            <div className="row">
              <label className="check"><input type="radio" name="result" value="final_pass" defaultChecked />최종 합격</label>
              <label className="check"><input type="radio" name="result" value="document_pass" />서류 합격</label>
              <label className="check"><input type="radio" name="result" value="fail" />불합격</label>
            </div>
            <span className="small muted">불합격 결과도 다음 지원자에게 비교 기준이 돼요.</span>
          </fieldset>
          <label>
            <span className="lbl">합격 후기 <span className="small muted">(+20 · {contribution.STORY_MIN}자 이상 · 내 말로)</span></span>
            <textarea name="story" style={{ minHeight: 200 }} maxLength={5000} placeholder={STORY_GUIDE} />
          </label>
          <span className="small muted" style={{ marginTop: -6 }}>남의 후기를 옮기거나 다른 사람의 이름·연락처를 쓰지 말아 주세요. 원문은 관리자 검수가 끝나면 지우고 점수·요약만 남겨요.</span>
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>지원할 때 쓴 게시물</b> <span className="small muted">(선택 · +10)</span></legend>
            {user.ig ? (
              media.length ? (
                media.map((m) => <label key={m.id} className="check"><input type="checkbox" name="media" value={m.id} />{md(m.date)} · {fmtLabel(m.format)} · {m.title ?? m.id}</label>)
              ) : (
                <span className="small muted">연결한 계정에서 게시물을 찾지 못했어요.</span>
              )
            ) : (
              <span className="small muted">인스타그램을 연결하면 지원할 때 쓴 게시물의 지표도 함께 공유할 수 있어요. 후기만 써도 제출할 수 있어요.</span>
            )}
            {user.ig && <span className="small muted">고르지 않은 게시물은 가져오지 않아요.</span>}
          </fieldset>
          <label>합격 증빙 <span className="small muted">(선택 · +20 · 문자·메일 캡처. 있으면 &apos;결과 확인된 합격&apos;으로 세요)</span><input type="file" name="proof" accept="image/*" /></label>
          <label className="check"><input type="checkbox" name="redacted" />증빙에서 이름·전화번호·이메일을 가렸어요</label>
          <label className="check"><input type="checkbox" name="shareStructure" />지원서 구조도 공유할게요 (+20, 원문 아님)</label>
          <label><span className="lbl">문항별 강조점 (한 줄에 하나 · <code>문항 | E1, E4</code>)</span><textarea name="structure" style={{ minHeight: 70 }} placeholder="지원 동기 | E8, E5" /></label>
          <fieldset className="card" style={{ padding: 14 }}>
            <legend><b>필수 동의</b> <span className="small muted">(버전 {contribution.CONSENT_VERSION})</span></legend>
            {contribution.REQUIRED_CONSENTS.map((k) => (
              <label key={k} className="check"><input type="checkbox" name={`consent_${k}`} required /><span className="small">{contribution.CONSENT_TEXT[k]}</span></label>
            ))}
          </fieldset>
          <SubmitButton pendingText="제출하는 중…">제출하기</SubmitButton>
        </form>
        <div className="grid">
          <div className="card">
            <h2>받을 수 있는 크레딧</h2>
            <table><tbody>
              <tr><td>합격 후기 쓰기</td><td className="num">+20</td></tr>
              <tr><td>합격 증빙 (합격자)</td><td className="num">+20</td></tr>
              <tr><td>지원서 구조 공유</td><td className="num">+20</td></tr>
              <tr><td>계정 연결 · 게시물 선택</td><td className="num">+10</td></tr>
            </tbody></table>
            <span className="small muted">검수 후 지급 · 같은 활동은 한 번만 · 철회하면 지급 예정 크레딧은 취소되고 데이터는 삭제돼요.</span>
          </div>
          {mine.map((c) => (
            <div key={c.id} className="card">
              <div className="row between"><h3>{c.activityName}</h3><span className="tag">{STATUS[c.status]}</span></div>
              <span className="small muted">보상 {(c.rewardTotal ?? contribution.computeReward(c).total)} 크레딧 · {c.history.map((h) => STATUS[h.to]).join(" → ")}</span>
              {c.review?.reason && <div className="note warn">반려 사유: {c.review.reason}</div>}
              {c.status === "approved" && c.storyReviewId && <span className="small">후기가 합격 경향에 더해졌어요. 고마워요!</span>}
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
