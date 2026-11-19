import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readMaterialFile, FormReadError } from "../src/apply/node.js";
import { buildCoachPrompt, coachTurn, coachTurnByRules, COACH_SCHEMA, startApplication, type MaterialInput } from "../src/apply/index.js";
import type { LLMClient, LLMRequest } from "../src/llm/index.js";
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

const notice: NoticeAnalysis = {
  title: "갤럭시 대학생 서포터즈",
  preferred: ["SNS 콘텐츠 제작 경험자"],
  activities: ["갤럭시 제품 활용 콘텐츠 제작"],
  benefits: [],
  submissions: [],
  stages: [],
  questions: ["지원 동기를 작성해 주세요. (300자)", "본인의 역량과 경험을 작성해 주세요. (500자)"],
  signalKeywords: [],
};
const ctx = { notice, activityName: "갤럭시 대학생 서포터즈" };
const fresh = () => startApplication({ activityName: ctx.activityName, notice });

/** 받은 요청을 기록하는 가짜 AI (이미지도 읽는 척) */
function recorder(answer: unknown, vision = true) {
  const seen: LLMRequest[] = [];
  const llm: LLMClient = {
    model: "rec",
    tier: "paid",
    vision,
    async complete(req) {
      seen.push(req);
      return { text: JSON.stringify(answer), inputTokens: 100, outputTokens: 50, model: "rec" };
    },
  };
  return { llm, seen };
}

const report: MaterialInput = { name: "동아리 활동 보고서.docx", kind: "text", text: "2025년 2학기 홍보부장. 인스타 계정 운영, 릴스 12개 제작, 팔로워 320명 → 1,050명." };
const shot: MaterialInput = { name: "인사이트.png", kind: "image", data: "AAAA", mediaType: "image/png" };

describe("코치 자료 요청", () => {
  it("시스템 규칙에 '어떤 경험이 필요한지 짚고 자료를 묻기'와 '자료 정리' 규칙이 있다", () => {
    const p = buildCoachPrompt(fresh(), notice, ctx.activityName, "1번 해요");
    expect(p.system).toContain("[자료 요청]");
    expect(p.system).toContain("관련 자료가 있는지");
    expect(p.system).toContain("[자료가 왔을 때]");
    expect(p.user).not.toContain("<새_자료>");
  });
  it("첫 인사에서 자료를 여러 개 올릴 수 있다고 알려 준다", () => {
    expect(fresh().chat[0]!.text).toContain("📎");
  });
  it("스키마에 materials가 있다", () => {
    expect(COACH_SCHEMA.required).toContain("materials");
  });
});

