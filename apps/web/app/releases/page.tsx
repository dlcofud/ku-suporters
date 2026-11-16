import { RELEASES } from "@/lib/releases";

export default function ReleasesPage() {
  return (
    <>
      <header>
        <span className="eyebrow">서포트랩</span>
        <h1>릴리즈 노트</h1>
      </header>
      {RELEASES.map((r) => (
        <section key={r.version} className="card" style={{ maxWidth: 720 }}>
          <div className="row between"><h2>v{r.version}</h2><span className="small muted">{r.date}</span></div>
          <ul className="clean">{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
        </section>
      ))}
    </>
  );
}
