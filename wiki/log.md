# Wiki Compile Log

## 2026-05-02 — v7.1 GAP 분석 + 신규 훅/설정 페이지 반영 (3차 갱신)

**업데이트된 토픽**: trading-engine, platform-overview, deployment
**변경 없는 토픽**: signal-system, database, adaptive-engine, order-management

### 변경 내역
- `docs/03-analysis/nexio.analysis.md` — v7.1 GAP 분석 갱신 (97% 일치, GAP-02/03 발견)
- `src/hooks/useKISBalance.ts` — 신규 (POST 방식 잔고 조회 훅)
- `src/hooks/useKISPrice.ts` — 신규 (POST 방식 현재가 조회 훅)
- `src/app/settings/page.tsx` — 신규 (/settings 전용 라우트, TC-03 E2E 대응)
- `tests/global.setup.ts` — 신규 (Playwright 인증 셋업)
- `platform-overview.md` — 신규 훅 섹션 + /settings 페이지 추가
- `trading-engine.md` — GAP 분석 참조 v6.1→v7.1 업데이트
- `deployment.md` — global.setup.ts 파일 구조 추가

---

## 2026-05-02 — v7.1 유틸리티 모듈 + 신규 설계 문서 반영 (2차 갱신)

- 업데이트된 토픽: 6개 (trading-engine, signal-system, database, platform-overview, order-management, deployment)
- 변경 없는 토픽: 1개 (adaptive-engine)
- 신규 컨셉: 1개 (progressive-file-split)
- schema.md 업데이트: Wiki 구조 메타데이터 섹션 추가 (토픽 테이블, 컨셉 테이블, 진화 로그)
- INDEX.md 업데이트: 파일 구조에 신규 유틸리티 모듈 6개 반영, 컨셉 목록 섹션 신규, Recent Changes 갱신
- CONTEXT.md: 다음 작업 항목 업데이트 (v6.2 섹터 분산, v5.2.1 동적 임계값 추가)

### 변경된 소스 파일 (이번 컴파일 트리거)
- `docs/01-plan/features/nexio.plan.md` — v7.1 신뢰 시스템 업데이트 (기존 파일 수정)
- `docs/02-design/features/nexio.design.md` — v7.1 설계서 업데이트 (기존 파일 수정)
- `docs/03-analysis/nexio.analysis.md` — v6.1 GAP 분석 신규 (91% 구현 일치, G1/G2 발견)
- `docs/01-plan/features/signal-thresholds.plan.md` — 동적 신호 임계값 설정 계획 신규
- `docs/02-design/features/sector-limit.design.md` — 섹터 분산 제한 설계 신규
- `docs/plan-v6.md` — v6.0 미구현 기능 순차 구현 계획 신규

### 신규 소스 파일 (이번 컴파일에서 처음 반영)
- `src/lib/engine/constants.ts` — 엔진 상수 중앙화 (END_OF_DAY_TIME, 투자자/장초 보정값 등)
- `src/lib/engine/intraday.ts` — VWAP/POC 장중 지표 (calcVWAP, calcPOC, calcIntradayBonus)
- `src/lib/engine/strategies.ts` — 전략 배분 비율 (watchlist 40%, surge 25%, institutional 35%)
- `src/lib/engine/market-calendar.ts` — KST 시간 파싱, 공휴일/장중 판단 (getKstNowParts, getEngineSkipReason)
- `src/lib/engine/utils.ts` — batchFetch, getOpeningBonus (steps.ts에서 분리)
- `src/lib/config-validator.ts` — validateRequiredEnv() (이전 컴파일에서 누락, 이번에 반영)

