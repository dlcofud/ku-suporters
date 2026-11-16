import { NextResponse } from "next/server";
import { currentUser, currentActivity } from "@/lib/session";
import { fmtLabel } from "@/lib/format";

/**
 * 업로드 알림: 일정 하나를 .ics 파일로 내려준다.
 * 휴대폰·구글 캘린더에 추가하면 당일 오후 8시에 일정이 잡히고 1시간 전에 알림이 뜬다.
 */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse("로그인이 필요해요", { status: 401 });
  const act = await currentActivity(user.id);
  const itemId = new URL(req.url).searchParams.get("item");
  const item = act?.plan?.items.find((i) => i.id === itemId);
  if (!act || !item) return new NextResponse("일정을 찾지 못했어요", { status: 404 });
  const ymd = item.date.replaceAll("-", "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const base = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SupportLab//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${act.id}-${item.id}@supportlab`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T110000Z`, // 한국 시간 오후 8시
    `DTEND:${ymd}T113000Z`,
    `SUMMARY:${esc(`[${fmtLabel(item.format)}] ${item.title} 올리기`)}`,
    `DESCRIPTION:${esc(`${act.name}\n${item.purpose}\n\n체크리스트\n${item.checklist.map((c) => `- ${c}`).join("\n")}\n\n${base}/studio?item=${item.id}`)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`오늘 ${item.title} 올리는 날이에요`)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="supportlab-${item.date}.ics"`,
    },
  });
}
