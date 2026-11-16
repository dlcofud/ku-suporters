import { redirect } from "next/navigation";

/** 콘텐츠 캘린더는 메인 화면으로 옮겼다 (예전 링크 호환) */
export default function CalendarPage() {
  redirect("/");
}
