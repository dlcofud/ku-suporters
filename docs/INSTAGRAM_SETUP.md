# 인스타그램 연동 설정 (개발 모드, 팀 본인 계정)

해커톤 데모에서는 Meta 앱을 **개발 모드**로 두고, 앱에 역할(관리자·개발자·테스터)이 있는 팀원 본인 계정으로 게시·인사이트 API를 쓴다.
개발 모드에서는 역할이 있는 사람에게만 권한이 동작하므로 앱 검수가 필요 없다. 다른 사용자 계정에 게시하려면 출시 전에 Meta 앱 검수(Advanced Access)를 받아야 한다.

## 1. 인스타 계정 준비
1. 인스타 앱에서 설정 > 계정 유형 및 도구 > **프로페셔널 계정으로 전환** (크리에이터 추천)
2. 공개 계정으로 유지

## 2. Meta 앱 만들기
1. Meta for Developers에서 앱 생성 → 사용 사례로 **Instagram API (Instagram 로그인)** 선택
2. 권한 추가: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`
3. 앱 역할 > **Instagram 테스터**에 팀원 인스타 계정 추가 → 인스타 앱(웹) 설정에서 테스터 초대 수락
4. 리디렉션 URI 등록: `http://localhost:3000/api/instagram/callback` (배포 후 Vercel 주소 추가)

## 3. 환경 변수 (.env.local, 저장소에 올리지 않기)
```
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/instagram/callback
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## 4. 예약 게시가 동작하는 방식 (`packages/core/src/publish`)
- 예약은 우리 DB(`scheduled_posts`)에 저장한다. 인스타 컨테이너는 24시간 안에 게시하지 않으면 만료되기 때문에 미리 만들어 두지 않는다.
- 주기 작업(Vercel Cron 또는 Supabase pg_cron)이 5분마다 `tick()`을 부른다.
  - 게시 30분 전: 컨테이너 생성 (`POST /{ig-user-id}/media`, 릴스는 `media_type=REELS`, `video_url`)
  - 처리 상태 확인 (`GET /{container-id}?fields=status_code`) → `FINISHED`가 되면 준비 완료
  - 게시 시각: 한도 확인(`content_publishing_limit`) 후 게시 (`POST /{ig-user-id}/media_publish`)
- 영상은 인스타 서버가 가져갈 수 있는 **공개 https 주소**여야 한다 → Supabase Storage 서명 URL 사용.
- 영상 규격: 9:16, H.264 + AAC, 90초 이하 → `content` 모듈의 렌더 결과가 이 규격을 따른다.

## 5. 영상 편집 (`packages/core/src/content`)
- 서버: `renderWithFfmpeg()` — 서버에 ffmpeg 설치 필요 (Vercel 함수에서는 `ffmpeg-static` 경로를 `ffmpegPath`로 전달하거나, 렌더 전용 작은 서버/Supabase Edge 대신 별도 워커 사용 권장)
- 브라우저: `buildFfmpegJob()`이 만든 인자를 `@ffmpeg/ffmpeg`(ffmpeg.wasm)에 그대로 넘겨도 된다. 큰 영상은 느리므로 15~30초 릴스에 적합.
- 한국어 자막에는 한글 글꼴 파일이 필요하다 (Noto Sans KR, Pretendard 등 오픈 라이선스 글꼴).
