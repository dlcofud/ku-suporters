import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readFormFile, xmlToBlocks, FormReadError } from "../src/apply/node.js";
import { extractForm, mergeQuestions, parseFormText, sameQuestion } from "../src/apply/form.js";
import { importForm, startApplication } from "../src/apply/index.js";
import type { NoticeAnalysis } from "../src/notice/index.js";


/** 테스트용 zip 만들기 (deflate) */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, "utf8"));
    const n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, data);
    centrals.push(ch, n);
    off += lh.length + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

/**
 * 실제 서포터즈 지원서와 같은 구조로 만든 가짜 양식 (.docx).
 * 실제 기업 양식은 공개 저장소에 올리지 않는다.
 */
function sampleForm(): Buffer {
  const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const tc = (...ps: string[]) => `<w:tc>${ps.map(p).join("") || "<w:p/>"}</w:tc>`;
  const tr = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
  const tbl = (...rows: string[]) => `<w:tbl>${rows.join("")}</w:tbl>`;
  const body = [
    p("예시 대학생 서포터즈 3기 지원서"),
    p("* 모든 항목 폰트 또는 박스 크기 조절 가능"),
    tbl(tr(tc("기본 인적사항 *필수 기입")), tr(tc("사진"), tc("성명"), tc(""), tc("생년월일"), tc("XXXX-XX-XX")), tr(tc("사진"), tc("휴대폰 번호"), tc("010-XXXX-XXXX"))),
    tbl(tr(tc("1. 모집 소식을 접한 경로 (복수 선택 가능)", "* 해당하는 항목에 “O” 표기")), tr(tc("홈페이지"), tc("지인 추천"), tc("기타")), tr(tc(""), tc(""), tc(""))),
    tbl(tr(tc("2. 현재 사용 중인 제품 * 제품명 기준 작성")), tr(tc("스마트폰"), tc("태블릿")), tr(tc("예) 폰 A"), tc("예) 탭 B"))),
    tbl(tr(tc("3. 교내·외 활동", "* 최대 5개까지 작성")), tr(tc("기관/활동명"), tc("직책"), tc("활동 기간")), tr(tc(""), tc(""), tc("00.00.00 ~ 00.00.00"))),
    tbl(tr(tc("4. 자기소개")), tr(tc("나는 어떤 사람인가요? 자유롭게 자신을 소개해주세요 (500자 이내)")), tr(tc(""))),
    tbl(tr(tc("5. 선발된다면 직접 해보고 싶은 활동을 기획해 주세요.")), tr(tc("다음 보기 중 하나를 선택해 아이디어를 제안해 주세요. (500자 이내)", "① IT·테크 ② 게임")), tr(tc(""))),
    p("[ 유의사항 ]"),
    p("• 제출 완료된 지원서는 수정 불가합니다."),
    tbl(tr(tc("수집항목"), tc("수집 목적"), tc("보유기간")), tr(tc("사진, 성명, 생년월일"), tc("모집 운영"), tc("3개월"))),
  ].join("");
  return zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": `<w:document xmlns:w="x"><w:body>${body}</w:body></w:document>` });
}
const galaxy = sampleForm;

