# 서포트랩 (ku-supporters)

> 서포터즈 혜택은 많은데, 하기 귀찮다면?
> 공고만 넣으면 합격까지의 일정을 짜고 콘텐츠를 같이 만드는 대학생 서포터즈 AI 매니저

2026 창업학회 서울대·연세대 연합 해커톤 프로젝트입니다.

---

## 처음 왔다면 이 순서로 읽어 주세요
1. **이 README** — 무엇을 만드는지, 어떻게 실행하는지
2. **[CONTRIBUTING.md](CONTRIBUTING.md)** — 브랜치·커밋·PR 규칙, 하면 안 되는 것 (꼭 읽기)
3. **[docs/MODULES.md](docs/MODULES.md)** — 기능별 코드 위치, 담당, 다음 할 일
4. **[docs/BACKLOG.md](docs/BACKLOG.md)** — 지금 가져갈 수 있는 작업 목록

## 📋 합격 후기 수집 시트 (팀원 입력)
팀이 직접 채우는 데이터는 코드와 따로 **[`data/`](data/) 폴더**에 있어요.

| | 파일 | |
|---|---|---|
| ✏️ 입력용 엑셀 | **[data/수집시트.xlsx](data/수집시트.xlsx)** | 받아서 엑셀로 열기 (작성 방법 · 수집 · 코드북 탭) |
| 👀 지금 데이터 | **[data/curated.csv](data/curated.csv)** | GitHub에서 바로 표로 보기 |
| 📖 입력 방법 | **[data/README.md](data/README.md)** | 노란 칸만 입력, 원문 금지, 출처 필수 |

앱의 **후기 분석 (팀)** 화면(`/reviews`)에서 AI가 먼저 점수를 매기고, 검수한 결과를 같은 열 순서의 CSV로 내보낼 수 있어요.

## 5분 안에 실행하기
필요한 것: **Node.js 22** (`.nvmrc`), npm. 영상 편집용 ffmpeg는 `npm install` 때 자동으로 받아집니다.

```bash
git clone https://github.com/dlcofud/ku-suporters.git
cd ku-suporters
npm install
npm run dev          # http://localhost:3000
```

- **환경 변수 없이도 전부 동작합니다 (데모 모드).** 메모리 저장소 · 데모 게시 · 예시 지표를 씁니다. 서버를 껐다 켜면 데이터가 사라집니다.
- 배포할 때는 `SESSION_SECRET`(로그인 쿠키 서명용, 32자 이상 아무 문자열)을 꼭 넣어 주세요. 로컬에서는 비워도 돼요.
- **실제 AI**를 쓰려면 `apps/web/.env.local`에 `ANTHROPIC_API_KEY`를 넣어요. 없으면 공고 분석은 규칙 기반, 후기 분석은 규칙 기반 초안으로 동작해요. 키는 저장소·채팅에 올리지 마세요.
- 실제 DB(Supabase)를 쓰려면 `apps/web/.env.example`을 `apps/web/.env.local`로 복사하고 `SUPABASE_SECRET_KEY`를 채웁니다. 키는 팀장에게 **개인 메시지로** 받으세요 — [docs/SUPABASE.md](docs/SUPABASE.md)

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 웹 앱 개발 서버 |
| `npm test` | 핵심 모듈 테스트 (vitest) |
| `npm run typecheck` | core + web 타입 검사 |
| `npm run build` | 웹 앱 프로덕션 빌드 |
| `npm run check` | PR 올리기 전 한 번에: 타입 검사 + 테스트 + 빌드 |

## 무엇을 만드나
대학생이 서포터즈에 **붙고**, 붙은 뒤 **활동을 덜 귀찮게** 하도록 돕습니다. 크레딧(토큰)제로 수익을 냅니다.

