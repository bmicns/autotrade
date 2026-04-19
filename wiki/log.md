# Wiki Compile Log

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
