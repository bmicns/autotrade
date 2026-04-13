# adaptive-engine — GAP 분석 결과

> 분석일: 2026-04-11
> 설계서: `docs/02-design/features/adaptive-engine.design.md`
> 분석 도구: bkit:gap-detector

---

## 최종 판정

| 항목 | 값 |
|------|-----|
| **전체 Match Rate** | **97%** |
| 누락 기능 | 1건 (ABCompareCard — UI only, 낮음) |
| 변경 사항 | 2건 (학습 요일, ranging 탭 — 모두 낮음) |
| 추가 기능 | 1건 (winRate/avgWin/avgLoss — 합리적 확장) |
| **판정** | **PASS (>= 90%)** |

---

## 섹션별 점수

| 카테고리 | 점수 | 상태 |
|----------|:----:|:----:|
| P1 ATR × 학습 통합 | 100% | PASS |
| P2 포지션 사이징 동적화 | 100% | PASS |
| P3 경험 데이터 수집 + 학습 영속화 | 100% | PASS |
| P4 학습 전용 Cron + API | 100% | PASS |
| P5 종목 적합성 스코어링 | 100% | PASS |
| P6 학습 현황 대시보드 | 93% | PASS |
| stats-tab.tsx 변경 | 100% | PASS |
| 신뢰도 등급별 적용 범위 | 100% | PASS |

---

## 섹션별 상세 비교

### P1 — ATR × 학습 통합 (100%)

| 설계 요구사항 | 구현 여부 | 위치 |
|--------------|:--------:|------|
| `AtrMultipliers` 인터페이스 (stop/profit/trailing) | ✅ | `indicators.ts` |
| `DEFAULT_ATR_MULTIPLIERS` (2.0/3.0/1.5) | ✅ | `indicators.ts` |
| `calcDynamicRisk()` multipliers 파라미터 + 기본값 | ✅ | `indicators.ts` |
| 하한 가드: stopLoss ≤ -2, takeProfit ≥ 3, trailingStop ≤ -1.5 | ✅ | `indicators.ts` |
| STEP 1 루프 내 `const` 독립 계산 (스코프 버그 해소) | ✅ | `engine/route.ts` |
| `learnAtrMultipliers()` — 중앙값 기반, 0 나누기 방지 | ✅ | `learning.ts` |

### P2 — 포지션 사이징 동적화 (100%)

| 설계 요구사항 | 구현 여부 | 위치 |
|--------------|:--------:|------|
| `calcPositionSize()` 핵심 공식 (targetRiskAmount / stopRatio) | ✅ | `indicators.ts` |
| 최소 1주 금액 보장 (`Math.max(capped, currentPrice)`) | ✅ | `indicators.ts` |
| 상한선 적용 (`Math.min(calculated, maxPerTrade)`) | ✅ | `indicators.ts` |
| `learnPositionSizing()` — 손절 건 평균 손실 역산 | ✅ | `learning.ts` |
| 엔진 내 `calcPositionSize()` 적용 | ✅ | `engine/route.ts` |

### P3 — 경험 데이터 수집 + 학습 영속화 (100%)

| 설계 요구사항 | 구현 여부 | 위치 |
|--------------|:--------:|------|
| `trade_memory` 테이블 (컬럼 22개 전체) | ✅ | migration SQL |
| `learning_snapshots` 테이블 (컬럼 18개 전체) | ✅ | migration SQL |
| 백필 SQL (positions → trade_memory) | ✅ | migration SQL (주석, 수동 실행) |
| `extractCandlePattern()` 헬퍼 | ✅ | `engine/route.ts` |
| `recordTradeMemory()` — 7종 지표 + 보너스 + A/B 점수 저장 | ✅ | `engine/route.ts` |
| `closeTradeMemory()` — closed_at IS NULL 조건 UPDATE | ✅ | `engine/route.ts` |
| A/B base_score 병렬 계산 (캔들 재사용) | ✅ | `engine/route.ts` |
| `calcConfidence()` (none/low/medium/high, 임계값 10/30/50) | ✅ | `learning.ts` |
| `saveLearning()` (UPDATE → INSERT 순서, 실패 무시) | ✅ | `learning.ts` |
| `loadLatestLearning()` (만료 폴백 포함) | ✅ | `learning.ts` |
| `runLearning()` (5개 함수 병렬 호출) | ✅ | `learning.ts` |
| `learnRiskParamsTakeProfitRatio()` (승률 기반 분기) | ✅ | `learning.ts` |
| `learnPatternStats()` (RSI 구간/MACD 패턴/조합 6종) | ✅ | `learning.ts` |

### P4 — 학습 전용 Cron + API (100%)

