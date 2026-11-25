"use client";
import { usePathname } from "next/navigation";

export interface SideAct {
  id: string;
  name: string;
  stage: string;
  dday: string;
  hot: boolean;
  href: string;
}

/** 사이드바 더보기 아래: 내 서포터즈 목록 (누르면 그 서포터즈의 업로드 일정). 홈이 아니면 지금 고른 서포터즈를 표시한다 */
export function SideActs({ acts, currentId }: { acts: SideAct[]; currentId?: string }) {
  const path = usePathname();
  const home = path === "/";
  return (
    <nav className="navgroup" aria-label="내 서포터즈">
      <span className="navlabel">내 서포터즈</span>
      {acts.map((a) => {
        const on = !home && a.id === currentId;
        return (
          // 서포터즈를 고르는 주소(/go)는 미리 불러오면 선택이 바뀌므로 Link가 아닌 a (클릭할 때만 이동)
          <a key={a.id} href={a.href} className={on ? "nav act on" : "nav act"} aria-current={on ? "true" : undefined}>
            <span className="actname" style={{ display: "flex", flexDirection: "column" }}>
              <span>{a.name}</span>
              <small className="stage">{a.stage}</small>
            </span>
            <span className={a.hot ? "dd hot" : "dd"}>{a.dday}</span>
          </a>
        );
      })}
    </nav>
  );
}
