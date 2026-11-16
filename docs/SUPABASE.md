# Supabase 설정 (ku_suporters)

- 프로젝트: `ku_suporters` (서울 리전 `ap-northeast-2`)
- URL: `https://ctfrczbxfveozvplprnr.supabase.co`
- 스키마: `supabase/migrations/20261116_app_schema.sql` (이미 적용됨)

## 접근 방식
브라우저는 DB에 직접 접근하지 않습니다. Next.js 서버(서버 액션·라우트)만 **secret 키**로 읽고 씁니다.
그래서 모든 테이블에 RLS를 켜고 정책을 두지 않았습니다. 보안 점검에서 "RLS enabled, no policy" 안내가 나오는 것은 의도한 설정입니다.
나중에 브라우저에서 직접 읽어야 하는 화면이 생기면 그 테이블에만 `auth.uid()` 기반 정책을 추가하세요.

## 연결하기
1. Supabase 대시보드 > Project Settings > API Keys > **Secret keys**에서 키를 만들거나 복사합니다 (`sb_secret_...`).
2. `apps/web/.env.local`에 넣습니다 (저장소·채팅에 올리지 마세요).
   ```
   SUPABASE_URL=https://ctfrczbxfveozvplprnr.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ```
3. `npm run dev -w @supportlab/web` — 두 값이 있으면 자동으로 Supabase 모드로 동작합니다.
4. Vercel에 배포할 때도 같은 두 값을 Environment Variables에 넣습니다.

## 테이블
| 테이블 | 내용 |
|---|---|
| `app_users` | 닉네임 가입 사용자, 연결한 인스타 계정(토큰은 서버 전용) |
| `credit_ledger` | 크레딧 원장 (잔액은 합계로 계산, `user_id + idempotency_key` 유일) |
| `activities` | 공고 분석 결과(원문 제외), 행동 지침, 일정, 지원서 뼈대, 계정 가이드 |
| `scene_plans` · `content_clips` · `renders` | 장면 기획, 업로드한 클립, 편집 결과 (파일은 Storage) |
| `scheduled_posts` | 예약 게시 상태와 기록 |
| `contributions` | 합격자 기여 (동의 기록·검수 이력 포함) |
| `demo_media` | 인스타 연결 전 예시 지표 |

## Storage
- 버킷 `media` (비공개, 파일당 200MB)
  - `clips/<user>/<item>/...` 업로드한 촬영 영상
  - `renders/<user>/<id>.mp4` 편집 결과 — `/api/media/<id>`가 1시간 서명 URL로 넘겨줌 (인스타 서버도 이 주소로 영상을 가져감)
  - `proofs/<user>/...` 합격 증빙 — 검수가 끝나거나 철회하면 삭제
