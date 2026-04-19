# NEXIO Wiki — 인덱스

> **프로젝트**: NEXIO (AI 자동매매 시스템)  
> **버전**: v5.14.0  
> **컴파일 날짜**: 2026-04-17  
> **배포**: https://nexio.vercel.app

---

## 토픽 목록

| 토픽 | 파일 | 설명 | Coverage |
|------|------|------|----------|
| 플랫폼 개요 | [platform-overview.md](topics/platform-overview.md) | NEXIO 전체 기술 스택, 기능 영역, 식별 정보 | high |
| 자동매매 엔진 | [trading-engine.md](topics/trading-engine.md) | GitHub Actions 4회/일 크론, lib/engine/* 모듈, STEP 0~3 상세 흐름 | high |
| 신호 시스템 | [signal-system.md](topics/signal-system.md) | 7종 지표, 레짐, 보정 3종, pending_signals 승인 흐름, DART/종목 필터 | high |
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
│   │   ├── steps.ts             — STEP 0~3 실행 로직, batchFetch (466줄)
│   │   ├── notify.ts            — 텔레그램 알림 (sendTradeAlert, sendDailyReport)
│   │   ├── db.ts                — DB helper (openPosition, closePosition 등)
│   │   ├── kis.ts               — KIS API 호출 (limitBuyOrder, cancelOpenBuyOrders 등)
│   │   ├── filters.ts           — 종목 필터 (DART, 시가총액, 상장일)
│   │   └── market.ts            — getMarketTrend, getInvestorTrend, scanSurgeStocks
│   ├── learning.ts              — 학습 공개 API (runLearning, loadLatestLearning, applyLearning)
│   ├── learning-engine.ts       — 학습 내부 구현 (learnWeights, learnAtrMultipliers 등)
│   ├── supabase/api-client.ts   — 싱글턴 Supabase 클라이언트
│   ├── kis/indicators.ts        — 기술 지표 + ATR + 포지션 사이징
│   └── store.ts                 — Zustand 상태 관리
├── hooks/
│   ├── usePendingSignals.ts     — 신호 승인 훅
│   ├── useWatchlist.ts          — 관심종목 훅
│   └── useStats.ts              — 통계 데이터 훅
└── components/
    ├── signal/                  — 신호 탭 UI
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

### GitHub Actions 크론 스케줄

| KST | UTC cron | 역할 |
|-----|----------|------|
| 09:30 | `30 0 * * 1-5` | 장 시작 엔진 실행 |
| 11:00 | `0 2 * * 1-5` | 오전 중반 |
| 13:00 | `0 4 * * 1-5` | 오후 시작 |
| 14:30 | `30 5 * * 1-5` | 장 마감 전 |
| 15:30 | `30 6 * * 1-5` | 일일 리포트 (HOUR 조건 분기) |

---

## 버전 이력 요약

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v5.14.0 | 2026-04-17 | steps.ts 분리, notify.ts(텔레그램), engine-control API, daily-report API, app_config 테이블 |
| v5.9.x | 2026-04-17 | lib/engine/* 모듈 분리, batchFetch N+1 해소, KIS 자격증명 보안, GitHub Actions 크론 |
| v5.9.0 | 2026-04-11 | 적응형 학습 엔진 전체 (P1~P6) |
| v5.2.1 | (이전) | watchlist/신호승인/주문에러처리 |

## Recent Changes
- 2026-04-17: 3개 토픽 업데이트 — steps.ts/notify.ts 신규, engine-control/daily-report API, app_config 테이블, v5.14.0 갱신
- 2026-04-17: 6개 토픽 전면 재컴파일 — lib/engine 모듈화, GitHub Actions 크론, 보안/성능 개선 반영
