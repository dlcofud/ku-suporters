import { shared } from "@supportlab/core";
export const fmtLabel = (f: string | null) => (f ? shared.FORMAT_LABEL[f as keyof typeof shared.FORMAT_LABEL] ?? f : "마감");
export const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
export const dday = (n: number) => (n > 0 ? `D-${n}` : n === 0 ? "D-day" : `D+${-n}`);
