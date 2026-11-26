# 인스타그램 연동 설정 (개발 모드, 팀 본인 계정)

해커톤 데모에서는 Meta 앱을 **개발 모드**로 두고, 앱에 역할(관리자·개발자·테스터)이 있는 팀원 본인 계정으로 게시·인사이트 API를 쓴다.
개발 모드에서는 역할이 있는 사람에게만 권한이 동작하므로 앱 검수가 필요 없다. 다른 사용자 계정에 게시하려면 출시 전에 Meta 앱 검수(Advanced Access)를 받아야 한다.

## 1. 인스타 계정 준비
1. 인스타 앱에서 설정 > 계정 유형 및 도구 > **프로페셔널 계정으로 전환** (크리에이터 추천)
2. 공개 계정으로 유지

## 2. Meta 앱 만들기 (통합 로그인, 2026-11 기준)
2026년 10월 말부터 새로 만든 Meta 앱은 'API setup with Instagram login'을 쓸 수 없고 **'API setup with Unified login'(통합 로그인)**만 쓴다.
토큰은 비즈니스 시스템 사용자 토큰(EAA…)이고 만료되지 않으며 `graph.facebook.com`에서 인스타 계정 ID로 부른다. 예전 방식으로 연결된 계정(IG… 토큰)도 코드가 그대로 지원한다 (`apps/web/lib/meta.ts`).

1. Meta for Developers → 앱 만들기 → 사용 사례 **Instagram에서 메시지 및 콘텐츠 관리**
2. 사용 사례 → 맞춤 설정 → **API setup with Unified login**
   - 비즈니스 포트폴리오를 연결하라고 하면 새로 만든다 (무료, 비즈니스 인증 필요 없음)
3. **1. 앱 구성 → 새로운 구성 만들기** → 기본값(시스템 사용자 토큰, 만료 없음)으로 템플릿에서 만들기
   - '권한 수정'에서 `instagram_manage_insights` 추가 (성과 화면). 가능하면 `business_management`도 추가 (없으면 토큰 정보로 계정을 찾는다)
   - 구성에 **선택됨** 배지가 있는지 확인. 구성 ID를 적어 둔다
4. 같은 화면 **리디렉션 URL**에 `https://ku-suporters.vercel.app/api/instagram/callback` 저장 (로컬은 `http://localhost:3000/api/instagram/callback`)
5. **2. 액세스 토큰 생성 → 계정 추가** → 역할 **Instagram 테스터**에 팀원 인스타 아이디 추가 → 브라우저에서 instagram.com → 설정 → 웹사이트 권한 → 앱 및 웹사이트 → 테스터 초대 수락
   - 계정 목록이 비거나 'Instagram Pro account required'면 business.facebook.com → 설정 → 계정 → Instagram 계정에서 포트폴리오에 먼저 추가
   - '토큰 생성' 버튼은 누르지 않아도 된다 (앱에서 로그인할 때 토큰을 받는다)

## 3. 환경 변수 (Vercel 또는 .env.local, 저장소에 올리지 않기)
```
META_APP_ID=            # 앱 설정 > 기본 설정의 앱 ID
META_APP_SECRET=        # 같은 화면의 앱 시크릿 코드
META_LOGIN_CONFIG_ID=   # 3번에서 만든 구성 ID
META_REDIRECT_URI=      # (선택) 비우면 지금 주소 + /api/instagram/callback
```
로그인 흐름: `/api/instagram/login` → `facebook.com/v26.0/dialog/oauth?client_id&config_id&response_type=code&override_default_response_type=true&state` → `/api/instagram/callback` → `graph.facebook.com/v26.0/oauth/access_token` → `me/assigned_instagram_accounts` (안 되면 `debug_token`의 granular_scopes) 로 인스타 계정 ID를 찾는다.

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
