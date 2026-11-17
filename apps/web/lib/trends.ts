import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { trends } from "@supportlab/core";
import { repo } from "./repo";

/**
 * 팀 수집 시트 불러오기.
 * TRENDS_CSV_URL(구글 시트 CSV 내보내기 주소)이 있으면 그걸 쓰고, 없으면 저장소 맨 위 data/curated.csv 를 쓴다.
 * (팀이 입력하는 시트는 코드와 떨어진 저장소 루트 data/ 폴더에 있다. data/README.md 참고)
 * 예: https://docs.google.com/spreadsheets/d/<시트ID>/gviz/tq?tqx=out:csv&sheet=수집
 */
export async function loadCurated(): Promise<trends.CuratedReview[]> {
  const url = process.env.TRENDS_CSV_URL;
  let csv: string;
  if (url) {
    const res = await fetch(url, { next: { revalidate: 600 } });
    csv = await res.text();
  } else {
    // next dev/start는 apps/web 에서, 배포 번들은 모노레포 루트 기준으로 돈다
    const path = [join(process.cwd(), "..", "..", "data", "curated.csv"), join(process.cwd(), "data", "curated.csv")].find(existsSync);
    if (!path) return [];
    csv = await readFile(path, "utf8");
  }
  return trends.parseCuratedCsv(csv);
}

/** 수집 시트 + 앱에서 코딩한 후기를 합친다 (같은 URL이면 앱 쪽이 우선) */
export async function loadAllReviews(): Promise<trends.CuratedReview[]> {
  const [sheet, coded] = await Promise.all([loadCurated().catch(() => []), repo.listCodedReviews().catch(() => [])]);
  const mine = coded.map(trends.toCurated);
  const urls = new Set(mine.map((r) => r.url));
  return [...mine, ...sheet.filter((r) => !urls.has(r.url))];
}
