# NEXIO 고도화 로드맵 — v6.5.1 → v7.0

> 목표: 현존 최고의 개인 자동매매 앱
> 작성일: 2026-05-02
> 우선순위 충돌 시: 안정성 > 전략 > UI > 코드품질

---

## 단계 1 — 즉시 실행 (독립 작업, 순서 무관)

### ★★★ 1-1. recordTradeMemory 호출 누락 수정
**위치**: `src/lib/engine/steps-scan.ts`, `src/lib/engine/steps.ts`
**현황**: `recordTradeMemory()` 함수가 `db.ts`에 구현되어 있으나, STEP 2/3/4 매수 성공 분기 및 STEP 1.5 승인 매수에서 호출 누락. `trade_memory` 테이블에 데이터가 쌓이지 않아 학습 루프 자체가 유명무실할 수 있음.
**구현**: 각 STEP의 `result.success` 분기 직후 `recordTradeMemory()` 호출 추가.

### ★★★ 1-2. 엔진 오류 Telegram 즉시 알림
**위치**: `src/lib/engine/notify.ts`, `src/app/api/engine/route.ts`
**현황**: 엔진 최상단 catch 블록이 `logEngineRun` 기록만 하고 알림 없음.
**구현**: `sendEngineErrorAlert(msg, durationMs)` 함수 추가 후 catch 블록에서 호출.

### ★★ 1-3. KIS 토큰 재발급 재시도 (자가 복구)
**위치**: `src/app/api/engine/route.ts`의 `issueKisToken()`
**현황**: 토큰 발급 1회 실패 시 즉시 500 반환, 해당 크론 실행 전체 스킵.
**구현**: 1회 실패 → 3초 대기 → 재시도. 총 2회 후 실패 시 에러 알림.
**의존**: 1-2 완료 후.

### ★★ 1-4. 엔진 헬스체크 API
**위치**: `src/app/api/engine-log/route.ts` 응답 확장
**현황**: 외부에서 엔진 동작 여부 확인 불가.
**구현**: 마지막 `engine_runs.run_at` 기준 `{ lastRunAt, minutesSinceLastRun, status: "healthy"|"stale"|"error" }` 반환. stale 기준: 장중 120분 이상 미실행.

### ★★ 1-5. ACTION_META 완성 (로그 UI 품질)
**위치**: `src/components/stats/engine-log-section.tsx`
**현황**: 12개 이상의 action type이 raw string으로 표시됨.
**구현**: 누락 type 전체 등록, 중요도별 색상 체계화, 거래/경고/정보 필터 추가.

### ★★ 1-6. steps.ts utils 분리
**위치**: `src/lib/engine/steps.ts` → `src/lib/engine/utils.ts` 신규
**현황**: 512줄. `batchFetch`, `getOpeningBonus` 유틸이 혼재.
**구현**: 두 함수를 `utils.ts`로 이동. steps-scan.ts import 경로 변경.

---

## 단계 2 — 단계 1 완료 후

### ★★★ 2-1. 학습 데이터 적재 검증 UI
**위치**: `src/components/stats/learning-section.tsx`, `/api/learn` GET
**현황**: 1-1 수정 후 trade_memory 실제 누적 여부 검증 필요.
**구현**: `/api/learn` 응답에 `tradeMemoryCount` 추가. UI에 "현재 DB N건 / 학습 최소 10건" 표시.
**의존**: 1-1 완료 후.

### ★★★ 2-2. 백테스트 vs 실전 비교
**위치**: `src/app/api/backtest/route.ts`, `src/components/stats/backtest-section.tsx`
**현황**: 백테스트와 실전 `positions` 데이터 비교 기능 없음.
**구현**: 동일 기간 실전 성과를 `liveComparison` 필드로 반환. UI에 나란히 비교 테이블 추가.

