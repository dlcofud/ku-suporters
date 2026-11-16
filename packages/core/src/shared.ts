/** 여러 모듈이 함께 쓰는 기본 타입과 날짜 도우미. */

export type ContentFormat = "reels" | "cardnews" | "post" | "check";

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  reels: "릴스",
  cardnews: "카드뉴스",
  post: "게시물",
  check: "점검",
};

/** "YYYY-MM-DD" 형식의 날짜 문자열. 시간대 문제를 피하려고 날짜만 다룬다. */
export type ISODate = string;

export function toISODate(d: Date): ISODate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`잘못된 날짜 형식: ${s}`);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}
