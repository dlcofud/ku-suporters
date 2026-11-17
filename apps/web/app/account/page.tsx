import Link from "next/link";
import { requireUser, currentActivity } from "@/lib/session";
import { repo } from "@/lib/repo";
import { accountKitAction } from "@/lib/actions";
import { fmtLabel } from "@/lib/format";
import { SubmitButton, PendingNote } from "@/components/Pending";

const FIELDS = ["F&B·식품", "뷰티·패션", "IT·테크", "금융", "언론·미디어", "음악·엔터", "기타"];

export default async function AccountPage() {
  const user = await requireUser();
  const act = await currentActivity(user.id);
  if (!act) return <div className="card"><h1>먼저 공고를 분석해 주세요</h1><Link className="btn pri" href="/notice">공고 분석</Link></div>;
  const kit = act.accountKit;
  return (
    <>
      <header>
        <span className="eyebrow">{act.name}</span>
        <h1>서포터즈 전용 계정 만들기</h1>
      </header>
      <form action={accountKitAction} className="card">
        <div className="grid g4">
          <label>브랜드<input type="text" name="brand" defaultValue={act.name.split(" ")[0]} /></label>
          <label>분야<select name="field" defaultValue="F&B·식품">{FIELDS.map((f) => <option key={f}>{f}</option>)}</select></label>
          <label>영문 닉네임<input type="text" name="nickname" placeholder="chaeryeong" /></label>
          <label>관심사 (쉼표로)<input type="text" name="interests" placeholder="자취 요리, 카페" /></label>
        </div>
        <div className="row between">
          <label className="check"><input type="radio" name="concept" value="0" defaultChecked />리뷰어형</label>
          <label className="check"><input type="radio" name="concept" value="1" />생활 밀착형</label>
          <label className="check"><input type="radio" name="concept" value="2" />분석가형</label>
          <SubmitButton pendingText="만드는 중…">계정 가이드 만들기</SubmitButton>
        </div>
      </form>
      {kit && (
        <section className="grid g2" style={{ alignItems: "start" }}>
          <div className="card">
            <h2>아이디 후보</h2>
            <ul className="clean">{kit.usernames.map((u) => <li key={u}><code>@{u}</code></li>)}</ul>
            <h2>소개글</h2>
            <div className="note" style={{ whiteSpace: "pre-line" }}>{kit.bio}</div>
            <h2>하이라이트</h2>
            <div className="row">{kit.highlights.map((h) => <span key={h} className="tag">{h}</span>)}</div>
            <h2>컨셉</h2>
            {kit.concepts.map((c) => <p key={c.name} style={{ margin: 0 }}><b>{c.name}</b> · {c.oneLiner} <span className="muted small">({c.tone})</span></p>)}
          </div>
          <div className="card">
            <h2>첫 9개 게시물</h2>
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              {kit.grid.map((c) => (
                <div key={c.position} className={`chip k-${c.format}`} style={{ minHeight: 90 }}>
                  <b>{c.position}. {fmtLabel(c.format)}</b><br />{c.title}
                </div>
              ))}
            </div>
            <h2>프로페셔널 계정 전환</h2>
            <ol className="clean">{kit.professionalChecklist.map((s) => <li key={s.step}>{s.step} <span className="muted small">— {s.why}</span></li>)}</ol>
            <a className="btn pri" href="/api/instagram/login">인스타그램 계정 연결</a>
            {user.ig && <div className="note ok">연결됨: @{user.ig.username ?? user.ig.userId}</div>}
          </div>
        </section>
      )}
    </>
  );
}
