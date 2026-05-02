# NEXIO Wiki — 인덱스

> **프로젝트**: NEXIO (AI 자동매매 시스템)
> **버전**: v7.1 신뢰 시스템 (보안 강화 + 자가복구 + 환경변수 검증 + E2E 테스트 계획 반영)
> **컴파일 날짜**: 2026-05-02 (2차 갱신)
> **소스 파일**: 76개 스캔
> **배포**: https://nexio.vercel.app

---

## 토픽 목록

| 토픽 | 파일 | 설명 | Coverage |
|------|------|------|----------|
| 플랫폼 개요 | [platform-overview.md](topics/platform-overview.md) | NEXIO 전체 기술 스택, 기능 영역, 식별 정보 | high |
| 자동매매 엔진 | [trading-engine.md](topics/trading-engine.md) | GitHub Actions 4회/일 크론, lib/engine/* 모듈, STEP 0~3 상세 흐름 | high |
| 신호 시스템 | [signal-system.md](topics/signal-system.md) | 10종 지표(+StochRSI/OBV/이격도), 레짐, 보정 3종, pending_signals 승인 흐름, DART/종목 필터 | high |
| 적응형 학습 엔진 | [adaptive-engine.md](topics/adaptive-engine.md) | learning.ts/learning-engine.ts 분리 구조, 신뢰도 체계, 학습 함수 | high |
| 주문 관리 | [order-management.md](topics/order-management.md) | limitBuyOrder 지정가, 호가단위, DB credential 보안, batchFetch N+1 | high |
| 데이터베이스 | [database.md](topics/database.md) | 8개 테이블 전체 스키마, 싱글턴 클라이언트, DB helper 함수 | high |
| 배포 구성 | [deployment.md](topics/deployment.md) | GitHub Actions 엔진 크론, Vercel observer만 잔존, CRON_SECRET 인증 | high |

---

## 빠른 참조

### 핵심 파일 위치

```
src/
├── app/api/
│   ├── engine/route.ts          — 자동매매 엔진 (GitHub Actions 4회/일)
│   ├── observer/route.ts        — 시장 감시 + 학습 트리거 (Vercel Cron, 월요일)
│   ├── learn/route.ts           — 학습 API (GET/POST)
│   ├── kis/order/route.ts       — 즉시매수 (DB에서 credentials 조회)
│   ├── pending-signals/route.ts — 신호 승인/거절 API
│   ├── watchlist/route.ts       — 관심종목 관리
│   ├── stats/stocks/route.ts    — 종목별 성과 API
│   └── positions/               — 포지션 조회
├── lib/
│   ├── engine/
│   │   ├── types.ts             — EngineConfig, EngineAction, StepContext, MarketTrend 등
│   │   ├── steps.ts             — STEP 0/1/1.5 (356줄)
│   │   ├── steps-scan.ts        — STEP 2/3 관심종목+급등주 스캔 (295줄)
│   │   ├── notify.ts            — 텔레그램 알림 (sendTradeAlert, sendDailyReport)
│   │   ├── db.ts                — DB helper (openPosition, closePosition 등)
│   │   ├── kis.ts               — KIS API 호출 (limitBuyOrder, cancelOpenBuyOrders 등)
│   │   ├── filters.ts           — 종목 필터 (DART, 시가총액, 상장일)
│   │   ├── market.ts            — getMarketTrend, getInvestorTrend, scanSurgeStocks
│   │   ├── constants.ts         — 엔진 상수 (END_OF_DAY_TIME, 투자자 보정값 등) [v7.1 신규]
│   │   ├── intraday.ts          — VWAP/POC 장중 지표 calcVWAP/calcPOC/calcIntradayBonus [v7.1 신규]
│   │   ├── strategies.ts        — 전략 배분 비율 (watchlist 40%, surge 25%, institutional 35%) [v7.1 신규]
│   │   ├── market-calendar.ts   — KST 시간 파싱, 공휴일/장중 판단 [v7.1 신규]
│   │   ├── utils.ts             — batchFetch, getOpeningBonus [v7.1 분리]
│   │   └── retry.ts             — 지수 백오프 재시도 래퍼 withRetry<T>() [v7.1 신규]
│   ├── config-validator.ts      — 필수 환경변수 검증 validateRequiredEnv() [v7.1 신규]
│   ├── learning.ts              — 학습 공개 API (runLearning, loadLatestLearning, applyLearning)
│   ├── learning-engine.ts       — 학습 내부 구현 (learnWeights, learnAtrMultipliers 등)
│   ├── supabase/api-client.ts   — 싱글턴 Supabase 클라이언트
│   ├── kis/indicators.ts        — 기술 지표(10종) + ATR + 포지션 사이징
│   ├── kis/indicators-calc.ts   — 순수 계산 함수 분리 (StochRSI, OBV, Disparity 포함)
│   └── store.ts                 — Zustand 상태 관리
├── hooks/
│   ├── usePendingSignals.ts     — 신호 승인 훅
│   ├── useWatchlist.ts          — 관심종목 훅
│   ├── useStats.ts              — 통계 데이터 훅
│   ├── useStockSearch.ts        — 종목 검색 (debounce 300ms) [v6.1 계획]
│   ├── useThresholdsOptimize.ts — 임계치 최적화 [v6.1 계획]
│   ├── usePositions.ts          — 포지션 조회 [v6.1 계획]
│   ├── usePortfolioSnapshot.ts  — 스냅샷 조회 [v6.1 계획]
│   └── useNews.ts               — 뉴스 피드 [v6.1 계획]
└── components/
    ├── signal/                  — 신호 탭 UI (관심종목 탭 제거 예정 → StrategyTab 이동)
    ├── stats/                   — 통계 탭 UI (learning-section 포함)
    ├── portfolio/               — 포트폴리오 UI
    └── settings/                — 설정 UI
```

### 핵심 DB 테이블

| 테이블 | 역할 |
|--------|------|
| positions | 매매 포지션 이력 |
| trade_memory | 경험 데이터 (22컬럼, 학습 원자료) |
| learning_snapshots | 학습 결과 영속화 (7일 유효) |
| pending_signals | 약한 신호 승인 대기 |
| watchlist | 관심종목 목록 |
| kis_config | KIS API 자격증명 (서버 전용) |
| engine_runs | 엔진 실행 로그 |
| market_snapshots | 장 초반 09:00 스냅샷 |
| app_config | 엔진 제어 동적 설정 (engine_enabled, max_positions) |
| pending_orders | 미체결 지정가 주문 추적 (체결 확인 루프용) |
| portfolio_snapshots | 일별 포트폴리오 평가금액 (MDD/수익률 계산용) |

### 주요 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/engine` | GET | 자동매매 엔진 (CRON_SECRET 필수) |
| `/api/observer` | GET | 시장 감시 + 월요일 학습 (Vercel Cron) |
| `/api/learn` | GET | 학습 이력 조회 (?history=N) |
| `/api/learn` | POST | 학습 실행 (CRON_SECRET 인증) |
| `/api/pending-signals` | GET/POST/PATCH | 신호 조회/승인/상태변경 |
| `/api/kis/order` | POST | 즉시매수 (stockCode, side, quantity만) |
| `/api/watchlist` | GET/POST/DELETE | 관심종목 CRUD |
| `/api/stats/stocks` | GET | 종목별 성과 + 적합도 |
| `/api/engine-control` | GET | engine_enabled, max_positions 조회 |
| `/api/engine-control` | POST | 비상 정지 / 최대 포지션 수 변경 (인증 미설정 — 수정 예정) |
| `/api/daily-report` | GET | 일일 매매 결과 텔레그램 발송 (CRON_SECRET 필수) |
| `/api/positions` | GET | 현재 포지션 조회 |
| `/api/kis/health` | GET | KIS 연결 상태 Health Check (세션 인증, 60초 폴링용) |
| `/api/stock-search` | GET | 종목명/코드 검색 (?q=) |
| `/api/optimize-thresholds` | GET | 신호 임계치 자동 최적화 계산 |
| `/api/news` | GET | 주요 경제/시장 뉴스 피드 |
| `/api/kis/balance` | POST | KIS 잔고 조회 — v7.1 GET→POST 전환 (appSecret body 전달) |
| `/api/kis/price` | POST | KIS 현재가 조회 — v7.1 GET→POST 전환 (appSecret body 전달) |

### GitHub Actions 크론 스케줄

| KST | UTC cron | 역할 |
|-----|----------|------|
| 09:30 | `30 0 * * 1-5` | 장 시작 엔진 실행 |
| 11:00 | `0 2 * * 1-5` | 오전 중반 |
| 13:00 | `0 4 * * 1-5` | 오후 시작 |
| 14:30 | `30 5 * * 1-5` | 장 마감 전 |
| 15:30 | `30 6 * * 1-5` | 일일 리포트 (HOUR 조건 분기) |

---

## 컨셉 목록

| 컨셉 | 파일 | 설명 |
|------|------|------|
| 점진적 파일 분리 | [progressive-file-split.md](concepts/progressive-file-split.md) | 파일이 500줄 한계에 근접하면 역할 단위로 분리하는 반복 패턴 — trading-engine에서 4회 발생 |

---

## 버전 이력 요약

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v7.1 | 2026-05-02 | 신뢰 시스템 완성 계획 반영 — balance/price POST 전환(보안), 엔진 자가복구(중복방지/고립정리/지수백오프), 환경변수 자동 감지, E2E 테스트 설계 |
| v6.5.1 | 2026-05-02 | v6.1 운영 안정성 계획 반영 (KIS Health Check, notify.ts 알림 강화, 컴포넌트 훅 추출 설계, 운영 런북/리스크 문서 추가) |
| v5.2.1 | 2026-04-20 | Phase 2: 10종 지표(StochRSI/OBV/이격도), 2단계 익절, 시장급락 차단, 체결확인 루프, 콜드스타트 수정, portfolio_snapshots/pending_orders 테이블 |
| v5.14.0 | 2026-04-17 | steps.ts 분리, notify.ts(텔레그램), engine-control API, daily-report API, app_config 테이블 |
| v5.9.x | 2026-04-17 | lib/engine/* 모듈 분리, batchFetch N+1 해소, KIS 자격증명 보안, GitHub Actions 크론 |
| v5.9.0 | 2026-04-11 | 적응형 학습 엔진 전체 (P1~P6) |

## Recent Changes
- 2026-05-02: 6개 토픽 업데이트 + 컨셉 1개 신규 — v7.1 유틸리티 모듈(constants.ts, intraday.ts, strategies.ts, market-calendar.ts, utils.ts, retry.ts), nexio.analysis.md(GAP 분석), sector-limit.design.md(섹터 분산), signal-thresholds.plan.md(동적 임계값), plan-v6.md(v6.0 로드맵) 반영; 컨셉: progressive-file-split
- 2026-05-02: 6개 토픽 업데이트 — v7.1 nexio.plan.md + nexio.design.md 반영 (balance/price POST 전환, 엔진 자가복구, 환경변수 자동 감지, E2E 테스트, config-validator.ts/retry.ts 신규 모듈, engine_lock 설계, cleanupStalePendingOrders, ConfigValidationResult/RetryOptions 타입 추가)
- 2026-05-02: 5개 토픽 업데이트 — v6.1 nexio.plan.md + nexio.design.md 반영 (KIS Health Check API, notify.ts 신규 함수 2종, KISHealthStatus/KISApiErrorContext 타입, SignalTab 구조 변경, 훅 추출 계획, silent catch 목록, 운영 런북/리스크 문서화)
- 2026-04-20: 5개 토픽 업데이트 — 10종 지표(+StochRSI/OBV/이격도), 2단계 익절, 시장급락 차단, 체결확인 루프, 콜드스타트 블렌딩, pending_orders/portfolio_snapshots 테이블 신규
- 2026-04-17: 3개 토픽 업데이트 — steps.ts/notify.ts 신규, engine-control/daily-report API, app_config 테이블
- 2026-04-17: 6개 토픽 전면 재컴파일 — lib/engine 모듈화, GitHub Actions 크론, 보안/성능 개선 반영
