import { analyzeNoticeAction } from "@/lib/actions";
import { SubmitButton, PendingNote } from "@/components/Pending";
import { FilePick } from "@/components/FilePick";

const ERR: Record<string, string> = {
  short: "공고 내용을 조금 더 붙여넣어 주세요.",
  empty: "공고 링크를 넣거나 내용을 붙여넣어 주세요.",
  credits: "크레딧이 부족해요. 왼쪽 아래 '충전 · 내역'에서 충전하거나, 합격 경험을 공유하면 크레딧을 받을 수 있어요.",
};

const imgIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 9" /></svg>
);
const docIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /></svg>
);

/**
 * "어떤 서포터즈에 지원하나요?" — 서포터즈를 처음 시작할 때(첫 방문)와 '+ 새 서포터즈 추가'에서 쓰는 화면.
 * 입력창 하나에 링크든 공고 내용이든 넣고, 포스터 이미지와 지원서 양식은 옆 상자로 같이 올린다.
 */
export function StartScreen({ first, nickname, error, msg, url }: { first?: boolean; nickname?: string; error?: string; msg?: string; url?: string }) {
  return (
    <div className="start">
      <div className="start-head">
        <span className="tag k-hl">{first ? `${nickname ?? ""}님, 환영해요` : "새 서포터즈"}</span>
        <h1>어떤 서포터즈에 지원하나요?</h1>
        <p className="lede">공고 링크나 포스터 이미지를 넣어 주세요. 지원서 양식 파일이 있으면 같이 넣어도 돼요. 공고를 읽은 뒤 지원서부터 콘텐츠까지 이어서 준비해요.</p>
      </div>

      {error && <div className="note warn" role="alert">{error === "fetch" ? `${msg ?? "페이지를 읽지 못했어요."} 공고 내용을 그대로 붙여넣어 주세요.` : ERR[error] ?? error}</div>}

      <form action={analyzeNoticeAction} className="start-box">
        <label className="start-input">
          <span className="lbl">공고 링크 또는 내용</span>
          <textarea name="input" rows={3} defaultValue={url} required placeholder="https://… 공고 주소를 붙여넣거나, 공고 내용을 그대로 붙여넣으세요" autoFocus />
        </label>
        <div className="start-row">
          <FilePick name="images" accept="image/png,image/jpeg,image/webp" multiple icon={imgIcon} label="포스터 이미지" hint="글자를 읽어요 · 최대 4장" />
          <FilePick name="form" accept=".docx,.hwpx,.txt" icon={docIcon} label="지원서 양식" hint=".docx · .hwpx" />
          <SubmitButton className="btn pri start-go" pendingText="읽는 중…">공고 읽기</SubmitButton>
        </div>
        <details className="small">
          <summary>이름 직접 정하기 (선택)</summary>
          <label style={{ marginTop: 8 }}>서포터즈 이름<input type="text" name="name" maxLength={60} placeholder="비우면 공고 제목을 써요" /></label>
        </details>
        <PendingNote steps={["공고 페이지를 읽고 있어요", "포스터 이미지의 글자를 읽고 있어요", "마감일·제출물·문항을 찾고 있어요", "AI가 빠진 항목을 채우고 있어요", "업로드 일정을 짜고 있어요"]} hint="보통 5초~1분 걸려요. 로컬 모델은 처음에 더 걸릴 수 있어요." />
      </form>

      <ol className="start-steps">
        <li><b>1 · 공고를 읽어요</b><span>마감, 문항, 우대사항을 뽑아요</span></li>
        <li><b>2 · 물어보며 같이 써요</b><span>내 경험으로만 지원서를 채워요</span></li>
        <li><b>3 · 마감까지 이어가요</b><span>콘텐츠 일정, 제작, 성과까지</span></li>
      </ol>
      <p className="small muted" style={{ margin: 0, textAlign: "center" }}>공고 원문과 양식 파일은 저장하지 않고, 뽑아낸 사실과 링크만 남겨요.</p>
    </div>
  );
}
