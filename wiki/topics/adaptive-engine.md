# Adaptive Learning Engine — 적응형 학습 엔진

[coverage: high -- 4 sources]

## Purpose

실전 매매 결과를 경험 데이터로 학습하여 매매 전략 파라미터(지표 가중치, ATR 배수, 포지션 사이징)를 자동으로 최적화하는 자가학습 시스템. v5.9.0에서 완성되었으며 GAP 분석 97% Match Rate를 달성했다.

## Architecture

학습 모듈은 두 파일로 분리되어 있다.

| 파일 | 역할 | 줄 수 |
|------|------|-------|
| `src/lib/learning.ts` | 공개 API — `runLearning`, `loadLatestLearning`, `applyLearning`, 타입 re-export | 199줄 |
| `src/lib/learning-engine.ts` | 내부 구현 — 5개 학습 함수, `saveLearning`, `calcConfidence`, 헬퍼 | 377줄 |

외부 코드는 `@/lib/learning`에서만 import한다. `learning-engine.ts`의 타입들(`LearnedWeights`, `LearnedAtrMultipliers`, `LearnedPositionSizing`, `PatternStats`, `LearningResult`)은 `learning.ts`에서 re-export된다.

## 피드백 루프 구조

```
[매매 실행] → [결과 저장 (trade_memory)] → [패턴 분석 (learnXxx)] 
    → [가중치 개선 (learning_snapshots)] → [다음 매매에 적용]
```

## 주요 파일

| 파일 | 역할 |
|------|------|
| `src/lib/learning.ts` | 공개 API (runLearning, loadLatestLearning, applyLearning) |
| `src/lib/learning-engine.ts` | 내부 학습 로직 5개 함수 + 저장/헬퍼 |
| `src/lib/kis/indicators.ts` | ATR 계산, 포지션 사이징, DEFAULT_ATR_MULTIPLIERS |
| `src/app/api/learn/route.ts` | 학습 실행 API (GET/POST) |
| `src/app/api/engine/route.ts` | 학습 결과 적용 + 경험 데이터 수집 |
| `src/app/api/observer/route.ts` | 주간 학습 트리거 (UTC 월요일 병합) |
| `src/components/stats/learning-section.tsx` | 학습 현황 대시보드 |

## Trading Engine

엔진(`/api/engine`)은 매매 사이클마다 `loadLatestLearning()`을 호출해 최신 스냅샷을 로딩하고, `applyLearning(learned, config)`으로 신뢰도별 파라미터를 적용한다. `runLearning()` 직접 호출은 엔진 내부에서 제거되었으며 학습은 별도 스케줄(월요일 `/api/observer`)로만 실행된다.

## Signal System

지표별 가중치(BASE_WEIGHTS)는 레짐(trending/ranging)에 따라 다르게 적용된다.

```typescript
// BASE_WEIGHTS (learning.ts 및 learning-engine.ts 양쪽에 동일하게 정의)
trending: { RSI: 8, MACD: 26, 이동평균: 22, 볼린저: 8, 거래량: 21, 캔들패턴: 15 }
ranging:  { RSI: 21, MACD: 13, 이동평균: 13, 볼린저: 21, 거래량: 17, 캔들패턴: 15 }
```

추세장(trending)에서는 MACD·이동평균 비중이 높고, 횡보장(ranging)에서는 RSI·볼린저 비중이 높다.

가중치 조정 공식 (`calcAdjustedWeights`):
- 신호 횟수가 3회 미만인 지표는 BASE_WEIGHTS 유지
- 3회 이상이면: `round(base × (0.4 + winRate × 1.2))`
- 조정 후 100점 합산 정규화

## Adaptive Learning Engine

### 학습 함수 목록

모든 학습 함수는 `learning-engine.ts`에 있고, `runLearning()`이 `Promise.all`로 병렬 호출한다.

