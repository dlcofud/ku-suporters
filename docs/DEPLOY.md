# Vercel 배포

## 구성
- 프로젝트 루트: `apps/web` (모노레포 — npm workspaces로 `packages/core`를 함께 설치)
- 지역: `icn1` (서울) — `apps/web/vercel.json`
- 영상 편집: `ffmpeg-static` 바이너리 + 저장소에 포함된 Pretendard Bold 글꼴(OFL, `apps/web/assets/fonts/`)
  - ffmpeg-static 빌드에는 drawtext가 없어 자막은 **ASS 자막(libass)** 으로 입힌다
  - 길이·오디오 확인도 ffprobe 없이 ffmpeg만으로 한다 (`probeWithFfmpeg`)
- 업로드: 서버리스 함수는 요청 크기 제한(4.5MB)이 있어, 배포 환경(Supabase 모드)에서는
  브라우저가 **서명 업로드 주소로 Storage에 직접** 올리고 서버는 등록만 한다 (`components/ClipUploader.tsx`)
- 편집 함수 실행 시간: 스튜디오 페이지 `maxDuration = 60`초

## 환경 변수 (Vercel → Project → Settings → Environment Variables)
| 이름 | 값 | 비고 |
|---|---|---|
| `SUPABASE_URL` | `https://ctfrczbxfveozvplprnr.supabase.co` | |
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API Keys의 secret 키 | **대시보드에 직접 입력. 채팅·저장소에 붙여 넣지 말 것** |
| `CRON_SECRET` | 임의의 긴 문자열 | 예약 게시 크론 인증 |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Meta 앱 | 실제 게시할 때만 |
| `PUBLIC_BASE_URL` | 배포 주소 | Instagram이 영상을 가져갈 주소 |

## 예약 게시 주기
- Hobby 플랜 크론은 하루 1번만 돌 수 있어 `vercel.json`에는 매일 1회만 넣었다.
- 5분 간격이 필요하면 외부 크론(예: cron-job.org)에서
  `GET https://<배포주소>/api/cron/publish` 를 `Authorization: Bearer <CRON_SECRET>` 헤더로 5분마다 호출한다.
- 화면의 "지금 상태 확인" 버튼으로도 바로 진행할 수 있다.