### 주요 변경 반영 내용
- **trading-engine 전면 재작성** — 유틸리티 모듈 6개 상세 문서화, VWAP/POC 미통합 현황, 전략 배분 비율, market-calendar 판단 로직, GAP 분석 결과(G1/G2) → trading-engine
- **signal-system** — 신호 임계값 동적 설정 계획 (v5.2.1) 섹션 추가, PATCH /api/app-config, 격자 탐색 625조합 → signal-system
- **database** — positions.sector 컬럼 추가 (v6.2 마이그레이션), app_config 신규 키 8종 (max_per_sector, rsi_buy/sell, strong/weak_score, market_holidays, morning_start/end) → database
- **platform-overview** — v6.0 로드맵 테이블(9기능), v6.2 섹터 분산 설계 요약, v5.2.1 신호 임계값 설계 요약 추가 → platform-overview
- **order-management** — v6.2 섹터 필터 섹션 (getSectorCounts, applySectorFilter, N+1 방지 캐싱) → order-management
- **deployment** — plan-v6.md Sources 추가 → deployment
- **컨셉 신규: progressive-file-split** — 4회 분리 인스턴스 문서화 (route.ts→steps.ts→steps-scan.ts→유틸 모듈)

---

## 2026-05-02 — v7.1 신뢰 시스템 완성 계획 반영

- 업데이트된 토픽: 6개 (platform-overview, trading-engine, signal-system, order-management, deployment, database)
- 변경 없는 토픽: 1개 (adaptive-engine)
- schema.md 업데이트: ConfigValidationResult, RetryOptions 신규 타입 추가
- INDEX.md 업데이트: 버전 v7.1, 신규 파일 구조(config-validator.ts, retry.ts), API 테이블(balance/price POST), 버전 이력
- CONTEXT.md 업데이트: 현재 상태, 엔진 실행 구조(진입부 안전장치 4개), 주요 파일, 다음 작업(P0~P2), 금지사항, Gotchas, 아키텍처 결정 갱신

### 변경된 소스 파일 (이번 컴파일 트리거)
- `docs/01-plan/features/nexio.plan.md` — v6.1 → v7.1 신뢰 시스템 완성 계획으로 전면 교체
- `docs/02-design/features/nexio.design.md` — v7.1 설계서 (신규 타입, 파일 분리 계획, API 스펙, 구현 순서, E2E 테스트)

### 주요 변경 반영 내용
- **balance/price API POST 전환 (P0)** — appSecret URL 노출 취약점 제거, GET→POST 전환 스펙 → order-management, trading-engine
- **환경변수 누락 자동 감지 (P0)** — config-validator.ts 신규, validateRequiredEnv(), REQUIRED/WARN 그룹 분리 → trading-engine, deployment
- **엔진 자가복구 (P1)** — engine_lock 5분 TTL 락(app_config 재활용), cleanupStalePendingOrders(), withRetry 지수 백오프 → trading-engine, database, deployment
- **신규 타입 2종** (ConfigValidationResult, RetryOptions) → schema.md
- **신규 모듈 2종** (src/lib/config-validator.ts, src/lib/engine/retry.ts) → trading-engine
- **Playwright E2E 테스트 (P2)** — tests/core.spec.ts, TC-01~03, 환경 분리 원칙 → deployment
- **app_config engine_lock 키** — 스키마 마이그레이션 없이 기존 key-value 패턴 활용 → database
- **Silent Catch 목록 업데이트** — POST /api/kis/balance 알림 추가, 기존 GET 항목 제거 → order-management

---

## 2026-05-02 — v6.1 운영 안정성 + 로드맵 반영

- 업데이트된 토픽: 5개 (platform-overview, trading-engine, signal-system, order-management, deployment)
- 변경 없는 토픽: 2개 (adaptive-engine, database)
- schema.md 업데이트: KISHealthStatus, KISApiErrorContext 신규 타입 추가
- INDEX.md 업데이트: 버전 v6.5.1, 신규 API 엔드포인트 4종, 파일 구조(hooks) 업데이트
- CONTEXT.md 업데이트: 현재 상태, 다음 작업 항목, 금지사항 갱신

### 신규 소스 파일 (이번 컴파일에서 처음 반영)
- `docs/01-plan/features/nexio.plan.md` — v6.1 운영 안정성 계획
- `docs/02-design/features/nexio.design.md` — v6.1 설계서 (API 스펙, 컴포넌트 구조 변경)
- `docs/operations/engine-runbook.md` — 엔진 운영 점검 절차
- `docs/operations/runtime-risks.md` — 런타임 리스크 목록
- `docs/project-plan.md` — v6.5.1→v7.0 로드맵