```typescript
// runLearning() 내부 (learning.ts)
const [weights, atrMultipliers, positionSizing, riskParams, patternStats] = await Promise.all([
  learnWeights(30),        // 최근 30일 trade_memory 기반 가중치
  learnAtrMultipliers(60), // 최근 60일 청산 건 ATR 배수 중앙값
  learnPositionSizing(),   // 손절 건 평균 손실 역산
  learnRiskParamsTakeProfitRatio(60), // 승률 기반 익절 비율
  learnPatternStats(60),   // RSI/MACD/조합 세부 성과 집계
]);
```

### learnWeights() — 지표 가중치

데이터 소스 우선순위:
1. `trade_memory` 테이블 (10건 이상 시 우선)
2. 폴백: `positions` 테이블의 `entry_signal.indicators`

각 지표별 신호 적중(hit) 판단 기준:
- RSI: `rsi_value < 30`
- MACD: `macd_histogram > 0`
- 이동평균: `ma_cross === "golden"`
- 볼린저: `bb_position === "below"`
- 거래량: `volume_ratio >= 200`
- 캔들패턴: 패턴명이 "없음"·"(백필)"이 아닌 값

### learnAtrMultipliers() — ATR 배수

청산 유형별(`stop_loss` / `take_profit` / `trailing_stop`) 실제 수익률의 절댓값으로 배수를 역산하고 중앙값(median)을 사용한다. 각 유형별 최소 5건 이상일 때만 학습값 채택; 미만은 DEFAULT 유지.

하한 가드:
- stop: `Math.max(median, 1.0)` (기본 2.0)
- profit: `Math.max(median, 1.5)` (기본 3.0)
- trailing: `Math.max(median, 0.5)` (기본 1.5)

`atr_value = 0` 또는 `pnl_percent` 없는 레코드는 계산에서 제외.

### learnPositionSizing() — 목표 리스크 금액

손절(`exit_reason = "stop_loss"`) 건의 `pnl_amount` 절댓값 평균을 계산한다. 현재 기본값(30,000원)과의 비율이 ±20% 이내면 변경하지 않는다. 변경 시 1,000원 단위로 반올림.

### learnRiskParamsTakeProfitRatio() — 익절 비율

승률에 따라 부분 익절 비율(%)을 자동 조정:

| 승률 | takeProfitRatio |
|------|----------------|
| > 60% | 30% (공격적 홀딩) |
| > 50% | 40% |
| < 35% | 70% (빠른 수익 실현) |
| 그 외 | 50% (기본값) |

신뢰도 medium/high에서만 적용된다.

### learnPatternStats() — 패턴 통계

세 가지 집계를 생성한다:
- `rsiRanges`: RSI 구간 8단계별 (0-20, 20-30, ..., 80-100) 승률·평균 PnL
- `macdPatterns`: `golden_cross_pos` (histogram≥0) vs `golden_cross_neg` 성과
- `combos`: 6개 지표 조합 패턴별 성과

```typescript
// 6개 조합 패턴
"RSI<30+Vol>200", "RSI<30+MACD골든", "BB하단+거래량급등",
"RSI>70+BB상단", "RSI<30+BB하단", "MACD골든+거래량급등"
```

### saveLearning() — DB 저장

1. 기존 활성 스냅샷 전체를 `is_active = false`로 UPDATE
2. 새 스냅샷 INSERT (`is_active = true`, `expires_at = 현재 + 7일`)

두 단계는 별도 쿼리이나 첫 단계 실패는 무시하고 INSERT를 진행한다 (비중요 실패 처리).

### LearningResult 타입 구조

```typescript
// learning-engine.ts에 정의, learning.ts에서 re-export
interface LearningResult {
  weights:        { trending, ranging, source, sampleSize, learnedAt }
  atrMultipliers: { stop, profit, trailing, source, sampleSize }
  positionSizing: { targetRiskAmount, source }
  risk:           { takeProfitRatio, source }
  patternStats:   { rsiRanges[], macdPatterns[], combos[] }
  confidence:     "none" | "low" | "medium" | "high"
  sampleSize:     number
  timestamp:      string
  winRate, avgWin, avgLoss: number
}
```