| 단계 | 화면 | 기능 | 크레딧 |
|---|---|---|---|
| 가입 | `/` · `/login` · `/settings` | 아이디·비밀번호 회원가입(무료 50 크레딧) · 로그인 · 로그아웃 · 비밀번호 변경 | +50 |
| 지원 전 | `/notice` | **공고 링크만 붙여넣기** (또는 본문) → 포스터 이미지 글자까지 읽기(OCR) → 마감일·우대사항·제출물 추출 → 행동 지침. 지원서 양식 파일(.docx·.hwpx)도 함께 | 규칙으로 끝나면 0 |
| | `/trends` | 팀이 수집한 합격 후기 집계 (출처 표시) | 0 |
| | `/reviews` | **후기 분석 (팀)**: 후기 본문 → AI가 코드북(E1~E8)으로 점수·근거 초안 → 사람 검수 → 사람-AI 일치도(κ) | 0 |
| | `/skeleton` | 지원서 문항별 뼈대 (완성본이 아니라 구조) | 1 |
| | `/account` | 서포터즈 전용 인스타 계정 가이드 · 인스타 연결 | 0 |
| 활동 | `/` (메인) | 콘텐츠 캘린더: 마감일에서 거꾸로 짠 일정, 날짜별 할 일·체크리스트, 업로드 알림(.ics) | 0 |
| | `/studio` | 장면 기획 → 촬영 영상 업로드 → AI 편집(ffmpeg: 장면 역할에 맞는 구간 자동 선택) → 예약 게시 | 사용량만큼 |
| | `/feedback` | 성과 피드백 · 일정 반영 · 지원서용 성과 문장 | 사용량만큼 |
| 보상 | `/contribute` | 합격 경험 공유 (동의 4종, 철회) → 검수 후 크레딧 | +10~50 |
| 운영 | `/admin` | 업로드 자료 검수 | — |

## 폴더 구조
```
ku-suporters/
├─ packages/core/          핵심 로직 (화면·DB와 분리, 테스트로 검증)   → 기능 담당자가 주로 작업
│  ├─ src/<모듈>/index.ts   모듈 하나 = 폴더 하나
│  └─ test/<모듈>.test.ts
├─ apps/web/               Next.js 15 웹 앱                            → 화면 담당자가 주로 작업
│  ├─ app/<경로>/page.tsx   화면
│  ├─ lib/actions.ts        서버 액션 (화면 ↔ core ↔ 저장소 연결)
│  ├─ lib/repo.ts           저장소 (메모리 / Supabase 전환)
│  └─ components/           공용 컴포넌트
├─ supabase/migrations/    DB 스키마
├─ data/                   팀이 입력하는 합격 후기 수집 시트 (수집시트.xlsx, curated.csv)
├─ docs/                   설계·설정 문서
└─ .github/                PR·이슈 템플릿, CI
```
흐름과 설계 원칙은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 문서 모음
| 문서 | 내용 |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | 협업 규칙 |
| [docs/MODULES.md](docs/MODULES.md) | 모듈별 안내·담당·다음 할 일 |
| [docs/BACKLOG.md](docs/BACKLOG.md) | 작업 목록 (이슈로 옮길 후보) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 우선순위와 그 이유 |
| [docs/FEATURE_PRIORITY.md](docs/FEATURE_PRIORITY.md) | 핵심 기능 우선순위 (AI 연결 · 후기 분석 · 영상 편집, 조사 근거) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조·데이터 흐름·설계 원칙 |
| [docs/SUPABASE.md](docs/SUPABASE.md) | DB·Storage 설정 |
| [docs/INSTAGRAM_SETUP.md](docs/INSTAGRAM_SETUP.md) | 인스타 개발 모드 (예약 게시·인사이트) |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Vercel 배포 |

## 지금 상태 (2026-11-16)
- ✅ 핵심 모듈 11개 구현, 테스트 51개 통과 (실제 9:16 자막 릴스 렌더 포함)
- ✅ 모든 화면 동작, 가입 → 예약 게시 → 검수까지 브라우저 테스트 통과
- ✅ Supabase(DB + 비공개 Storage) 연결, 배포용 설정(ffmpeg·한글 글꼴·직접 업로드)
- ⏳ Vercel 배포, 관리자 권한 분리, 비밀번호 찾기 — [docs/BACKLOG.md](docs/BACKLOG.md)
