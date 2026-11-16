# 모듈 안내

모듈 하나 = `packages/core/src/<모듈>/` 폴더 하나 + `packages/core/test/<모듈>.test.ts` 테스트 하나.
화면은 `apps/web/app/<경로>/page.tsx`, 서버 동작은 `apps/web/lib/actions.ts`에서 모듈을 불러 씁니다.

**담당** 칸은 [ROADMAP의 팀 분담 제안](ROADMAP.md#팀-분담-제안-4인-기준)(A~D)을 기준으로 적어 두었습니다. 실제 담당이 정해지면 GitHub 아이디로 바꿔 주세요.

## 한눈에 보기
| 모듈 | 하는 일 | 화면 | 담당(제안) | 상태 |
|---|---|---|---|---|
| [`credits`](#credits--크레딧) | 크레딧 원장 (가입 보너스·차감·보상) | 사이드바 | B | ✅ |
| [`notice`](#notice--공고-분석) | 공고 → 마감일·우대사항·제출물·문항 | `/notice` | C | ✅ |
| [`skeleton`](#skeleton--지원서-뼈대) | 문항별 지원서 뼈대 | `/skeleton` | C | ✅ |
| [`planner`](#planner--업로드-캘린더) | 마감일에서 거꾸로 짠 업로드 일정 | `/calendar`, `/` | A | ✅ |
| [`trends`](#trends--합격-경향) | 팀 수집 시트 집계 | `/trends` | D | ✅ 데이터 수집 중 |
| [`account`](#account--전용-계정-가이드) | 서포터즈 전용 계정 가이드 | `/account` | A | ✅ |
| [`content`](#content--장면-기획영상-편집) | 장면 기획 → 클립 매칭 → ffmpeg 편집 | `/studio` | A | ✅ |
| [`publish`](#publish--예약-게시) | 예약 게시 스케줄러 + 인스타 게시 | `/studio` | B | ✅ 개발 모드 |
| [`feedback`](#feedback--성과-피드백) | 성과 요약·일정 제안·성과 문장 | `/feedback` | C | ✅ 목업 지표 |
| [`contribution`](#contribution--합격-경험-공유) | 동의 4종·검수·보상 | `/contribute`, `/admin` | D | ✅ |
| [`llm`](#llm--언어-모델) | LLM 인터페이스 (Mock / Ollama) | — | C | ✅ |

웹 앱 공통 (`apps/web/lib`)
| 파일 | 하는 일 | 담당(제안) |
|---|---|---|
| `repo.ts` | 저장소: 메모리 ↔ Supabase 전환, 파일(Storage) | B |
| `actions.ts` | 모든 서버 액션 | 화면 담당이 각자 해당 부분 |
| `session.ts` | 로그인 쿠키 (지금은 닉네임 가입) | B |
| `publisher.ts`, `media.ts` | 인스타 게시·지표 (실제 / 데모) | B |
| `ffmpeg.ts` | ffmpeg 경로·자막 글꼴 | A |

---

## credits — 크레딧
- **주요 함수:** `CreditLedger.grantSignupBonus` · `hold` → `settle` / `release` · `confirmPending` / `voidPending`
- **정책:** `CREDIT_POLICY` — 가입 50, 기여 보상(연결 10 / 증빙 20 / 구조화 20), 1크레딧 = 입력 1,000토큰(출력은 4배 가중)
- **규칙:** 규칙만으로 끝난 작업은 0 크레딧. 같은 `idempotencyKey`로 두 번 차감되지 않음.
- **저장소:** `CreditStore` 인터페이스 — `MemoryCreditStore`(core), `SupabaseCreditStore`(`apps/web/lib/repo.ts`)
- **다음 할 일:** 구독 요금제, 초대 보상

## notice — 공고 분석
- **주요 함수:** `analyzeNotice(text)` → `toActionGuides()`; 부족한 칸만 `analyzeNoticeWithLLM`
- **테스트 데이터:** `packages/core/test/fixtures/notice.txt`
- **다음 할 일:** 실제 공고 10개로 테스트 늘리기 (날짜 형식, "우대" 표현 다양화)

## skeleton — 지원서 뼈대
- **주요 함수:** `classifyQuestion` → `buildSkeleton` → (선택) `refineSkeletonWithLLM`
- **루브릭:** `RUBRIC` E1~E8 — trends의 평가 기준과 같은 코드
- **원칙:** 완성본을 써 주지 않고 구조·강조점·추천 경험만 제시

## planner — 업로드 캘린더
- **주요 함수:** `planSchedule` (D-3 포트폴리오 정리, D-1 최종 점검, 중간 점검, 2~3일 간격) · `changeFormat` · `distributeFormats`
- **다음 할 일:** 캘린더 모바일 화면, 일정 드래그로 옮기기

## trends — 합격 경향
- **데이터:** 팀원 1인당 15건을 구글 공유 시트에 수집 → CSV로 읽음 (`TRENDS_CSV_URL`, 없으면 `apps/web/data/curated.csv`)
- **주요 함수:** `parseCuratedCsv` → `buildTrendReport` → `formatMixHint`(planner 포맷 비율로 연결)
- **원칙:** 원문 저장 X, **출처 링크 필수**, 요약·점수·키워드만

## account — 전용 계정 가이드
- **주요 함수:** `buildAccountKit` (컨셉·아이디 후보·소개글·첫 9개 그리드·프로페셔널 전환 체크리스트) · `validateUsername`

## content — 장면 기획·영상 편집
- **주요 함수:** `planScenes` → `matchClips` → `buildEditPlan` → `buildFfmpegJob` / `draftCaption`
- **서버 전용:** `content/node.ts` — `renderWithFfmpeg`, `probeWithFfmpeg`(ffprobe 없이 길이·오디오 확인)
- **출력:** 9:16 1080×1920, H.264/AAC, 최대 90초, 자막은 ASS(libass) + Pretendard
- **업로드:** 데모 모드는 서버 액션, Supabase 모드는 브라우저 → Storage 직접 업로드(`components/ClipUploader.tsx`)

## publish — 예약 게시
- **주요 함수:** `validatePost` · `schedulePost` · `cancelPost` · `tick`(주기 실행)
- **흐름:** 게시 30분 전 컨테이너 생성(24시간 만료 대비) → 처리 완료 확인 → 게시. 실패하면 최대 3번 재시도.
- **주기 실행:** `/api/cron/publish` (Vercel 크론은 하루 1번, 5분 간격은 외부 크론 — [DEPLOY.md](DEPLOY.md))
- **제약:** Meta 앱 개발 모드 → 앱 역할이 있는 팀원 계정만 게시 가능 ([INSTAGRAM_SETUP.md](INSTAGRAM_SETUP.md))

## feedback — 성과 피드백
- **주요 함수:** `summarize` → `suggest`(planner 일정에 반영) / `achievementSentence`(지원서 문장)
- **데이터:** `GraphApiInstagramSource`(실제) / `MockInstagramSource`(데모)

## contribution — 합격 경험 공유
- **동의 4종:** 저작물 이용 · 개인정보 수집·이용 · 철회 방법 안내 · 본인 저작물 확인 (`CONSENT_VERSION`)
- **상태:** draft → submitted(보상 지급 예정) → in_review → approved(확정) / rejected(취소), 언제든 withdrawn
- **다음 할 일:** 관리자 권한 분리 (지금은 로그인한 누구나 `/admin` 접근)

## llm — 언어 모델
- `LLMClient` 인터페이스 · `MockLLM`(테스트·데모) · `OllamaClient`(로컬 Gemma, 0 크레딧) · `extractJson`

---

## 새 모듈 추가하기
1. `packages/core/src/<새모듈>/index.ts` 만들기
2. `packages/core/src/index.ts`에 `export * as <새모듈> from "./<새모듈>/index.js";`
3. `packages/core/package.json`의 `exports`에 경로 추가
4. `packages/core/test/<새모듈>.test.ts` 작성 → `npm test`
5. 화면에서 쓰려면 `apps/web/lib/actions.ts`에 액션, `apps/web/app/<경로>/page.tsx`에 화면
6. 이 문서 표에 한 줄 추가