## Order Management

`applyLearning(learned, config)`이 신뢰도별로 주문에 사용할 파라미터를 결정한다:

| 신뢰도 | 거래 수 | weights | ATR 배수 | targetRiskAmount | takeProfitRatio |
|--------|---------|---------|----------|-----------------|----------------|
| `none` | < 10 | BASE_WEIGHTS (기본값) | DEFAULT | 30,000원 (기본값) | config 기본값 |
| `low` | 10–49 | **50% 블렌딩** (`learnedWeight * 0.5 + defaultWeight * 0.5`) | learned | learned | config 기본값 (미적용) |
| `medium` | 30–49 *(구 기준)* → `low`로 통합 | learned (100%) | learned | learned | learned |
| `high` | ≥ 50 | learned (100%) | learned | learned | learned |

> **Cold Start Fix (2026-04-20)**: `low` 신뢰도 구간이 10–29 → **10–49**로 확대되고, 가중치에 50% 블렌딩이 도입되었다. 기존에는 임계값 미달 구간(10–49건)의 학습 결과가 가중치에 전혀 반영되지 않다가 50건 도달 순간 0% → 100%로 급변하는 **콜드 스타트 문제**가 있었다. 블렌딩으로 이 전환을 부드럽게 완화한다.

```typescript
// low 신뢰도 가중치 블렌딩 (2026-04-20~)
finalWeight = learnedWeight * 0.5 + defaultWeight * 0.5  // trending/ranging 각각 적용
// takeProfitRatio는 low에서 미적용 — config 기본값 유지
```

`weights = undefined`(none)일 때 시그널 시스템은 BASE_WEIGHTS를 그대로 사용한다.

## Position Sizing

```
투자금액 = targetRiskAmount / (ATR × stopMultiplier / 현재가)

예시:
- A종목 ATR 2% → 투자 100만원 (손실 한도 ≈ 4%)
- B종목 ATR 5% → 투자  40만원 (손실 한도 ≈ 4%)
→ 두 종목 모두 손절 시 동일 금액 손실
```

`calcPositionSize(atr, price, targetRiskAmount, maxPerTrade)`:
- 상한: `Math.min(calculated, maxPerTrade)`
- 하한: `Math.max(result, currentPrice)` — 최소 1주 보장

`calcDynamicRisk()` 하한 가드:
- `stopLoss ≤ -2%`, `takeProfit ≥ 3%`, `trailingStop ≤ -1.5%`

## Data & Database

### learning_snapshots 테이블

`LearningSnapshot` 인터페이스가 DB 행 구조에 대응된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `weights_trending` | jsonb | 추세장 지표별 가중치 |
| `weights_ranging` | jsonb | 횡보장 지표별 가중치 |
| `weights_source` | text | "learned" \| "default" |
| `atr_mult_stop/profit/trailing` | numeric | ATR 배수 3종 |
| `atr_source` | text | "learned" \| "default" |
| `target_risk_amount` | numeric | 목표 리스크 금액 |
| `sizing_source` | text | "learned" \| "default" |
| `take_profit_ratio` | numeric | 부분 익절 비율 (%) |
| `risk_source` | text | "learned" \| "default" |
| `confidence` | text | none/low/medium/high |
| `is_active` | boolean | 현재 활성 스냅샷 여부 |
| `expires_at` | timestamptz | 유효 기간 (생성 후 7일) |
| `pattern_stats` | jsonb | rsiRanges/macdPatterns/combos |

### trade_memory 테이블

학습 입력 데이터. 핵심 컬럼:
- `regime`: "trending" \| "ranging"
- `is_win`: 승/패 여부
- `exit_reason`: stop_loss / take_profit / trailing_stop
- `atr_value`, `pnl_percent`, `pnl_amount`
- `rsi_value`, `macd_histogram`, `ma_cross`, `bb_position`, `volume_ratio`, `candle_pattern`

