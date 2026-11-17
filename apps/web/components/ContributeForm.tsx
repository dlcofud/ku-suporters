"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Problem = { target: string; message: string };

/**
 * 합격 경험 공유 폼. 서버 검증(contribution.validateForSubmit)과 같은 규칙을 제출 전에 먼저 확인해서,
 * 실패해도 입력한 내용이 지워지지 않게 한다. 문제는 맨 위 요약에 모으고 각 칸으로 바로 가는 링크를 단다.
 */
export function ContributeForm({ action, hasIg, children }: { action: (fd: FormData) => void | Promise<void>; hasIg: boolean; children: ReactNode }) {
  const [problems, setProblems] = useState<Problem[]>([]);
  // 실패한 제출 횟수. 포커스는 제출이 막혔을 때만 요약으로 옮긴다 (입력 중에는 옮기지 않음)
  const [failedSubmits, setFailedSubmits] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (failedSubmits) summary.current?.focus();
  }, [failedSubmits]);

  function check(f: HTMLFormElement): Problem[] {
    const q = <T extends Element = HTMLInputElement>(sel: string) => f.querySelector(sel) as T | null;
    const all = (sel: string) => Array.from(f.querySelectorAll<HTMLInputElement>(sel));
    const out: Problem[] = [];
    if (!q("#activityName")?.value.trim()) out.push({ target: "activityName", message: "활동 이름을 입력해 주세요." });
    if (!hasIg && !q("input[name=demoConnect]")?.checked) out.push({ target: "s2", message: "인스타 계정을 연결하거나 데모 계정 연결에 체크해 주세요." });
    if (!all("input[name=media]").some((m) => m.checked)) out.push({ target: "s2", message: "지원할 때 쓴 게시물을 1개 이상 골라 주세요." });
    const result = all("input[name=result]").find((r) => r.checked)?.value;
    if (!result) out.push({ target: "s3", message: "결과(최종 합격·서류 합격·불합격)를 골라 주세요." });
    if (result && result !== "fail") {
      if (!q("#proof")?.files?.length) out.push({ target: "proof", message: "합격했다면 증빙(문자·메일 캡처)을 올려 주세요. 불합격이면 결과를 ‘불합격’으로 바꿔 주세요." });
      else if (!q("#redacted")?.checked) out.push({ target: "redacted", message: "증빙에서 이름·연락처를 가렸는지 확인하고 체크해 주세요." });
    }
    const consents = all("input[name^=consent_]");
    const missing = consents.filter((c) => !c.checked).length;
    if (missing) out.push({ target: "s4", message: `필수 동의 ${consents.length}개 중 ${missing}개에 아직 체크하지 않았어요.` });
    return out;
  }

  return (
    <form
      action={action}
      className="card"
      style={{ gap: 16 }}
      noValidate
      onSubmit={(e) => {
        const found = check(e.currentTarget);
        // 문제가 있으면 서버로 보내지 않는다 (React 는 preventDefault 된 제출에서 action 을 실행하지 않음)
        if (found.length) {
          e.preventDefault();
          setFailedSubmits((n) => n + 1);
        }
        setProblems(found);
      }}
      onChange={(e) => {
        // 요약이 떠 있으면 고칠 때마다 남은 문제만 보이게 갱신
        if (problems.length) setProblems(check(e.currentTarget));
      }}
    >
      {problems.length > 0 && (
        <div ref={summary} className="note warn" role="alert" tabIndex={-1}>
          <b>공유하기 전에 {problems.length}가지를 확인해 주세요.</b>
          <ul className="clean" style={{ marginTop: 6 }}>
            {problems.map((p) => (
              <li key={p.message}>
                <a href={`#${p.target}`} style={{ color: "inherit" }}>{p.message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </form>
  );
}

/** 서버에서 돌아온 오류 안내. 화면에 뜨면 포커스를 옮겨 스크린리더가 바로 읽게 한다 */
export function FocusAlert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} className="note warn" role="alert" tabIndex={-1} style={{ whiteSpace: "pre-line" }}>
      {children}
    </div>
  );
}