describe("자료를 올리면", () => {
  it("글 자료는 프롬프트에 본문으로, 이미지는 함께 보내고, 정리한 요약을 남기고 여러 문항에 초안을 쓴다", async () => {
    const { llm, seen } = recorder({
      reply: "보고서에서 홍보부장 경험을 찾아 2번에 썼어요. 캡처의 조회수는 1번에 넣었어요. 릴스를 만들 때 맡은 일이 기획이었나요?",
      focus: 1,
      updates: [
        { q: 0, text: "저는 동아리 인스타 계정을 운영하며 갤럭시로 릴스를 찍었습니다.", change: "계기 추가" },
        { q: 1, text: "홍보부장으로 릴스 12개를 만들어 팔로워를 320명에서 1,050명으로 늘렸습니다.", change: "보고서 경험 반영" },
      ],
      facts: ["2025년 2학기 홍보부장", "팔로워 320명 → 1,050명"],
      materials: [
        { name: "동아리 활동 보고서.docx", summary: "2025년 2학기 홍보부장으로 인스타 계정 운영. 릴스 12개, 팔로워 320→1,050명." },
        { name: "인사이트.png", summary: "릴스 조회수 화면 (최고 1.2만회)." },
      ],
    });
    const r = await coachTurn(fresh(), ctx, "", llm, [report, shot]);
    const req = seen[0]!;
    expect(req.user).toContain('<자료 이름="동아리 활동 보고서.docx" 종류="글">');
    expect(req.user).toContain("팔로워 320명");
    expect(req.user).toContain('종류="이미지"');
    expect(req.images).toEqual([{ mediaType: "image/png", data: "AAAA" }]);
    expect(req.maxOutputTokens).toBe(3600);
    expect(req.timeoutMs).toBe(28_000);
    expect(r.edits.map((e) => e.q)).toEqual([0, 1]);
    expect(r.app.materials).toHaveLength(2);
    expect(r.app.materials!.every((m) => m.summary && !m.text)).toBe(true);
    expect(r.app.chat.at(-2)!.files).toEqual(["동아리 활동 보고서.docx", "인사이트.png"]);
    // 다음 대화에서는 본문 대신 정리한 내용만 들어간다
    const next = buildCoachPrompt(r.app, notice, ctx.activityName, "다음");
    expect(next.user).toContain("정리한자료");
    expect(next.user).not.toContain("<새_자료>");
  });

  it("이미지를 못 읽는 AI면 글 자료만 넘긴다", async () => {
    const { llm, seen } = recorder({ reply: "보고서를 읽었어요.", focus: 0, updates: [], facts: [], materials: [] }, false);
    await coachTurn(fresh(), ctx, "자료예요", llm, [report, shot]);
    expect(seen[0]!.images).toBeUndefined();
    expect(seen[0]!.user).not.toContain("인사이트.png");
  });

  it("AI가 정리하지 못한 글 자료는 본문을 보관했다가 다음 대화에서 다시 읽는다", async () => {
    const first = recorder({ reply: "받았어요.", focus: 0, updates: [], facts: [], materials: [] });
    const r = await coachTurn(fresh(), ctx, "자료예요", first.llm, [report]);
    expect(r.app.materials![0]!.text).toContain("홍보부장");
    const second = recorder({ reply: "정리했어요.", focus: 0, updates: [], facts: [], materials: [{ name: "동아리 활동 보고서.docx", summary: "홍보부장 경험" }] });
    const r2 = await coachTurn(r.app, ctx, "자료 정리해 줘", second.llm);
    expect(second.seen[0]!.user).toContain("<새_자료>");
    expect(r2.app.materials![0]).toMatchObject({ summary: "홍보부장 경험" });
    expect(r2.app.materials![0]!.text).toBeUndefined();
  });

  it("규칙 기반 코치는 자료를 보관만 하고 나중에 정리하자고 한다", () => {
    const r = coachTurnByRules(fresh(), ctx, "자료예요", [report, shot]);
    expect(r.app.materials).toHaveLength(2);
    expect(r.app.materials![0]!.text).toBeTruthy();
    expect(r.app.materials![1]!.text).toBeUndefined();
    expect(r.app.chat.at(-1)!.text).toContain("자료 정리해 줘");
    expect(r.app.rule![0]!.notes).toEqual([]);
  });
});

describe("자료 파일 읽기", () => {
  it(".docx는 글로, 표는 칸을 ' | '로 잇는다", () => {
    const xml = `<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>활동 보고서</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>기간</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2025.09~12</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const m = readMaterialFile("보고서.docx", zip({ "word/document.xml": xml }));
    expect(m.kind).toBe("text");
    expect(m.text).toBe("활동 보고서\n기간 | 2025.09~12");
  });
  it("PDF와 이미지는 그대로 넘기고, .hwp와 모르는 형식은 안내한다", () => {
    expect(readMaterialFile("a.pdf", Buffer.from("%PDF-1.4"))).toMatchObject({ kind: "pdf", mediaType: "application/pdf" });
    expect(readMaterialFile("b.JPG", Buffer.from([1, 2, 3]))).toMatchObject({ kind: "image", mediaType: "image/jpeg" });
    expect(readMaterialFile("c.txt", Buffer.from(" 메모 "))).toMatchObject({ kind: "text", text: "메모" });
    expect(() => readMaterialFile("d.hwp", Buffer.from("x"))).toThrow(FormReadError);
    expect(() => readMaterialFile("e.zip", Buffer.from("x"))).toThrow(/읽을 수 없는 형식/);
  });
});
