import { requireUser } from "@/lib/session";
import { repo } from "@/lib/repo";
import { contributeAction, withdrawAction } from "@/lib/actions";
import { contribution, credits } from "@supportlab/core";
import { myMedia } from "@/lib/media";
import { fmtLabel, md } from "@/lib/format";
import { SubmitButton } from "@/components/SubmitButton";
import { ContributeForm, FocusAlert } from "@/components/ContributeForm";
import { FileButton } from "@/components/FileButton";

const STATUS: Record<string, string> = { submitted: "검수 대기", in_review: "검수 중", approved: "승인 · 지급 완료", rejected: "반려", withdrawn: "철회됨", draft: "작성 중" };
const STATUS_TAG: Record<string, string> = { submitted: "k-reels", in_review: "k-reels", approved: "k-post", rejected: "k-cardnews" };
const STEPS = ["활동 선택", "인스타 연결", "결과 확인", "동의"] as const;

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { media } = await myMedia(user);
  const mine = await repo.listContributions({ userId: user.id });
  const acts = await repo.listActivities(user.id);
  const p = credits.CREDIT_POLICY.contribution;
  const maxReward = p.connect + p.proof + p.structure;
  return (
    <>
      <header>
        <h1>합격 경험 공유하고 크레딧 받기</h1>
        <p className="lede" style={{ marginTop: 8 }}>지원할 때 올린 게시물과 결과를 나눠 주면, 다음 지원자의 경향 분석에 쓰이고 최대 {maxReward} 크레딧을 받아요.</p>
      </header>

      <nav aria-label="작성 순서">
        <ol className="steps">
          {STEPS.map((label, i) => (
            <li key={label} className="step">
              <a href={`#s${i + 1}`}><b>{i + 1}</b>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      {sp.error && (
        <FocusAlert>
          <b>공유하지 못했어요.</b> 아래 내용을 고친 뒤 다시 공유해 주세요.{"\n"}{sp.error}
        </FocusAlert>
      )}
      {sp.done && <div className="note ok" role="status">경험을 공유했어요. 검수가 끝나면 크레딧이 들어오고, 그 전까지는 ‘지급 예정’으로 보여요.</div>}

      <section className="cwrap">
        <ContributeForm action={contributeAction} hasIg={!!user.ig}>
          <p className="small muted" style={{ margin: 0 }}><span className="req" aria-hidden="true">*</span> 표시는 꼭 채워야 해요.</p>

          <fieldset id="s1" className="fs">
            <legend><b>1</b>활동 선택</legend>
            <label>
              <span>활동 이름<span className="req" aria-hidden="true">*</span></span>
              <input type="text" id="activityName" name="activityName"placeholder="예: 달콤제과 서포터즈 13기" required list="my-activities" autoComplete="off" aria-describedby="s1-help" />
              {acts.length > 0 && (
                <datalist id="my-activities">
                  {acts.map((a) => <option key={a.id} value={a.name} />)}
                </datalist>
              )}
              <span id="s1-help" className="help">{acts.length > 0 ? "내 활동에서 고르거나 직접 입력하세요." : "공고에 적힌 활동 이름 그대로 적어 주세요."} 같은 활동은 한 번만 보상받을 수 있어요.</span>
            </label>
          </fieldset>

          <fieldset id="s2" className="fs">
            <legend><b>2</b>인스타 연결 · 게시물 선택</legend>
            {!user.ig && <label className="check"><input type="checkbox" name="demoConnect" defaultChecked />데모 계정으로 연결 (인스타 연결 전)</label>}
            {media.length === 0 && <p className="muted" style={{ margin: 0 }}>가져올 게시물이 없어요. 인스타 계정을 연결하면 여기서 고를 수 있어요.</p>}
            {media.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" name="media" value={m.id} />
                <span><span className="num" style={{ fontWeight: 500 }}>{md(m.date)}</span> · <span className={`tag k-${m.format}`}>{fmtLabel(m.format)}</span> {m.title ?? m.id}</span>
              </label>
            ))}
            <span className="help">지원할 때 쓴 게시물만 골라 주세요. 고르지 않은 게시물은 가져오지 않아요. (+{p.connect})</span>
          </fieldset>

          <fieldset id="s3" className="fs">
            <legend><b>3</b>결과 확인</legend>
            <div role="radiogroup" aria-label="지원 결과" className="row" style={{ gap: 16 }}>
              <label className="check"><input type="radio" name="result" value="final_pass" defaultChecked />최종 합격</label>
              <label className="check"><input type="radio" name="result" value="document_pass" />서류 합격</label>
              <label className="check"><input type="radio" name="result" value="fail" />불합격</label>
            </div>
            <span className="help">불합격 결과도 다음 지원자에게 비교 기준이 돼요.</span>
            <div className="field">
              <span className="lbl">합격 증빙 (문자·메일 캡처, 합격자만)</span>
              <FileButton id="proof" name="proof" accept="image/*" label="캡처 이미지 선택" ariaLabel="합격 증빙 이미지" describedBy="s3-proof" />
              <span id="s3-proof" className="help">이름·전화번호·이메일은 가린 뒤 올려 주세요. (+{p.proof})</span>
            </div>
            <label className="check"><input type="checkbox" id="redacted" name="redacted" />증빙에서 이름·전화번호·이메일을 가렸어요</label>
            <label className="check"><input type="checkbox" name="shareStructure" />지원서 구조도 공유할게요 (+{p.structure}, 원문 아님)</label>
            <label>
              문항별 강조점
              <textarea name="structure" style={{ minHeight: 80 }} placeholder="지원 동기 | E8, E5" aria-describedby="s3-structure" />
              <span id="s3-structure" className="help">한 줄에 한 문항씩 ‘문항 | 강조 코드’ 형식으로 적어 주세요. 문장 원문은 받지 않아요.</span>
            </label>
          </fieldset>

          <fieldset id="s4" className="fs">
            <legend><b>4</b>필수 동의 <span className="small muted" style={{ fontWeight: 400 }}>(버전 {contribution.CONSENT_VERSION})</span></legend>
            {contribution.REQUIRED_CONSENTS.map((k) => (
              <label key={k} className="check">
                <input type="checkbox" name={`consent_${k}`} required />
                <span className="small">{contribution.CONSENT_TEXT[k]}<span className="req" aria-hidden="true">*</span></span>
              </label>
            ))}
          </fieldset>

          <div className="row between">
            <span className="small muted">공유한 뒤에도 언제든 철회할 수 있어요.</span>
            <SubmitButton pending="공유하는 중…">경험 공유하기</SubmitButton>
          </div>
        </ContributeForm>

        <div className="grid sticky" style={{ gap: 16 }}>
          <div className="card">
            <h2>받을 수 있는 크레딧</h2>
            <table className="rwd">
              <caption className="sr-only">항목별 보상 크레딧</caption>
              <tbody>
                <tr><td>계정 연결 · 게시물 선택</td><td className="num">+{p.connect}</td></tr>
                <tr><td>합격 증빙 (합격자)</td><td className="num">+{p.proof}</td></tr>
                <tr><td>지원서 구조 공유</td><td className="num">+{p.structure}</td></tr>
                <tr><td><b>최대</b></td><td className="num">{maxReward}</td></tr>
              </tbody>
            </table>
            <p className="small muted" style={{ margin: 0 }}>크레딧은 검수가 끝나면 들어오고, 같은 활동으로는 한 번만 받을 수 있어요. 공유를 철회하면 지급 예정 크레딧은 취소되고 올린 데이터는 삭제돼요.</p>
          </div>

          {mine.length > 0 && <h2 className="small muted" style={{ fontWeight: 600, fontSize: 13 }}>내가 공유한 경험</h2>}
          {mine.map((c) => (
            <div key={c.id} className="card">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <h3 style={{ minWidth: 0, overflowWrap: "anywhere" }}>{c.activityName}</h3>
                <span className={`tag ${STATUS_TAG[c.status] ?? ""}`}>{STATUS[c.status]}</span>
              </div>
              <span className="small muted">보상 {contribution.computeReward(c).total} 크레딧. 진행: {c.history.map((h) => STATUS[h.to]).join(", ")}</span>
              {c.review?.reason && <div className="note warn">반려 사유: {c.review.reason}</div>}
              {c.status !== "withdrawn" && (
                <form action={withdrawAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="btn warn" pending="철회 중…" confirm={`‘${c.activityName}’ 공유를 철회할까요? 지급 예정 크레딧이 취소되고 올린 데이터가 삭제돼요. 되돌릴 수 없어요.`}>
                    공유 철회 (데이터 삭제)
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