| 설계 요구사항 | 구현 여부 | 위치 |
|--------------|:--------:|------|
| `/api/observer`에 UTC 월요일 학습 트리거 병합 | ✅ | `observer/route.ts` |
| vercel.json 변경 없음 | ✅ | 설계 의도대로 |
| `GET /api/learn?history=N` | ✅ | `learn/route.ts` |
| `POST /api/learn` (CRON_SECRET 인증) | ✅ | `learn/route.ts` |

### P5 — 종목 적합성 스코어링 (100%)

| 설계 요구사항 | 구현 여부 | 위치 |
|--------------|:--------:|------|
| `GET /api/stats/stocks` — trade_memory 집계 | ✅ | `stats/stocks/route.ts` |
| fitness_score = winRate×0.5 + PF×0.3 + sampleAdequacy×0.2 | ✅ | `stats/stocks/route.ts` |
| 5건 미만 → neutral/50 | ✅ | `stats/stocks/route.ts` |
| avgLoss 0 나누기 방지 (기본값 1) | ✅ | `stats/stocks/route.ts` |

### P6 — 학습 현황 대시보드 (93%)

| 설계 요구사항 | 구현 여부 | 위치 |
|--------------|:--------:|------|
| `LearningSection` 컴포넌트 | ✅ | `learning-section.tsx` |
| LearningHeader (신뢰도 배지 + 날짜) | ✅ | `learning-section.tsx` |
| 만료 경고 (isExpired=true 시) | ✅ | `learning-section.tsx` |
| AtrMultiplierRow (기본값 → 학습값) | ✅ | `learning-section.tsx` |
| WeightBarChart (추세장 기준) | ✅ | `learning-section.tsx` |
| LearningHistoryTable (최근 N회) | ✅ | `learning-section.tsx` |
| **ABCompareCard** (base vs learned 평균) | ❌ | 미구현 — props `recentTrades` 누락 |
| `StockStatsSection` — 정렬 탭 3종 | ✅ | `stock-stats-section.tsx` |
| poor 종목 "성과미흡" 배지 | ✅ | `stock-stats-section.tsx` |
| fitness_score 바 (0~100) | ✅ | `stock-stats-section.tsx` |

### 신뢰도 등급별 적용 범위 (100%)

| 설계 요구사항 | 구현 여부 | 위치 |
|--------------|:--------:|------|
| `applyLearning()` 함수 | ✅ | `learning.ts` |
| none → 기본값 전체 | ✅ | `learning.ts` |
| low → ATR 배수 + 포지션 사이징만 | ✅ | `learning.ts` |
| medium/high → 전체 적용 | ✅ | `learning.ts` |
| 엔진에서 `applyLearning()` 호출 | ✅ | `engine/route.ts` |

---

## 설계 검증 체크리스트 (11항 전체)

| # | 항목 | 결과 |
|---|------|:----:|
| 1 | Cron UTC/KST — observer 병합 | ✅ |
| 2 | bb_position below/above (코드 기준) | ✅ |
| 3 | 백필 SQL 존재 | ✅ |
| 4 | ATR 변수 스코프 const | ✅ |
| 5 | takeProfitRatio 학습 자동 조정 | ✅ |
| 6 | candlePattern 추출 헬퍼 | ✅ |
| 7 | A/B base_score 캔들 재사용 | ✅ |
| 8 | Vercel Cron 슬롯 2개 유지 | ✅ |
| 9 | 만료 폴백 | ✅ |
| 10 | 최소 1주 보장 | ✅ |
| 11 | saveLearning 원자성 | ✅ |

---

## 차이점 요약

### 누락 (설계 O, 구현 X) — 1건

| 항목 | 설명 | 영향도 |
|------|------|:------:|
| ABCompareCard | base_score vs learned_score 최근 30건 평균 비교 카드. `recentTrades` prop 미구현 | 낮음 (UI 보조) |

### 변경 (설계 ≠ 구현) — 2건

| 항목 | 설계 | 구현 | 영향도 |
|------|------|------|:------:|
| 학습 트리거 요일 | 토요일 UTC 15:00 | UTC 월요일 (`getUTCDay() === 1`) | 낮음 |
| WeightBarChart 탭 | trending/ranging 전환 | trending 고정 | 낮음 |

### 추가 (설계 X, 구현 O) — 1건

| 항목 | 설명 |
|------|------|
| `winRate/avgWin/avgLoss` in LearningResult | snapshot 저장 및 UI 표시에 활용, 합리적 확장 |

---

## 권장 조치

우선순위 낮음 (선택적 개선):
1. ABCompareCard 구현 — `recentTrades` prop 추가 후 최근 30건 평균 base/learned 비교 카드
2. WeightBarChart ranging 탭 전환 UI 추가
3. 설계서 학습 트리거 요일 현행화 (토요일 → 월요일)
