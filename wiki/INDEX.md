# NEXIO Wiki — 인덱스

> **프로젝트**: NEXIO (AI 자동매매 시스템)  
> **버전**: v5.9.0  
> **컴파일 날짜**: 2026-04-12  
> **배포**: https://nexio.vercel.app

---

## 토픽 목록

| 토픽 | 파일 | 설명 | Coverage |
|------|------|------|----------|
| 플랫폼 개요 | [platform-overview.md](topics/platform-overview.md) | NEXIO 전체 기술 스택, 기능 영역, 식별 정보 | high |
| 자동매매 엔진 | [trading-engine.md](topics/trading-engine.md) | Cron 기반 엔진 실행 흐름, ATR 통합, 포지션 사이징 | high |
| 신호 시스템 | [signal-system.md](topics/signal-system.md) | 7종 기술 지표, 레짐 분류, A/B 점수 계산 | medium |
| 적응형 학습 엔진 | [adaptive-engine.md](topics/adaptive-engine.md) | 자가학습 피드백 루프, 학습 함수, 신뢰도 체계 | high |
| 주문 관리 | [order-management.md](topics/order-management.md) | KIS API, 청산 조건, 청산 가격 계산 | medium |
| 데이터베이스 | [database.md](topics/database.md) | trade_memory, learning_snapshots 스키마 | high |
| 배포 구성 | [deployment.md](topics/deployment.md) | Vercel Hobby, Cron 슬롯, 학습 Cron 병합 결정 | medium |

---

## 빠른 참조

### 핵심 파일 위치

```
src/
├── app/api/
│   ├── engine/route.ts          — 자동매매 엔진 (Cron 4회/일)
│   ├── observer/route.ts        — 시장 감시 + 학습 트리거 (월요일)
│   ├── learn/route.ts           — 학습 API (GET/POST)
│   ├── stats/stocks/route.ts    — 종목별 성과 API
│   ├── backtest/                — 백테스트
│   ├── manual-buy/              — 수동 매수
│   ├── positions/               — 포지션 조회
│   └── watchlist/               — 관심종목 관리
├── lib/
│   ├── learning.ts              — 학습 핵심 로직
│   ├── analytics.ts             — 성과 분석
│   ├── backtest.ts              — 백테스트 로직
│   ├── constants.ts             — 상수 정의
│   ├── store.ts                 — Zustand 상태 관리
│   └── kis/
│       ├── api.ts               — KIS API 호출
│       ├── client.ts            — KIS 클라이언트
│       └── indicators.ts        — 기술 지표 + ATR + 포지션 사이징
└── components/
    ├── stats/
    │   ├── stats-tab.tsx        — 통계 탭 메인
    │   ├── learning-section.tsx — 학습 현황 대시보드
    │   ├── stock-stats-section.tsx — 종목별 성과
    │   └── backtest-section.tsx
    ├── signal/                  — 신호 UI
    ├── portfolio/               — 포트폴리오 UI
    └── settings/                — 설정 UI
```

### 핵심 DB 테이블

| 테이블 | 역할 |
|--------|------|
| positions | 매매 포지션 이력 (기존) |
| trade_memory | 경험 데이터 수집 (v5.9.0, 22컬럼) |
| learning_snapshots | 학습 결과 영속화 (v5.9.0, 18컬럼) |

### 주요 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/engine` | GET | 자동매매 엔진 실행 (Cron) |
| `/api/observer` | GET | 시장 감시 + 월요일 학습 (Cron) |
| `/api/learn` | GET | 학습 이력 조회 (?history=N) |
| `/api/learn` | POST | 학습 실행 (CRON_SECRET 인증) |
| `/api/stats/stocks` | GET | 종목별 성과 + 적합도 |
| `/api/positions` | GET | 현재 포지션 조회 |
| `/api/watchlist` | GET/POST | 관심종목 관리 |
| `/api/manual-buy` | POST | 수동 매수 |
| `/api/backtest` | POST | 백테스트 실행 |

---

## 버전 이력 요약

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v5.9.0 | 2026-04-11 | 적응형 학습 엔진 전체 (P1~P6) |
| v5.2.1 | (이전) | watchlist/신호승인/주문에러처리 + Cron 4회 |
