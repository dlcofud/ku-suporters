import type { ReactNode } from "react";

/** 한 가지 선 아이콘 세트 (24 그리드, 선 굵기 1.9). 글자 옆 장식용이라 기본으로 스크린리더에서 숨긴다 */
const svg = (d: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {d}
  </svg>
);

export const Icon = {
  trends: (s?: number) => svg(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M3 20h18" /></>, s),
  skeleton: (s?: number) => svg(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>, s),
  calendar: (s?: number) => svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>, s),
  feedback: (s?: number) => svg(<><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></>, s),
  studio: (s?: number) => svg(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>, s),
  menu: (s?: number) => svg(<><path d="M4 7h16M4 12h16M4 17h16" /></>, s),
  plus: (s?: number) => svg(<path d="M12 5v14M5 12h14" />, s),
  check: (s?: number) => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, s),
  upload: (s?: number) => svg(<><path d="M12 15V4" /><path d="M7.5 8.5L12 4l4.5 4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>, s),
  flag: (s?: number) => svg(<><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></>, s),
  coin: (s?: number) => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5h4a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5h4M12 7.5v1.5M12 16.5V18" /></>, s),
};
