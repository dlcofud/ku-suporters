# 서포트랩 (ku-supporters)

> 서포터즈 혜택은 많은데, 하기 귀찮다면?
> 공고만 넣으면 합격까지의 일정을 짜고 콘텐츠를 같이 만드는 대학생 서포터즈 AI 매니저

2026 창업학회 서울대·연세대 연합 해커톤 프로젝트입니다.

## 시작하기
```bash
npm install
npm test                    # 핵심 모듈 테스트
npm run dev -w @supportlab/web   # 웹 앱 (http://localhost:3000)
```
웹 앱 환경 변수는 `apps/web/.env.example`을 `apps/web/.env.local`로 복사해서 채우세요.
아무것도 설정하지 않아도 데모 모드(메모리 저장소, 데모 게시, 예시 지표)로 모든 화면이 동작합니다.
영상 편집에는 서버에 `ffmpeg`가 필요합니다.

## 문서
- [구현 우선순위](docs/ROADMAP.md)
- [구조와 설계 원칙](docs/ARCHITECTURE.md)
- [인스타그램 개발 모드 설정 (예약 게시·인사이트)](docs/INSTAGRAM_SETUP.md)
- DB 스키마 초안: `supabase/migrations/`

## 화면 (apps/web)
| 경로 | 기능 |
|---|---|
| `/` | 가입(무료 크레딧) · 대시보드 |
| `/notice` | 공고 분석 → 우대사항별 행동 지침 |
| `/trends` | 팀 수집 시트 기반 합격 경향 (출처 표시) |
| `/skeleton` | 지원서 뼈대 |
| `/account` | 서포터즈 전용 계정 가이드 · 인스타 연결 |
| `/calendar` | 역산 업로드 캘린더 |
| `/studio` | 장면 기획 → 영상 업로드 → AI 편집 → 예약 게시 |
| `/feedback` | 성과 피드백 · 일정 반영 · 지원서 성과 문장 |
| `/contribute` | 합격 경험 공유 (동의 4종, 철회) |
| `/admin` | 업로드 자료 검수 (데모: 로그인 사용자 누구나) |

## 지금 상태
`packages/core`에 핵심 기능이 UI와 분리된 모듈로 구현되어 있고, 테스트 45개가 통과합니다 (ffmpeg가 있으면 실제 9:16 자막 릴스 렌더 테스트 포함).
`apps/web`에 Next.js 화면이 붙어 있고, 가입부터 예약 게시·검수까지 브라우저 테스트로 확인했습니다. 다음 단계는 메모리 저장소를 Supabase로 바꾸는 것입니다.