describe("양식 파일 읽기", () => {
  it("서포터즈 지원서 구조(.docx): 서술형 2개 + 직접 채울 항목 3개, 인적사항·개인정보 표는 읽지 않는다", () => {
    const r = readFormFile("form.docx", galaxy());
    expect(r.format).toBe("docx");
    expect(r.title).toBe("예시 대학생 서포터즈 3기 지원서");
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]).toMatchObject({ charLimit: 500 });
    expect(r.questions[0]!.text).toContain("자기소개");
    expect(r.questions[1]!.text).toContain("기획해 주세요");
    expect(r.questions[1]!.text).toContain("① IT·테크");
    expect(r.fields.map((f) => f.title)).toEqual(["1. 모집 소식을 접한 경로", "2. 현재 사용 중인 제품", "3. 교내·외 활동"]);
    expect(r.fields[2]!.detail).toContain("최대 5개까지 작성");
    const all = JSON.stringify(r);
    expect(all).not.toContain("생년월일");
    expect(all).not.toContain("수집항목");
  });

  it("한글(.hwpx): 표가 문단 안에 들어 있어도 읽는다", () => {
    const sec = `<hs:sec xmlns:hp="x"><hp:p><hp:run><hp:t>OO 서포터즈 지원서</hp:t></hp:run></hp:p>
      <hp:p><hp:run><hp:tbl><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>1. 지원 동기를 작성해 주세요 (300자 이내)</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr>
      <hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t></hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>
      <hp:p><hp:run><hp:t>2. 만들고 싶은 콘텐츠를 제안해 주세요. (200자)</hp:t></hp:run></hp:p></hs:sec>`;
    const r = readFormFile("form.hwpx", zip({ "mimetype": "application/hwp+zip", "Contents/section0.xml": sec }));
    expect(r.format).toBe("hwpx");
    expect(r.questions.map((q) => q.charLimit)).toEqual([300, 200]);
  });

  it("예전 한글·PDF·이상한 파일은 알아듣게 거절한다", () => {
    expect(() => readFormFile("a.hwp", Buffer.from("x"))).toThrow(/hwpx/);
    expect(() => readFormFile("a.pdf", Buffer.from("x"))).toThrow(FormReadError);
    expect(() => readFormFile("a.docx", Buffer.from("not a zip"))).toThrow(FormReadError);
  });

  it("XML 특수문자와 줄바꿈을 살린다", () => {
    const b = xmlToBlocks('<w:body><w:p><w:r><w:t>A &amp; B</w:t><w:br/><w:t xml:space="preserve">C</w:t></w:r></w:p></w:body>', "w");
    expect(b).toEqual([{ kind: "p", text: "A & B\nC" }]);
  });

  it("붙여넣은 글에서도 문항을 읽는다", () => {
    const r = parseFormText("지원서 문항\n1. 지원 동기 (500자)\n2) 본인의 강점을 설명해 주세요\n안내 문구");
    expect(r.questions).toEqual([{ text: "지원 동기 (500자)", charLimit: 500 }, { text: "본인의 강점을 설명해 주세요", charLimit: undefined }]);
    expect(parseFormText("서포터즈로서 이루고 싶은 목표는?").questions).toHaveLength(1);
    expect(extractForm([]).questions).toEqual([]);
  });
});

describe("공고 문항과 합치기", () => {
  it("같은 문항은 하나로, 글자 수 있는 쪽을 쓰고, 한쪽에만 있는 건 더한다", () => {
    expect(sameQuestion("1. 지원 동기를 작성해 주세요. (500자)", "지원 동기를 작성해 주세요")).toBe(true);
    expect(sameQuestion("자기소개", "활동 기획을 제안해 주세요")).toBe(false);
    const m = mergeQuestions(["지원 동기를 작성해 주세요", "본인의 역량을 작성해 주세요 (500자)"], [
      { text: "지원 동기를 작성해 주세요", charLimit: 300 },
      { text: "자기소개를 해 주세요", charLimit: 500 },
    ]);
    expect(m).toEqual([
      { text: "지원 동기를 작성해 주세요 (300자)", source: "both" },
      { text: "본인의 역량을 작성해 주세요 (500자)", source: "notice" },
      { text: "자기소개를 해 주세요 (500자)", source: "form" },
    ]);
  });

  it("지원서에 양식을 넣으면: 공고 문항이 없을 때는 양식 문항으로 시작하고, 직접 채울 항목을 보관한다", () => {
    const notice: NoticeAnalysis = { preferred: [], activities: [], benefits: [], submissions: [], stages: [], questions: [], signalKeywords: [] };
    const app = startApplication({ activityName: "갤럭시 대학생 서포터즈", notice });
    const r = importForm(app, readFormFile("form.docx", galaxy()), "form.docx");
    expect(r.added).toBe(2);
    expect(app.questions.map((q) => q.charLimit)).toEqual([500, 500]);
    expect(app.focus).toBe(0);
    expect(app.formFields).toHaveLength(3);
    expect(app.chat.at(-1)!.text).toContain("1번부터");
  });

  it("공고 문항이 있으면 겹치는 건 합치고 양식에만 있는 건 더한다 (이미 쓴 글은 그대로)", () => {
    const notice: NoticeAnalysis = { preferred: [], activities: [], benefits: [], submissions: [], stages: [], questions: ["자기소개 — 나는 어떤 사람인가요? 자유롭게 자신을 소개해주세요"], signalKeywords: [] };
    const app = startApplication({ activityName: "x", notice });
    app.answers[0] = { text: "이미 쓴 글", by: "user" };
    const r = importForm(app, readFormFile("form.docx", galaxy()));
    expect(r).toMatchObject({ added: 1, merged: 1 });
    expect(app.questions[0]!.charLimit).toBe(500);
    expect(app.answers[0]!.text).toBe("이미 쓴 글");
    expect(app.questions).toHaveLength(2);
  });
});
