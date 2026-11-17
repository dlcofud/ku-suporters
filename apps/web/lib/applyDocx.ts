import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { apply } from "@supportlab/core";

/**
 * 지원서 작성(코치)에서 완성한 문항·답을 워드(.docx)로 만든다.
 * - 원래 양식 파일은 저장하지 않으므로, 같은 문항 순서로 깔끔한 새 문서를 만든다
 * - '직접 채울 항목'(사용 제품, SNS 계정 등)은 표로 넣고 칸은 비워 둔다
 * - 글자 수 제한이 있으면 문항마다 '글자 수 n / 제한' 을 적고, 넘치면 빨갛게 표시한다
 */
const FONT = "Malgun Gothic";
const INK = "1C2140";
const MUTED = "6B7186";
const RED = "D62F3A";

const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text, bold: o.bold, size: o.size ?? 21, color: o.color ?? INK, italics: o.italics, font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT } });

const cell = (children: Paragraph[], o: { width: number; shade?: boolean }) =>
  new TableCell({
    children,
    width: { size: o.width, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    shading: o.shade ? { type: ShadingType.CLEAR, color: "auto", fill: "F2F3F7" } : undefined,
  });

export function applicationDocxName(activityName: string): string {
  const safe = activityName.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 60) || "지원서";
  return `${safe}_지원서.docx`;
}

export async function buildApplicationDocx(input: { activityName: string; nickname: string; app: apply.Application; date?: Date }): Promise<Buffer> {
  const { app } = input;
  const date = (input.date ?? new Date()).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const body: (Paragraph | Table)[] = [];

  body.push(new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [run(`${input.activityName} 지원서`, { bold: true, size: 36 })] }));
  body.push(
    new Paragraph({
      spacing: { after: 360 },
      children: [run(`${input.nickname} · ${date} · 서포트랩에서 작성`, { size: 18, color: MUTED }), ...(app.formName ? [run(` · 양식: ${app.formName}`, { size: 18, color: MUTED })] : [])],
    }),
  );

  if (app.formFields?.length) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 120 }, children: [run("직접 채울 항목", { bold: true, size: 26 })] }));
    body.push(new Paragraph({ spacing: { after: 120 }, children: [run("양식에서 읽은 항목이에요. 제출 전에 직접 채워 주세요.", { size: 18, color: MUTED })] }));
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: "C9CCD8" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "C9CCD8" },
          left: { style: BorderStyle.SINGLE, size: 4, color: "C9CCD8" },
          right: { style: BorderStyle.SINGLE, size: 4, color: "C9CCD8" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "C9CCD8" },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "C9CCD8" },
        },
        rows: app.formFields.map(
          (f) =>
            new TableRow({
              children: [
                cell([new Paragraph({ children: [run(f.title, { bold: true, size: 19 })] }), ...(f.detail ? [new Paragraph({ children: [run(f.detail, { size: 16, color: MUTED })] })] : [])], { width: 35, shade: true }),
                cell([new Paragraph({ children: [run("")] })], { width: 65 }),
              ],
            }),
        ),
      }),
    );
    body.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  if (!app.questions.length) {
    body.push(new Paragraph({ children: [run("아직 문항이 없어요. 지원서 작성 화면에서 문항을 더해 주세요.", { color: MUTED })] }));
  }

  app.questions.forEach((q, i) => {
    const text = (app.answers[i]?.text ?? "").trim();
    const n = apply.charCount(text);
    const over = q.charLimit !== undefined && n > q.charLimit;
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 80 }, keepNext: true, children: [run(`${i + 1}. ${q.text}`, { bold: true, size: 23 })] }));
    body.push(
      new Paragraph({
        spacing: { after: 120 },
        keepNext: true,
        children: [run(q.charLimit ? `글자 수 ${n} / ${q.charLimit}자${over ? ` · ${n - q.charLimit}자 넘음` : ""}` : `글자 수 ${n}`, { size: 17, color: over ? RED : MUTED, bold: over })],
      }),
    );
    if (!text) {
      body.push(new Paragraph({ children: [run("(아직 쓰지 않았어요)", { color: MUTED, italics: true })] }));
      return;
    }
    for (const line of text.split(/\r?\n/)) {
      body.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 360 }, children: [run(line)] }));
    }
  });

  const doc = new Document({
    creator: "서포트랩",
    title: `${input.activityName} 지원서`,
    styles: { default: { document: { run: { font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT }, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1300, right: 1300 } } }, children: body }],
  });
  return Packer.toBuffer(doc);
}