### ★★ 2-3. 전략별 strategyKey 전달
**위치**: `src/lib/engine/steps-scan.ts`
**현황**: STEP 2/3/4 매수 시 `strategyKey` 미전달로 전략별 성과 추적 불가.
**구현**: STEP 2→`"watchlist_pullback"`, STEP 3→`"surge_momentum"`, STEP 4→`"institutional_follow"` 전달. 통계 탭에 전략별 성과 섹션 추가.

### ★★ 2-4. signal-tab.tsx 분리
**위치**: `src/components/signal/`
**현황**: 522줄. 수동 매수 폼 + 승인 대기 목록 혼재.
**구현**: `manual-buy-form.tsx`, `pending-signal-list.tsx` 분리. `signal-tab.tsx` ~80줄 목표.

### ★★ 2-5. strategy-tab.tsx 분리
**위치**: `src/components/strategy/`
**현황**: 623줄. 전략 할당 + 학습 결과 + 최적화 + 장 달력 혼재.
**구현**: `strategy-allocation-section.tsx`, `strategy-calendar-section.tsx` 분리. `strategy-tab.tsx` ~150줄 목표.

---

## 단계 3 — 단계 2 완료 후

### ★★★ 3-1. 홈 탭 엔진 헬스 대시보드
**위치**: `src/components/home/home-tab.tsx`
**현황**: KIS 연결 상태만 표시. 엔진 동작 여부, 오늘 거래 현황 없음.
**구현**: "오늘 거래 N건 / 실현 손익 / 마지막 엔진 N분 전" 그리드 추가. stale 시 배너 색상 변경.
**의존**: 1-4 완료 후.

### ★★★ 3-2. 포트폴리오 자산 추이 차트
**위치**: `src/components/portfolio/`, `src/components/ui/equity-curve.tsx` 신규
**현황**: `portfolio_snapshots` 테이블 데이터가 있으나 시각화 없음.
**구현**: Canvas 2D로 30일 자산 추이 선 차트. MDD 표시선. `usePortfolio()` 훅 추출.

### ★★ 3-3. ATR 학습 정확도 개선 (DB migration 포함)
**위치**: `src/lib/engine/db.ts`, `src/lib/learning-engine.ts`
**현황**: ATR 배수를 PnL%에서 역산 (근사치). 실제 stop/profit 가격 미기록.
**구현**: `trade_memory`에 `stop_price`, `profit_price` 컬럼 추가 (migration). 직접 배수 역산으로 개선.
**의존**: 1-1 완료 후 + Supabase migration 실행.

### ★★ 3-4. 컴포넌트 직접 fetch → 훅 추출
**위치**: `src/hooks/`
**현황**: 17건의 컴포넌트 직접 fetch. 중복 에러 핸들링.
**구현**: `useEngineLog()`, `usePortfolio()`, `useLearning()` 훅 신규. 기존 패턴 통일.
**의존**: 2-4, 2-5 분리 완료 후.

---

## 단계 4 — 데이터 누적 후 (v7.0 마무리)

### ★ 4-1. 학습 주기 다변화
**위치**: `/api/learn`, `src/middleware.ts`, `src/components/strategy/`
**구현**: 세션 인증으로 수동 학습 실행 가능하도록 POST 경로 개방. 학습 임계값 `app_config`로 조정 가능.
**의존**: 2-1 데이터 누적 확인 후.

### ★ 4-2. Telegram 알림 품질 개선
**위치**: `src/lib/engine/notify.ts`
**구현**: 전략 출처, 레짐 정보를 알림 메시지에 추가. 일일 리포트에 전략별 손익 섹션.
**의존**: 2-3 strategyKey 데이터 누적 후.

---

## 버전 계획

| 버전 | 포함 내용 |
|------|----------|
| v6.6.0 | 단계 1 완료 (학습 루프 수복 + 엔진 오류 알림 + 코드 정리) |
| v6.7.0 | 단계 2 완료 (헬스체크 + 전략 추적 + UI 분리) |
| v6.8.0 | 단계 3 완료 (백테스트 비교 + 포트폴리오 차트 + 훅 리팩터) |
| v7.0.0 | 단계 4 완료 (학습 고도화 + 알림 품질 + ATR 개선 완결) |
