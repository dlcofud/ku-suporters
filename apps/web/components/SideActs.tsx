"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IN_ACT } from "./Nav";

export interface SideAct {
  id: string;
  name: string;
  stage: string;
  dday: string;
  hot: boolean;
  href: string;
  /** "12월 20일 마감" */
  due: string;
}

/** 사이드바: 내 서포터즈 목록 (누르면 그 서포터즈의 업로드 일정). 서포터즈 안 화면에서만 지금 서포터즈가 켜진다.
 *  children: 새 서포터즈 추가. 휴대폰 더보기 탭이 이 묶음(#more)으로 내려온다 */
export function SideActs({ acts, currentId, children }: { acts: SideAct[]; currentId?: string; children?: ReactNode }) {
  const path = usePathname();
  const inAct = IN_ACT.some(([h]) => path.startsWith(h));
  return (
    <nav className="navgroup" id="more" aria-label="내 서포터즈">
      <span className="navlabel">내 서포터즈</span>
      {acts.map((a) => {
        const on = inAct && a.id === currentId;
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
      {children}
    </nav>
  );
}
