# 함께 작업하는 방법

해커톤은 2주라 규칙은 최소로, 대신 **아래 "절대 하지 말 것"만큼은 꼭** 지켜 주세요.

## 🚫 절대 하지 말 것
1. **비밀 키를 커밋·채팅·이슈에 올리지 않기.** `SUPABASE_SECRET_KEY`, `INSTAGRAM_APP_SECRET`, `CRON_SECRET` 등은 `.env.local`(깃에 안 올라감)과 Vercel 대시보드에만 둡니다. 실수로 올렸다면 바로 팀장에게 알려 주세요 — 키를 새로 발급해야 합니다.
2. **`main`에 직접 push 하지 않기.** 항상 브랜치 → PR.
3. **인스타그램 크롤링 코드 넣지 않기.** 데이터는 사용자 본인 계정(OAuth)과 공식 API(Business Discovery)로만 받습니다.
4. **남의 게시물 원문·사진·영상을 저장하지 않기.** 경향 분석은 출처 링크·요약·점수만 씁니다 (저작권).
5. **업로드 날짜를 조작하는 기능 만들지 않기.** 캘린더는 실제로 나눠 올리도록 돕는 것이 목적입니다.

## 작업 흐름
```
이슈 고르기 → 브랜치 만들기 → 작업 + 테스트 → npm run check → PR → 리뷰 1명 → 합치기(Squash)
```

### 1. 이슈 고르기
- [docs/BACKLOG.md](docs/BACKLOG.md) 또는 GitHub Issues에서 고르고, 이슈에 **본인을 Assignee로** 지정해 겹치지 않게 합니다.
- 없는 작업이면 이슈부터 만듭니다 (템플릿 있음).

### 2. 브랜치 이름
`종류/모듈-짧은설명` (영어 소문자, 하이픈)
```
feat/notice-more-date-formats
fix/studio-upload-error
ui/calendar-mobile
docs/supabase-setup
```
종류: `feat` 기능 · `fix` 버그 · `ui` 화면만 · `refactor` 동작 변화 없는 정리 · `test` 테스트 · `docs` 문서 · `chore` 설정

```bash
git switch main && git pull
git switch -c feat/notice-more-date-formats
```

### 3. 커밋 메시지
한글로 편하게, 앞에 종류만 붙입니다.
```
feat(notice): "~까지" 형식 마감일도 인식
fix(studio): 업로드 실패 시 오류 문구 표시
```

### 4. PR 올리기 전
```bash
npm run check     # 타입 검사 + 테스트 + 빌드. 하나라도 실패하면 PR 하지 않기
```
- `packages/core`를 고쳤다면 **테스트를 추가하거나 고치기** (`packages/core/test/<모듈>.test.ts`).
- 화면을 고쳤다면 PR에 **스크린샷** 첨부.
- GitHub Actions(CI)가 같은 검사를 자동으로 돌립니다. 빨간불이면 합칠 수 없습니다.

### 5. 리뷰와 합치기
- 리뷰어 1명이 승인하면 **Squash and merge**. 합친 뒤 브랜치는 삭제.
- 리뷰는 24시간 안에. 급하면 단톡방에 PR 링크 공유.
- 충돌이 나면 PR 작성자가 `git pull origin main`으로 해결합니다.

## 코드 규칙 (이것만 알면 됨)

### 어디에 코드를 넣을까
| 하고 싶은 것 | 넣을 곳 |
|---|---|
| 계산·판단·규칙 (공고 분석, 크레딧 계산, 일정 짜기…) | `packages/core/src/<모듈>/` + 테스트 |
| 화면 | `apps/web/app/<경로>/page.tsx` |
| 버튼을 눌렀을 때 서버에서 할 일 | `apps/web/lib/actions.ts` |
| DB 읽기·쓰기 | `apps/web/lib/repo.ts` (메모리·Supabase **둘 다** 구현) |
| DB 테이블 추가·변경 | `supabase/migrations/<날짜>_<설명>.sql` 새 파일 (기존 파일 수정 X) |

### 지켜야 할 경계
- **`packages/core`는 화면·DB·Next.js를 모릅니다.** `next`, `react`, `@supabase/*`를 import 하지 않습니다. 외부 의존(저장소·LLM·인스타)은 인터페이스로 받습니다. 그래야 화면 없이 테스트됩니다.
- core 안에서 import는 `.js` 확장자로 씁니다: `import { x } from "../shared.js"` (실제 파일은 `.ts`).
- 서버 전용 코드(파일·프로세스)는 `content/node.ts`처럼 따로 둡니다.

### 크레딧이 드는 기능을 만들 때
1. `credits.TASK_ESTIMATES`에 작업 종류 추가
2. 액션에서 `ledger.hold()` → 실행 → `ledger.settle()` (실패하면 `release()`)
3. 규칙만으로 끝나면 0 크레딧 — 비싼 LLM은 마지막에만 부릅니다.

### 화면 문구
- 사용자에게 보이는 말은 **쉬운 한국어**로. 개발 용어(컨테이너, 토큰, API…) 대신 하는 일을 말합니다.
  - ❌ "컨테이너 생성 실패" → ✅ "인스타에 영상을 올리지 못했어요. 잠시 후 다시 시도할게요"

## 환경 변수 받기
- 팀장에게 개인 메시지로 받거나, Vercel 프로젝트 → Settings → Environment Variables에서 확인합니다.
- 새 환경 변수를 추가했다면 `apps/web/.env.example`에 **이름과 설명만** 추가하고 PR에 적어 주세요.

## 막히면
- 이슈에 댓글로 남기거나 단톡방에 "어디서 / 뭘 하려다 / 어떤 오류" 세 가지를 적어 주세요.
- 자주 나오는 문제
  - `npm install` 후 영상 편집이 안 됨 → `node_modules/ffmpeg-static/ffmpeg`가 있는지 확인, 없으면 `npm rebuild ffmpeg-static`
  - 포트가 이미 사용 중 → `npx kill-port 3000` 또는 `npm run dev -- -p 3001`
  - 데이터가 사라짐 → 데모 모드(메모리)라서 정상입니다. 유지하려면 Supabase 키 설정