### loadLatestLearning() — 폴백 로직

```typescript
// 1순위: is_active=true AND expires_at > now()
// 2순위: 가장 최근 스냅샷 (만료 무관)
// 만료 폴백 시 콘솔 경고 출력 (daysSince 표시)
// 스냅샷 없으면 null 반환
```

`snapshotToResult()` (private): DB 행 → `LearningResult` 변환. 모든 필드에 null/undefined 방어 처리 (`?? default`).

## API Endpoints

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/learn` | GET | `?history=N` — 최근 N회 학습 이력 조회 |
| `/api/learn` | POST | 학습 실행 (CRON_SECRET 인증 필요) |
| `/api/observer` | GET/POST | 주간 배치 + UTC 월요일 조건 시 runLearning() 호출 |

## Key Decisions

**학습 Cron 슬롯 절약**: 별도 Cron을 추가하지 않고 `/api/observer`에 `if (getUTCDay() === 1)` 조건으로 병합. Vercel Hobby 플랜 Cron 2개 슬롯 제약 대응.

**파일 분리 (v5.11)**: `learning.ts` 단일 파일(~580줄)을 공개 API(199줄)와 내부 구현(377줄)으로 분리. 외부 import 경로는 `@/lib/learning`으로 불변.

**중앙값 기반 ATR 배수**: 평균 대신 중앙값(median)을 사용해 극단적 손절/익절 이상치의 영향 최소화.

**신뢰도 등급별 차등 적용**: 데이터 부족 시 가중치 변경은 오히려 성능 악화 위험이 있어 low 신뢰도에서는 ATR·사이징만 반영하고 가중치는 BASE 유지. → v5.x Cold Start Fix에서 발전: low 구간(10–49건)에 50% 블렌딩 도입으로 급격한 전환 완화 (아래 참조).

**Cold Start Fix (2026-04-20)**: `applyLearning()`의 `low` 신뢰도 범위를 10–29 → **10–49**로 확대하고, 이 구간에서 가중치를 `learnedWeight * 0.5 + defaultWeight * 0.5`로 블렌딩 처리. `takeProfitRatio`는 low에서 여전히 미적용(config 기본값). 핵심 문제: 기존 구현은 49번째 거래까지 학습 가중치가 0% 반영되다가 50번째 도달 시 100%로 급변 — 이 절벽을 없애는 것이 이번 수정의 목적.

## Gotchas

- 엔진에서 `runLearning()` 직접 호출 제거됨 — `loadLatestLearning()`만 사용
- `atr_value = 0` 또는 `entry_price = 0` 레코드는 학습에서 제외 (0 나누기 방지)
- 학습 스냅샷 유효기간: 7일 (`expires_at`). 만료 시 최신 활성 스냅샷으로 폴백, 없으면 null
- BASE_WEIGHTS가 `learning.ts`와 `learning-engine.ts` 양쪽에 동일하게 정의되어 있음 — 수정 시 두 파일 모두 변경 필요
- `calcConfidence`는 `learning-engine.ts`에 구현되어 있으나 `learning.ts`에서 re-export됨
- 현재 배포 직후라 실거래 데이터 < 50건인 경우 대부분 none/low 신뢰도 상태

## Dashboard

`learning-section.tsx` 제공 항목:
- 신뢰도 배지 + 마지막 학습 날짜
- 만료 경고 (`isExpired=true` 시)
- AtrMultiplierRow: 기본값 → 학습값 비교
- WeightBarChart: 추세장 지표 가중치 시각화 (ranging 탭 미구현)
- LearningHistoryTable: 최근 5회 학습 이력

**미구현**: ABCompareCard (base_score vs learned_score 최근 30건 평균 비교) — v5.9.1 예정.

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md`
- `docs/02-design/features/adaptive-engine.design.md`
- `docs/03-analysis/adaptive-engine.analysis.md`
- `docs/04-report/features/adaptive-engine.report.md`
