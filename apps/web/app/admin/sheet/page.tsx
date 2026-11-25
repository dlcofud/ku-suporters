import { redirect } from "next/navigation";

/** 예전 '후기 시트' 주소 → 업로드 */
export default function OldSheetPage() {
  redirect("/upload");
}
