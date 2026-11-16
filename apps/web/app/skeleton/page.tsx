import Link from "next/link";
import { requireUser } from "@/lib/session";
import { repo } from "@/lib/repo";
import { skeletonAction } from "@/lib/actions";

export default async function SkeletonPage() {
  const user = await requireUser();
  const act = await repo.latestActivity(user.id);
  if (!act) return <div className="card"><h1>먼저 공고를 분석해 주세요</h1><Link className="btn pri" href="/notice">공고 분석</Link></div>;
  const s = act.skeleton;
  return (
    <>
      <header>
        <span className="eyebrow">{act.name}</span>
        <h1>지원서 뼈대</h1>
      </header>
      <form action={skeletonAction} className="card">
        <label>
          내 경험 (한 줄에 하나 · <code>제목 | 설명 | 성과1, 성과2</code>)
          <textarea name="experiences" placeholder={"개인 맛집 블로그 | 식품 리뷰 블로그 운영 | 월 방문자 1.2만\n과 학생회 기획국 | 축제 홍보물 제작"} />
        </label>
        <label>
          추가 문항 (공고에서 못 찾은 문항이 있으면 한 줄에 하나)
          <textarea name="questions" style={{ minHeight: 70 }} placeholder="예: 서포터즈 활동을 통해 이루고 싶은 목표는? (300자)" />
        </label>
        <label className="check"><input type="checkbox" name="hasChannel" defaultChecked />활동용 SNS 계정이 있어요</label>
        <div className="row between">
          <span className="small muted">완성 문장은 만들지 않아요. 구조와 강조점만 제안하고, 문장은 직접 채워요.</span>
          <button className="btn pri" type="submit">뼈대 만들기</button>
        </div>
      </form>
      {s && (
        <>
          {s.overall.map((o) => <div key={o} className="note">{o}</div>)}
          {s.sections.length === 0 && <div className="note warn">문항을 찾지 못했어요. 위의 ‘추가 문항’에 직접 넣어 주세요.</div>}
          {s.sections.map((sec, i) => (
            <section key={i} className="card">
              <div className="row between">
                <h2>{i + 1}. {sec.question}</h2>
                {sec.charLimit && <span className="tag">{sec.charLimit}자</span>}
              </div>
              <div className="grid g3" style={{ alignItems: "start" }}>
                <div><h3>쓰는 순서</h3><ol className="clean">{sec.structure.map((x) => <li key={x}>{x}</li>)}</ol></div>
                <div><h3>강조할 점</h3><ul className="clean">{sec.emphasize.map((e) => <li key={e.code}><b>{e.code} {e.label}</b> — {e.why}</li>)}</ul></div>
                <div>
                  <h3>꺼낼 경험</h3>
                  {sec.suggestedExperiences.length ? <ul className="clean">{sec.suggestedExperiences.map((e) => <li key={e.title}><b>{e.title}</b> — {e.reason}</li>)}</ul> : <p className="small muted">맞는 경험이 아직 없어요.</p>}
                  <h3 style={{ marginTop: 10 }}>피할 것</h3>
                  <ul className="clean">{sec.avoid.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