### 주요 변경 반영 내용
- **KIS Health Check API (`/api/kis/health`)** — 60초 폴링, 연결 상태 변화 시 Telegram 알림 → deployment, trading-engine
- **notify.ts 신규 함수 2종** (`sendKISApiErrorAlert`, `sendKISConnectionAlert`) → trading-engine
- **신규 타입 2종** (`KISHealthStatus`, `KISApiErrorContext`) → trading-engine, schema.md
- **store.ts 폴링 상태** (`kisHealthLastChecked`, `kisLatencyMs`, `startHealthPolling`) → deployment
- **Silent Catch 목록** (token/balance API route 수정 예정) → order-management
- **SignalTab 구조 변경 계획** (관심종목 탭 제거 → StrategyTab 이동) → signal-system
- **신규 훅 5종 계획** (`useStockSearch`, `useThresholdsOptimize`, `usePositions`, `usePortfolioSnapshot`, `useNews`) → signal-system
- **운영 런북/리스크** — 이상 징후 대응, 런타임 리스크 6종 → deployment
- **플랫폼 버전** v5.9.0 → v6.5.1, 기능 목록 9개로 확장 → platform-overview
- **로드맵 요약** (v6.5.1→v7.0 단계별 우선순위) → platform-overview

---

## 2026-04-17 — v5.14.0 기능 추가 반영 (세션 2)

- 업데이트된 토픽: 3개 (trading-engine, deployment, database)
- 변경 없는 토픽: 4개

### 주요 변경 반영 내용
- **steps.ts 신규** (466줄, route.ts에서 STEP 0~3 분리) → trading-engine
- **notify.ts 신규** (sendTradeAlert, sendDailyReport, 텔레그램 알림) → trading-engine
- **app_config 테이블 신규** (engine_enabled, max_positions) → database
- **engine-control API** (비상 정지 + 최대 포지션 수 제어) → deployment
- **daily-report API + GitHub Actions 15:30 cron** → deployment
- **sendTradeAlert 연동** (Step1/1.5/2/3 모든 체결 시점) → trading-engine
- **StepContext.maxPositions** (app_config에서 동적 로딩) → trading-engine

---

## 2026-04-17 — 코드베이스 구조 변경 반영 재컴파일

- 컴파일 시각: 2026-04-17T00:00:00Z
- 업데이트된 토픽: 6개 (trading-engine, deployment, order-management, adaptive-engine, signal-system, database)
- 변경 없는 토픽: 1개 (platform-overview)

### 주요 변경 반영 내용
- **lib/engine/* 모듈 분리** (db.ts, filters.ts, kis.ts, market.ts, types.ts) → trading-engine, order-management, signal-system
- **GitHub Actions 엔진 크론** (.github/workflows/engine-cron.yml, 4회/일) → deployment, trading-engine
- **KIS 자격증명 보안 개선** (/api/kis/order DB 조회로 변경) → order-management, database
- **batchFetch N+1 해소** (STEP 2/3 배치 병렬화) → trading-engine, order-management
- **learning.ts → learning.ts + learning-engine.ts 분리** → adaptive-engine
- **신규 DB 테이블 5종 문서화** (pending_signals, watchlist, kis_config, engine_runs, market_snapshots) → database
- **신규 hooks 3종** (usePendingSignals, useWatchlist, useStats) → signal-system
- **supabase/api-client.ts 싱글턴** → database

---

## 2026-04-12 — 초기 컴파일

- 컴파일 시각: 2026-04-12T00:00:00Z
- 읽은 지식 파일: 8개
- 생성된 토픽: 7개
- 상태: 완료

### 처리된 소스
- README.md
- CLAUDE.md (→ AGENTS.md 참조)
- AGENTS.md
- package.json
- docs/01-plan/features/adaptive-engine.plan.md
- docs/02-design/features/adaptive-engine.design.md
- docs/03-analysis/adaptive-engine.analysis.md
- docs/04-report/features/adaptive-engine.report.md

### 생성된 아티클
- wiki/topics/platform-overview.md
- wiki/topics/trading-engine.md
- wiki/topics/signal-system.md
- wiki/topics/adaptive-engine.md
- wiki/topics/order-management.md
- wiki/topics/database.md
- wiki/topics/deployment.md
- wiki/INDEX.md
- wiki/schema.md
- wiki/CONTEXT.md
