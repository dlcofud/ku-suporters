import { redirect } from "next/navigation";

/** 예전 '공유 승인' 주소 → 검수 화면의 공유 승인 칸 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  redirect(error ? `/reviews?shareError=${encodeURIComponent(error)}#shared` : "/reviews#shared");
}
