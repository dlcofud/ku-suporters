import { requireUser } from "@/lib/session";
import { StartScreen } from "@/components/StartScreen";

/** + 새 서포터즈 추가: "어떤 서포터즈에 지원하나요?" (분석 결과는 /notice/result) */
export default async function NoticePage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string; url?: string }> }) {
  await requireUser();
  const { error, msg, url } = await searchParams;
  return <StartScreen error={error} msg={msg} url={url} />;
}
