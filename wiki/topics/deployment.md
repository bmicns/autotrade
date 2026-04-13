# Deployment — 배포 구성

[coverage: medium -- 3 sources]

## Purpose

NEXIO는 Vercel Hobby 플랜에서 운영. Next.js App Router + Vercel Cron을 조합하여 서버리스 자동매매 환경을 구성한다.

## 배포 정보

| 항목 | 값 |
|------|-----|
| 플랫폼 | Vercel (Hobby 플랜) |
| URL | https://nexio.vercel.app |
| alias | autotrade-umber.vercel.app |
| GitHub 계정 | watchers0930 |
| 현재 버전 | v5.9.0 |

## Vercel Cron 구성

Hobby 플랜은 **Cron 슬롯 2개 제한**. 현재 2개 모두 사용 중.

| Cron | 스케줄 | 역할 |
|------|--------|------|
| `/api/engine` | 하루 4회 | 매매 신호 분석 + 포지션 청산 |
| `/api/observer` | 매일 평일 UTC 00:00 | 시장 감시 + UTC 월요일 학습 트리거 |

**중요**: 추가 Cron 등록 불가. 신규 기능의 정기 실행이 필요한 경우 기존 Cron에 조건 분기로 병합해야 함.

## 학습 Cron 병합 결정

v5.9.0 적응형 학습 엔진 추가 시, 별도 학습 Cron 대신 `/api/observer`에 UTC 월요일(`getUTCDay() === 1`) 조건으로 병합:

```typescript
// observer/route.ts
if (new Date().getUTCDay() === 1) {
  await runLearning();
}
```

→ `vercel.json` 변경 없음.

## 배포 절차

- 배포 스크립트: `~/scripts/deploy.sh`
- 명령: `deploy nexio` (직접 `npx vercel` 실행 금지)
- 배포 후 커스텀 도메인 alias 자동 갱신 처리

## 환경 변수

- `CRON_SECRET` — `/api/learn` POST 인증용
- KIS API 인증 관련 시크릿 (구체값은 Vercel 환경변수로 관리)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 서버리스 제약

- Vercel 서버리스 함수 — ML 모델 실행 불가 (메모리/시간 제약)
- 실시간 강화학습 불가 — 주 1회 배치 학습으로 대체
- 각 Cron 실행은 독립 함수 인스턴스 (상태 유지 불가, DB로 영속화)

## Gotchas

- Hobby 플랜 Cron 2개 한도는 절대 초과 불가
- 학습 실행은 월요일 `observer` Cron에 종속 — 수동 실행 시 `POST /api/learn` 사용 (CRON_SECRET 필요)
- 배포 후 alias 갱신 확인 필수

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md` (Section 3: P4 결정 사항)
- `docs/04-report/features/adaptive-engine.report.md` (Section 5: 배포, Section 7: 기술적 의사결정 #1)
- MEMORY.md (NEXIO 섹션)
