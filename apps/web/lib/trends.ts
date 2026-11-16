import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { trends } from "@supportlab/core";

/**
 * 팀 수집 시트 불러오기.
 * TRENDS_CSV_URL(구글 시트 CSV 내보내기 주소)이 있으면 그걸 쓰고, 없으면 저장소의 시드 데이터(data/curated.csv)를 쓴다.
 * 예: https://docs.google.com/spreadsheets/d/<시트ID>/gviz/tq?tqx=out:csv&sheet=수집
 */
export async function loadCurated(): Promise<trends.CuratedReview[]> {
  const url = process.env.TRENDS_CSV_URL;
  let csv: string;
  if (url) {
    const res = await fetch(url, { next: { revalidate: 600 } });
    csv = await res.text();
  } else {
    csv = await readFile(join(process.cwd(), "data", "curated.csv"), "utf8");
  }
  return trends.parseCuratedCsv(csv);
}
