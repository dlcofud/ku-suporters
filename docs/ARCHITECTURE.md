# 구조

```
ku-suporters/
├─ packages/core/        화면과 분리된 핵심 로직 (TypeScript, 의존성 없음)
│  ├─ src/credits        크레딧 원장: 가입 보너스, 예약→정산 차감, 지급 예정 보상
│  ├─ src/notice         공고 분석: 마감일·우대사항·제출물·문항 추출 → 행동 지침
│  ├─ src/skeleton       지원서 뼈대: 문항 유형별 구조·강조점·추천 경험 (완성본 X)
│  ├─ src/planner        역산 업로드 캘린더: D-28부터 2~3일 간격, 점검일·마감
│  ├─ src/trends         팀 수집 시트(CSV) 집계: 루브릭 점수, 키워드 빈도, 출처
│  ├─ src/contribution   합격자 기여: 동의 4종, 상태 머신, 검수, 보상
│  ├─ src/feedback       성과 요약·일정 제안·지원서 성과 문장 + Graph API 어댑터
│  └─ src/llm            LLM 인터페이스 (상용 API / Ollama-Gemma / Mock)
├─ apps/web/             (다음 단계) Next.js 웹 앱
├─ supabase/migrations/  DB 스키마 초안 (RLS 포함)
└─ docs/                 우선순위, 구조
```

## 모듈 사이의 흐름

```
공고 텍스트 ─▶ notice.analyzeNotice ─┬─▶ skeleton.buildSkeleton ─▶ 지원서 뼈대
                                      └─▶ planner.planSchedule ─▶ 업로드 캘린더
trends.buildTrendReport ─▶ formatMixHint ─┘   (포맷 비율)
인스타 지표 ─▶ feedback.summarize ─▶ suggest ─▶ planner.changeFormat
                                  └─▶ achievementSentence ─▶ 지원서 성과 문장
모든 LLM 작업 ─▶ credits.hold ─▶ (실행) ─▶ credits.settle
합격자 기여 ─▶ contribution.submit(지급 예정) ─▶ decide(확정/취소) ─▶ credits
```

## 설계 원칙
- **교체 가능한 의존성:** 저장소(`CreditStore`), LLM(`LLMClient`), 인스타(`InstagramSource`)는 인터페이스다. 지금은 메모리·Mock, 통합 단계에서 Supabase·실제 API로 바꾼다.
- **비싼 LLM은 마지막에만:** 공고 분석·뼈대·일정은 규칙 기반이 기본이고, 부족할 때만 LLM을 부른다. 로컬 모델(Ollama의 Gemma 4)은 0 크레딧.
- **원본 미저장:** 공고 원문, 게시물 사진·영상·캡션은 저장하지 않는다. 지표·사실·출처만 남긴다.
- **크롤링 없음:** 인스타 데이터는 사용자 본인 계정(OAuth)과 Business Discovery(공식 API)만 쓴다.
- **날짜 조작 없음:** 캘린더는 실제로 나눠 올리도록 돕는다.
