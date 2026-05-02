# NEXIO — AI 컨텍스트 요약

> 이 파일은 AI 에이전트가 NEXIO 프로젝트를 빠르게 파악하기 위한 압축 요약본이다.
> 상세 내용은 `wiki/INDEX.md` → 각 토픽 파일 참조.

---

## 프로젝트 한 줄 요약

NEXIO는 한국 주식 자동매매 시스템으로, Next.js + Supabase 기반이며 실전 매매 결과를 학습하여 전략을 자동 최적화한다 (v6.5.1).

## 현재 상태 (2026-05-02 기준)

- **버전**: v6.5.1
- **배포**: https://nexio.vercel.app
- **계획 중 (v6.1)**: KIS Health Check API (`/api/kis/health`), notify.ts 알림 함수 2종 추가, 컴포넌트 훅 추출(useStockSearch 등), SignalTab 순수화
- **로드맵 (→v7.0)**: recordTradeMemory 누락 수정, 엔진 에러 알림, KIS 토큰 재발급 재시도, 학습 데이터 검증 UI, 백테스트 vs 실전 비교

## 절대 하면 안 되는 것

1. `npx vercel` 직접 실행 — 반드시 `deploy nexio` 스크립트 사용
2. `runLearning()` 엔진에서 직접 호출 — `loadLatestLearning()` 사용
3. Vercel Cron에 엔진 크론 재추가 — GitHub Actions `.github/workflows/engine-cron.yml` 이 담당
4. `/api/kis/order`에 credentials 클라이언트 파라미터 추가 — 서버가 kis_config DB에서 직접 조회
5. 소스 파일 수정 시 `node_modules/next/dist/docs/` 미확인
6. `notify.ts` 클라이언트 코드에서 직접 import — 서버 전용 모듈 (API route에서만 호출)
7. `sendKISApiErrorAlert` 호출 시 `appKey`/`appSecret`/`token` 포함 — 절대 금지

## 핵심 아키텍처 결정

| 결정 | 이유 |
|------|------|
| GitHub Actions 4회/일 엔진 크론 | Vercel Hobby Cron 하루 1회 한도 우회 |
| lib/engine/* 모듈 분리 | engine/route.ts 1,136줄 → 515줄로 단일책임 준수 |
| batchFetch 배치 병렬화 | STEP 2/3 N+1 순차 KIS 호출 제거 (10종목 기준 8s → 2.8s) |
| /api/kis/order DB credential 조회 | 클라이언트에 appKey/appSecret 노출 금지 |
| ATR 배수를 학습 대상으로 통합 | 학습 리스크값 vs ATR 충돌 해소 |
| learning.ts + learning-engine.ts 분리 | 공개 API / 내부 구현 단일책임 |
| learning_snapshots 영속화 | 엔진 실행마다 재계산 방지 |

## 중요 Gotchas

- `bb_position` 코드 값은 `below`/`above` (설계서의 `lower`/`upper`와 다름)
- `CRON_SECRET` 환경변수 미설정 시 `/api/engine` GET이 500 반환 (이전에는 선택)
- `atr_value = 0` 레코드는 학습에서 제외 (0 나누기 방지)
- `closePosition()` FIFO — 같은 종목 복수 open 포지션 있으면 가장 오래된 것만 처리
- `batchFetch` 는 `Promise.allSettled` 사용 — 개별 KIS 호출 실패해도 엔진 계속 진행
- KIS Health Check 폴링(`/api/kis/health`)은 60초 간격 — `stopHealthPolling()` cleanup 필수
- `sendKISApiErrorAlert` 알림에 KIS 자격증명 절대 포함 금지 (kisCode, kisMessage만 허용)

## 엔진 실행 구조

```
GitHub Actions (09:30/11:00/13:00/14:30 KST)
  → GET /api/engine (Authorization: Bearer CRON_SECRET)
  → STEP 0: cancelOpenBuyOrders + getMarketTrend (병렬)
  → STEP 1: 보유종목 손절/익절 평가
  → STEP 1.5: approved 신호 limitBuyOrder
  → STEP 2: watchlist 배치 신호 분석 (batchFetch)
  → STEP 3: 급등주 스캔 + 배치 신호 분석 (batchFetch)
  → logEngineRun()
```

## 학습 피드백 루프

```
매매 실행 → trade_memory 저장 → 주 1회 학습 (UTC 월요일, Vercel Cron /api/observer)
→ learning_snapshots 저장 → 엔진이 loadLatestLearning() → 다음 매매에 적용
```

## 주요 파일 (빠른 접근)

```
src/lib/learning.ts              — 학습 공개 API (runLearning, loadLatestLearning, applyLearning)
src/lib/learning-engine.ts       — 학습 내부 구현 (learnWeights, learnAtrMultipliers 등)
src/lib/kis/indicators.ts        — 기술 지표, ATR, calcDynamicRisk, calcPositionSize
src/lib/engine/kis.ts            — KIS API 호출 (limitBuyOrder, cancelOpenBuyOrders 등)
src/lib/engine/filters.ts        — 종목 필터 (DART, 시가총액, 상장일)
src/app/api/engine/route.ts      — 엔진 오케스트레이션 (STEP 0~3, batchFetch)
src/app/api/observer/route.ts    — 시장 감시 + 학습 트리거
.github/workflows/engine-cron.yml — GitHub Actions 크론 정의
```

## 다음 작업 (우선순위순, project-plan.md 기준)

**단계 1 (즉시 실행)**
1. recordTradeMemory 호출 누락 수정 (STEP 2/3/4, STEP 1.5)
2. 엔진 오류 Telegram 즉시 알림 (`sendEngineErrorAlert` 추가)
3. KIS 토큰 재발급 재시도 (2회, 1-2 완료 후)
4. 엔진 헬스체크 API — lastRunAt, status 반환
5. steps.ts utils 분리 (batchFetch, getOpeningBonus → utils.ts)

**단계 2 (1단계 완료 후)**
6. 학습 데이터 적재 검증 UI (tradeMemoryCount)
7. 백테스트 vs 실전 비교
8. signal-tab.tsx 분리 (~80줄 목표)
9. strategy-tab.tsx 분리 (~150줄 목표)
