# 서포트랩 (ku-supporters)

> 서포터즈 혜택은 많은데, 하기 귀찮다면?
> 공고만 넣으면 합격까지의 일정을 짜고 콘텐츠를 같이 만드는 대학생 서포터즈 AI 매니저

2026 창업학회 서울대·연세대 연합 해커톤 프로젝트입니다.

## 시작하기
```bash
npm install
npm test          # 핵심 모듈 테스트
npm run typecheck
```

## 문서
- [구현 우선순위](docs/ROADMAP.md)
- [구조와 설계 원칙](docs/ARCHITECTURE.md)
- DB 스키마 초안: `supabase/migrations/0001_init.sql`

## 지금 상태
`packages/core`에 핵심 기능이 UI와 분리된 모듈로 구현되어 있고, 테스트 32개가 통과합니다.
다음 단계는 `apps/web`(Next.js)에서 화면을 만든 뒤 Supabase와 연결하는 것입니다.
