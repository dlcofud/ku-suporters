import { redirect } from "next/navigation";

/** 예전 '계정 만들기' 주소. 이미 있는 계정을 연결·관리하는 건 성과 화면의 '계정 관리'로 옮겼다 */
export default function AccountPage() {
  redirect("/feedback#account");
}
