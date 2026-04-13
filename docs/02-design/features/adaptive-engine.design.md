# adaptive-engine — 설계 문서

> 작성일: 2026-04-11 / 보완: 2026-04-11 (design-validator 검토 반영)
> 기반 계획서: `docs/01-plan/features/adaptive-engine.plan.md`
> 구현 범위: P1~P6 전체 설계 (구현 없음)

---

## ⚠️ 보완 이력 (design-validator 검토 결과)

| # | 문제 | 수정 내용 |
|---|------|-----------|
| 1 | Cron UTC/KST 오류 | `/api/observer`에 병합 — vercel.json 변경 없음 ✅결정 |
| 2 | `bb_position` 값 불일치 | `lower/upper` → `below/above` (코드 기준) |
| 3 | 마이그레이션 전략 없음 | positions → trade_memory 백필 SQL 추가 |
| 4 | ATR 변수 스코프 버그 | STEP 1 루프 내 `const` 선언으로 변경 명시 |
| 5 | `takeProfitRatio` 행방 | 학습 자동 조정 — 신뢰도 medium 이상 시 적용 ✅결정 |
| 6 | `SignalRaw`에 candlePattern 없음 | `signal.indicators` 추출 헬퍼 설계 추가 |
| 7 | A/B base_score 계산 미상세 | 캔들 데이터 재사용, 두 함수 순서 명시 |
| 8 | Vercel Cron 슬롯 2개 제한 | `/api/observer` UTC 월요일 조건부 병합 ✅결정 |
| 9 | 만료 폴백 없음 | `loadLatestLearning` 폴백 로직 추가 |
| 10 | 최소 1주 미보장 | `calcPositionSize` 반환값 최소 보장 로직 추가 |
| 11 | `saveLearning` 원자성 | UPDATE 후 INSERT 순서 + 실패 복구 설계 |

---

## 1. 전체 데이터 플로우

```
┌─────────────────────────────────────────────────────────┐
│                    엔진 실행 (Cron 4회/일)                 │
│                                                          │
│  loadLatestLearning()  ← 만료 시 최신 스냅샷 폴백          │
│       ↓                                                  │
│  applyLearning(learned, config)  ← 신뢰도 기반 분기       │
│       ↓                                                  │
│  { weights, atrMultipliers, targetRiskAmount,            │
│    takeProfitRatio }                                     │
│       ↓                           ↓                      │
│  [A] analyzeSignal()          [B] analyzeSignalWithWeights()
│  base_score (기본)             learned_score (학습)        │
│       ↓                           ↓                      │
│  [매수 결정] — learned_score 기준                          │
│       ↓                                                  │
│  calcPositionSize() — ATR 기반 투자금액 (최소 1주 보장)    │
│       ↓                                                  │
│  buyOrder() 성공 후                                       │
│  recordTradeMemory(base_score, learned_score, ...)        │
│       ↓                                                  │
│  [포지션 보유]                                            │
│       ↓  (STEP 1, 종목별 루프 내부)                        │
│  const { stopLoss, takeProfit, trailingStop }             │
│    = calcDynamicRisk(atr, price, atrMultipliers)          │
│       ↓                                                  │
│  [청산] closePosition() + closeTradeMemory()              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         학습 Cron (매주 토요일 UTC 15:00 = KST 일요일 00:00) │
│                                                          │
│  trade_memory (30~60일치 closed 레코드) 집계              │
│       ↓                                                  │
│  learnWeights() + learnAtrMultipliers()                  │
│  + learnRiskParams() + learnPositionSizing()             │
│  + learnPatternStats()                                   │
│       ↓                                                  │
│  calcConfidence(sampleSize)                              │
│       ↓                                                  │
│  saveLearning()                                          │
│  ① 기존 is_active=true → false UPDATE                    │
│  ② 신규 스냅샷 INSERT (is_active=true, expires_at=+7일)   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. P1 — ATR × 학습 통합 설계

### 문제 재확인

```typescript
// 현재 engine/route.ts (충돌 구조)
let stopLoss = learning?.risk.stopLoss ?? -5   // ① 학습값 적용
// ...
// STEP 1 for 루프 내부:
const dynamic = calcDynamicRisk(atr, price)    // ② ATR로 덮어씀 → 학습 무시
stopLoss = dynamic.stopLoss                    // ③ 게다가 let이라 다음 종목에도 영향
```

**추가 발견**: `stopLoss`가 for 루프 밖 `let`으로 선언되어 있어, 첫 번째 종목의 ATR 결과가 두 번째 종목의 초기값을 오염시킴.

### 해결 설계

#### indicators.ts — AtrMultipliers 인터페이스 + calcDynamicRisk 확장

```typescript
export interface AtrMultipliers {
  stop: number;       // 기본 2.0
  profit: number;     // 기본 3.0
  trailing: number;   // 기본 1.5
}

export const DEFAULT_ATR_MULTIPLIERS: AtrMultipliers = {
  stop: 2.0,
  profit: 3.0,
  trailing: 1.5,
};

// 변경 전
export function calcDynamicRisk(atr: number, currentPrice: number)

// 변경 후 (multipliers 파라미터 추가, 기본값으로 하위 호환)
export function calcDynamicRisk(
  atr: number,
  currentPrice: number,
  multipliers: AtrMultipliers = DEFAULT_ATR_MULTIPLIERS
): { stopLoss: number; takeProfit: number; trailingStop: number }
// stopLoss   = currentPrice > 0 ? -((atr * multipliers.stop)     / currentPrice) * 100 : -5
// takeProfit = currentPrice > 0 ?  ((atr * multipliers.profit)   / currentPrice) * 100 : 5
// trailingStop = currentPrice > 0 ? -((atr * multipliers.trailing) / currentPrice) * 100 : -3
// 하한 가드: stopLoss ≤ -2, takeProfit ≥ 3, trailingStop ≤ -1.5 유지
```

#### learning.ts — learnAtrMultipliers() 추가

```typescript
export interface LearnedAtrMultipliers {
  stop: number;
  profit: number;
  trailing: number;
  source: "learned" | "default";
  sampleSize: number;
}

export async function learnAtrMultipliers(lookbackDays = 60): Promise<LearnedAtrMultipliers>
// 1. trade_memory WHERE closed_at IS NOT NULL AND atr_value > 0 조회
// 2. 손절(exit_reason='stop_loss') 건:
//    실제배수 = abs(pnl_percent) / (atr_value / entry_price * 100)
//    → 중앙값 계산 (평균 대신 중앙값: 이상치 영향 최소화)
// 3. 익절(exit_reason='take_profit') 건: 동일 방식
// 4. 트레일링(exit_reason='trailing_stop') 건: 동일 방식
// 5. 각 청산 유형별 최소 5건 이상일 때만 학습값 사용, 미만은 DEFAULT
// ⚠️ atr_value = 0 또는 entry_price = 0 레코드 제외 (0 나누기 방지)
```

#### engine/route.ts — 스코프 버그 해소 + 단일 경로

```typescript
// 변경 전 (버그: let stopLoss가 루프 밖에 있음)
let stopLoss = learned?.risk.stopLoss ?? -5
for (const h of holdings) {
  if (config.dynamicRisk) {
    stopLoss = calcDynamicRisk(atr, price).stopLoss  // 다음 종목 오염
  }
}

// 변경 후 (각 종목 루프 내부에서 const로 독립 계산)
for (const h of holdings) {
  const candles = await getDailyCandles(config, h.pdno)
  const atr = calcATR(candles)
  const { stopLoss, takeProfit, trailingStop } =
    calcDynamicRisk(atr, currentPrice, atrMultipliers)  // ← const, 종목별 독립
  // 루프 밖 let stopLoss 선언 제거
}
```

---

## 3. P2 — 포지션 사이징 동적화 설계

### 핵심 공식

```
목표 손실 금액 = targetRiskAmount (기본 30,000원)
손절 폭 비율   = atr × stop_multiplier / currentPrice
투자 금액      = targetRiskAmount / 손절 폭 비율
투자 금액      = min(투자 금액, maxPerTrade)  ← 상한선
최소 보장      = max(투자 금액, currentPrice × 1)  ← 최소 1주 금액
```

### indicators.ts — calcPositionSize() 신규

```typescript
export function calcPositionSize(
  atr: number,
  currentPrice: number,
  targetRiskAmount: number,   // 원 (예: 30000)
  maxPerTrade: number,        // 원 상한선 (예: 1000000)
  stopMultiplier: number = 2.0
): number {
  // 예외: ATR 또는 가격 없으면 상한선 반환
  if (atr <= 0 || currentPrice <= 0) return maxPerTrade

  const stopRatio = (atr * stopMultiplier) / currentPrice
  if (stopRatio <= 0) return maxPerTrade

  const calculated = targetRiskAmount / stopRatio

  // 상한선 적용
  const capped = Math.min(calculated, maxPerTrade)

  // ⚠️ 최소 1주 보장: 계산값이 1주 금액보다 작으면 1주 금액으로 올림
  const minAmount = currentPrice  // 1주 매수에 필요한 최소 금액
  return Math.max(Math.floor(capped), minAmount)
}
// qty 계산: Math.floor(positionSize / price)  — 결과가 0이 되지 않음을 보장
```

### learning.ts — learnPositionSizing() 추가

```typescript
export interface LearnedPositionSizing {
  targetRiskAmount: number;   // 최적 목표 손실 금액 (원)
  source: "learned" | "default";
}

export async function learnPositionSizing(): Promise<LearnedPositionSizing>
// 1. trade_memory WHERE exit_reason='stop_loss' AND pnl_amount IS NOT NULL 조회
// 2. 평균 실제 손실 금액 = avg(abs(pnl_amount))
// 3. 현재 targetRiskAmount(30000) 대비 실제 손실 금액 비율 계산
// 4. 비율이 0.8~1.2 범위 → 유지 (source: "default")
// 5. 비율 벗어나면 평균 실제 손실 금액으로 조정 (source: "learned")
// 6. 최소 10건 이상 손절 건 있을 때만 학습값 반환
```

### engine/route.ts — 포지션 사이징 적용

```typescript
// 변경 전
const qty = Math.floor(maxPerTrade / price)

// 변경 후
const positionSize = calcPositionSize(
  signal.raw.atr,       // ← SignalRaw.atr (이미 존재)
  price,
  applied.targetRiskAmount,   // applyLearning() 결과
  maxPerTrade,
  applied.atrMultipliers.stop
)
const qty = Math.floor(positionSize / price)
// qty >= 1 보장됨 (calcPositionSize에서 최소 1주 금액 보장)
```

---

## 4. P3 — 경험 데이터 수집 + 학습 결과 영속화 설계

### 4-1. Supabase 테이블 생성 SQL

#### `trade_memory` 테이블

```sql
CREATE TABLE trade_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  stock_code      TEXT NOT NULL,
  stock_name      TEXT,

  -- 지표 스냅샷 (7종) — 실제 코드 값 기준
  rsi_value       NUMERIC,
  macd_histogram  NUMERIC,
  ma_cross        TEXT,     -- 'golden' | 'dead' | 'none' (ma.crossUp/above 기반)
  bb_position     TEXT,     -- 'below' | 'middle' | 'above'  ⚠️ 코드 기준값 (lower/upper 아님)
  volume_ratio    NUMERIC,  -- vol.ratio (20일 평균 대비 %)
  adx_value       NUMERIC,
  candle_pattern  TEXT,     -- indicators 배열에서 추출 (아래 헬퍼 참조)

  -- 진입 컨텍스트
  regime          TEXT,     -- 'trending' | 'ranging'
  base_score      INT,      -- analyzeSignal() 결과 (기본 가중치)
  learned_score   INT,      -- analyzeSignalWithWeights() 결과 (학습 가중치), 없으면 base_score
  total_score     INT,      -- 보정 포함 최종 점수 (adjustedScore)
  market_bonus    INT,
  investor_bonus  INT,
  snapshot_bonus  INT,
  weights_source  TEXT,     -- 'learned' | 'default'
  atr_value       NUMERIC,  -- signal.raw.atr
  position_size   INT,      -- 실제 투자금액 (원)

  -- 결과 (청산 시 UPDATE)
  pnl_percent     NUMERIC,
  pnl_amount      NUMERIC,
  hold_days       INT,
  exit_reason     TEXT,     -- 'stop_loss' | 'take_profit' | 'trailing_stop' | 'max_hold'
  is_win          BOOLEAN,
  closed_at       TIMESTAMPTZ
);

CREATE INDEX idx_trade_memory_code    ON trade_memory(stock_code);
CREATE INDEX idx_trade_memory_created ON trade_memory(created_at DESC);
CREATE INDEX idx_trade_memory_closed  ON trade_memory(closed_at DESC)
  WHERE closed_at IS NOT NULL;
```

#### `candle_pattern` 추출 헬퍼 설계

`SignalRaw`에 candlePattern 필드가 없으므로, `signal.indicators`에서 추출:

```typescript
// engine/route.ts 내부 헬퍼
function extractCandlePattern(signal: SignalResult): string {
  const patternInd = signal.indicators.find((i) => i.name === "캔들패턴")
  return patternInd?.value ?? "없음"
  // value 예시: "망치형, 상승장악형" | "패턴 없음"
}
```

#### `learning_snapshots` 테이블

```sql
CREATE TABLE learning_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  sample_size         INT,
  confidence          TEXT,   -- 'none' | 'low' | 'medium' | 'high'

  -- 지표 가중치
  weights_trending    JSONB,  -- { RSI:18, MACD:24, 이동평균:20, 볼린저:8, 거래량:15, 캔들패턴:15 }
  weights_ranging     JSONB,
  weights_source      TEXT,   -- 'learned' | 'default'

  -- ATR 배수 (P1)
  atr_mult_stop       NUMERIC DEFAULT 2.0,
  atr_mult_profit     NUMERIC DEFAULT 3.0,
  atr_mult_trailing   NUMERIC DEFAULT 1.5,
  atr_source          TEXT,   -- 'learned' | 'default'

  -- 포지션 사이징 (P2)
  target_risk_amount  INT DEFAULT 30000,
  sizing_source       TEXT,   -- 'learned' | 'default'

  -- 기존 learnRiskParams() 유지 항목
  take_profit_ratio   INT DEFAULT 50,   -- 익절 시 매도 비율 (ATR과 무관, 승률 기반)
  risk_source         TEXT,   -- 'learned' | 'default'

  -- 성과 요약
  win_rate            NUMERIC,
  avg_win             NUMERIC,
  avg_loss            NUMERIC,

  -- 세부 패턴 통계 (P4)
  pattern_stats       JSONB,
  /*
  {
    rsi_ranges: [{ range:"20-30", count:12, win_rate:75, avg_pnl:3.2 }],
    macd_patterns: [{ pattern:"golden_cross", count:15, win_rate:67, avg_pnl:2.8 }],
    combos: [{ combo:"RSI<30+Vol>200%", count:6, win_rate:83, avg_pnl:4.1 }]
  }
  */

  is_active           BOOLEAN DEFAULT false,
  expires_at          TIMESTAMPTZ   -- created_at + INTERVAL '7 days'
);

CREATE INDEX idx_learning_active   ON learning_snapshots(is_active, created_at DESC);
CREATE INDEX idx_learning_expires  ON learning_snapshots(expires_at DESC);
```

### 4-2. 마이그레이션 전략 (기존 positions → trade_memory 백필)

**배포 직후 trade_memory가 0건이면 학습 데이터가 리셋됨.**
기존 `positions` 테이블의 청산 완료 데이터를 `trade_memory`로 백필하는 SQL을 Supabase SQL Editor에서 1회 실행:

```sql
-- 기존 positions → trade_memory 백필 (entry_signal 있는 청산 건만)
INSERT INTO trade_memory (
  created_at, stock_code, stock_name,
  rsi_value, macd_histogram, ma_cross, bb_position,
  volume_ratio, adx_value, candle_pattern,
  regime, base_score, learned_score, total_score,
  weights_source, atr_value,
  pnl_percent, pnl_amount, hold_days, exit_reason,
  is_win, closed_at
)
SELECT
  entry_date,
  stock_code,
  stock_name,
  -- entry_signal.indicators 에서 추출 (없으면 NULL)
  (entry_signal->'raw'->>'rsi')::numeric,
  (entry_signal->'raw'->>'macd')::numeric,
  CASE
    WHEN (entry_signal->'raw'->>'macdCrossover') = 'golden' THEN 'golden'
    WHEN (entry_signal->'raw'->>'macdCrossover') = 'dead'   THEN 'dead'
    ELSE 'none'
  END,
  entry_signal->'raw'->>'bbPosition',
  (entry_signal->'raw'->>'volumeRatio')::numeric,
  (entry_signal->'raw'->>'adx')::numeric,
  '(백필)' AS candle_pattern,
  entry_signal->'raw'->>'regime',
  (entry_signal->>'totalScore')::int,
  (entry_signal->>'totalScore')::int,   -- learned_score = base_score (백필 시 동일)
  (entry_signal->>'totalScore')::int,
  'default',
  (entry_signal->'raw'->>'atr')::numeric,
  pnl_percent,
  pnl_amount,
  hold_days,
  exit_reason,
  CASE WHEN pnl_amount > 0 THEN true ELSE false END,
  exit_date
FROM positions
WHERE status = 'closed'
  AND exit_date IS NOT NULL
  AND entry_signal IS NOT NULL;
```

### 4-3. learning.ts — 신규/수정 함수 시그니처

```typescript
// ── 업데이트된 LearningResult 타입 ──
export interface LearningResult {
  weights: LearnedWeights            // 기존 유지
  atrMultipliers: LearnedAtrMultipliers   // 신규
  positionSizing: LearnedPositionSizing   // 신규
  risk: { takeProfitRatio: number; source: "learned" | "default" }  // takeProfitRatio 유지
  patternStats: PatternStats              // 신규
  confidence: "none" | "low" | "medium" | "high"
  sampleSize: number
  timestamp: string
}

// ── 신뢰도 계산 ──
export function calcConfidence(sampleSize: number): "none" | "low" | "medium" | "high"
// none:   < 10건
// low:    10~29건 → ATR 배수 + 포지션 사이징만 적용
// medium: 30~49건 → 가중치 + 전체 적용 (보수적)
// high:   50건+   → 전체 적용 (공격적 조정 허용)

// ── 학습 결과 저장 (원자성 설계) ──
export async function saveLearning(result: LearningResult): Promise<void>
// 실행 순서:
// ① UPDATE learning_snapshots SET is_active = false WHERE is_active = true
// ② INSERT INTO learning_snapshots (...) VALUES (..., is_active = true, expires_at = now()+7일)
// ③ ①이 실패해도 ②는 실행 (active 중복 허용, loadLatestLearning이 최신 created_at 기준)
// → Supabase 트랜잭션 미지원 환경 고려: ②만 실패하면 기존 스냅샷 유지되므로 안전

// ── 최신 학습 결과 로딩 (만료 폴백 포함) ──
export async function loadLatestLearning(): Promise<LearningResult | null>
// 1차 시도: is_active = true AND expires_at > now() → 유효 스냅샷 반환
// 폴백:    유효 스냅샷 없으면 → created_at DESC LIMIT 1 (만료된 최신도 사용)
//          → 엔진 로그에 "⚠️ 학습 만료됨 (XXX일 전)" 경고 출력
// 없으면:  null 반환 → 엔진은 기본값 사용

// ── 통합 학습 실행 ──
export async function runLearning(): Promise<LearningResult>
// learnWeights(30) + learnAtrMultipliers(60) + learnPositionSizing()
// + learnRiskParamsTakeProfitRatio(60) + learnPatternStats(60)
// → saveLearning() 호출
// ※ 기존 learnRiskParams()는 takeProfitRatio 계산 부분만 추출하여 유지
//   stopLoss/takeProfit/trailingStop은 ATR 배수로 대체되어 제거

// ── learnRiskParamsTakeProfitRatio() ──
export async function learnRiskParamsTakeProfitRatio(
  lookbackDays = 60
): Promise<{ takeProfitRatio: number; source: "learned" | "default" }>
// 승률 기반 익절 매도 비율 계산 (기존 learnRiskParams 로직 중 takeProfitRatio 부분만 발췌)
// 승률 > 60% → 30% (익절 일부만, 나머지 트레일링)
// 승률 > 50% → 40%
// 승률 < 35% → 70% (확정 수익 우선)
// 그 외       → 50%
```

### 4-4. engine/route.ts — A/B base_score 병렬 계산

```typescript
// 캔들 데이터는 1회만 조회 후 두 함수에 재사용
const candles = await getDailyCandles(config, code)
if (candles.length < 26) continue

// [A] 기본 가중치 점수 (항상 계산)
const baseSignal = analyzeSignal(candles)

// [B] 학습 가중치 점수 (가중치 있을 때만, 없으면 baseSignal 재사용)
const learnedSignal = applied.weights
  ? analyzeSignalWithWeights(candles, applied.weights)
  : baseSignal

// 매수 결정은 learnedSignal 기준
const adjustedScore = learnedSignal.totalScore + totalBonus
// trade_memory 저장 시: base_score = baseSignal.totalScore, learned_score = learnedSignal.totalScore
```

### 4-5. engine/route.ts — trade_memory 저장/업데이트 함수

```typescript
// 매수 주문 성공 후 INSERT
async function recordTradeMemory(params: {
  code: string
  name: string
  baseSignal: SignalResult      // analyzeSignal() 결과
  learnedSignal: SignalResult   // analyzeSignalWithWeights() 결과 (또는 baseSignal)
  bonuses: { market: number; investor: number; snapshot: number }
  adjustedScore: number         // 보정 포함 최종 점수
  weightsSource: "learned" | "default"
  positionSize: number          // 실제 투자금액 (원)
}): Promise<void>
// ※ candle_pattern = extractCandlePattern(learnedSignal)
// ※ bb_position 저장 시 raw.bbPosition 그대로 사용 ('below'/'above'/'middle')

// 청산 시 UPDATE (closePosition과 동일 시점에 호출)
async function closeTradeMemory(
  code: string,
  pnlPercent: number,
  pnlAmount: number,
  holdDays: number,
  exitReason: string
): Promise<void>
// WHERE stock_code = code AND closed_at IS NULL
// ORDER BY created_at DESC LIMIT 1
// → 동일 종목 복수 포지션 불가 구조이므로 race condition 없음
```

---

## 5. P4 — 학습 전용 Cron + API 설계

### Vercel Cron 슬롯 제약 및 해결 방안

현재 `vercel.json`에 Cron 2개 사용 중 (observer, engine).
Vercel Hobby 플랜 2개 제한 → **`/api/observer`에 학습 로직 조건부 병합** (결정 완료).

```typescript
// observer/route.ts 끝부분에 추가
// UTC 월요일 00:00 = KST 월요일 09:00 → 주 1회 학습 실행
const nowUtc = new Date()
const isLearningDay = nowUtc.getUTCDay() === 1  // UTC 월요일
if (isLearningDay) {
  try {
    await runLearning()  // learning.ts의 runLearning() 직접 호출
  } catch { /* 학습 실패해도 observer 결과에 영향 없음 */ }
}
```

→ Cron 추가 없이 기존 `/api/observer` (매일 평일 00:00 UTC)에 월요일 조건으로 학습 트리거.

### src/app/api/learn/route.ts

```typescript
// GET /api/learn?history=N — 학습 결과 조회
export async function GET(req: NextRequest): Promise<Response>

// 파라미터 없음: 최신 스냅샷 반환
// ?history=5: 최근 N회 이력 반환
interface GetResponse {
  snapshot: LearningSnapshot | null   // 현재 활성 학습 결과
  isExpired: boolean                  // 만료 여부 (폴백 사용 중이면 true)
  history?: LearningSnapshot[]        // history 파라미터 있을 때만 포함
}

interface LearningSnapshot {
  id: string
  created_at: string
  sample_size: number
  confidence: "none" | "low" | "medium" | "high"
  weights_trending: Record<string, number>
  weights_ranging: Record<string, number>
  weights_source: string
  atr_mult_stop: number
  atr_mult_profit: number
  atr_mult_trailing: number
  atr_source: string
  target_risk_amount: number
  take_profit_ratio: number
  win_rate: number
  avg_win: number
  avg_loss: number
  pattern_stats: PatternStats | null
  is_active: boolean
  expires_at: string
}

// POST /api/learn — 학습 실행 (Cron + 수동 모두 사용)
export async function POST(req: NextRequest): Promise<Response>
// Authorization: Bearer CRON_SECRET 검증 (기존 observer 패턴 동일)
// → runLearning() 호출 → saveLearning() 저장
interface PostResponse {
  success: boolean
  confidence: string
  sampleSize: number
  weights_source: string
  atr_source: string
  message: string
}
```

### vercel.json — 변경 없음

Cron은 기존 `/api/observer`에 병합하므로 `vercel.json` 수정 불필요.
`/api/learn`은 수동 POST 전용 API로만 사용 (대시보드에서 "지금 학습" 버튼 연결 가능).

### learnPatternStats() — 세부 패턴 분석

```typescript
export async function learnPatternStats(lookbackDays = 60): Promise<PatternStats>
// trade_memory WHERE closed_at IS NOT NULL 조회

export interface PatternStats {
  rsiRanges: Array<{
    range: string    // "0-20" | "20-30" | "30-40" | "40-50" | "50-60" | "60-70" | "70-80" | "80-100"
    count: number
    winRate: number  // 0~100
    avgPnl: number   // %
  }>
  macdPatterns: Array<{
    pattern: string  // "golden_cross_pos" | "golden_cross_neg" | "dead_cross"
    // (히스토그램 양수/음수 구분)
    count: number
    winRate: number
    avgPnl: number
  }>
  combos: Array<{
    combo: string    // "RSI<30+Vol>200" | "RSI<30+MACD골든" | "BB하단+거래량급등" 등
    count: number
    winRate: number
    avgPnl: number
  }>
}
// RSI: rsi_value를 10구간으로 분류, is_win 기준 집계
// MACD: macd_histogram > 0 이면 "golden_cross_pos", < 0 이면 "golden_cross_neg"
// 조합: AND 조건으로 두 지표 동시 hit 케이스 6종 집계
```

---

## 6. P5 — 종목 적합성 스코어링 설계

### src/app/api/stats/stocks/route.ts

```typescript
// GET /api/stats/stocks
// trade_memory 집계 (별도 테이블 불필요)
export async function GET(): Promise<Response>
// WHERE closed_at IS NOT NULL 청산 건만 집계
// GROUP BY stock_code

export interface StockStat {
  stock_code: string
  stock_name: string
  trade_count: number
  win_count: number
  win_rate: number           // 0~100
  avg_pnl: number            // 평균 손익 %
  total_pnl: number          // 총 손익 원
  fitness_score: number      // 0~100
  fitness_label: "good" | "neutral" | "poor"
  last_trade: string         // ISO 날짜
}

// fitness_score 계산
// 5건 미만 → fitness_label = "neutral" (데이터 부족), fitness_score = 50
// 5건 이상:
//   avgWin  = 수익 건 평균 pnl_percent (없으면 0)
//   avgLoss = 손실 건 평균 abs(pnl_percent) (없으면 1 — 0 나누기 방지)
//   profitFactorScore = min((avgWin / avgLoss) / 3 * 100, 100)  // PF 3 = 만점
//   sampleAdequacy    = min(trade_count / 10, 1) * 100
//   fitness_score = (win_rate * 0.5) + (profitFactorScore * 0.3) + (sampleAdequacy * 0.2)
//   fitness_label:
//     score >= 60 → "good"
//     score >= 30 → "neutral"
//     score <  30 → "poor"
```

---

## 7. P6 — 학습 현황 대시보드 설계

### src/components/stats/learning-section.tsx

```
LearningSection
├── LearningHeader
│   ├── "마지막 학습: 2026-04-07 (3일 전)"
│   ├── 신뢰도 배지: 낮음(gray) | 보통(blue) | 높음(green)
│   └── ⚠️ 만료 경고 (폴백 사용 중일 때)
│
├── ABCompareCard (base_score vs learned_score)
│   ├── trade_memory 최근 30건 평균 base_score
│   ├── trade_memory 최근 30건 평균 learned_score
│   └── "학습 가중치가 기본 대비 +12.9점 높음"
│
├── WeightBarChart
│   ├── 탭: trending | ranging
│   └── 지표별 바 (회색=기본값, 파랑=학습값 나란히)
│       RSI / MACD / 이동평균 / 볼린저 / 거래량 / 캔들패턴
│
├── AtrMultiplierRow
│   ├── 손절 배수:   2.0x → 1.7x
│   ├── 익절 배수:   3.0x → 3.4x
│   └── 트레일링:   1.5x → 1.3x
│
└── LearningHistoryTable (최근 5회)
    날짜 | 샘플수 | 승률 | 신뢰도
```

```typescript
interface LearningSectionProps {
  snapshot: LearningSnapshot | null
  isExpired: boolean
  history: LearningSnapshot[]      // GET /api/learn?history=5
  recentTrades: {                  // GET /api/stats (기존 positions 활용)
    avgBaseScore: number
    avgLearnedScore: number
    sampleCount: number
  } | null
}
```

### src/components/stats/stock-stats-section.tsx

```
StockStatsSection
├── 헤더 "종목별 성과" + 정렬 탭 [적합도순 | 수익순 | 거래수순]
└── StockStatRow (반복)
    ├── 좌: 종목명 + 코드 + last_trade 날짜
    ├── 중: 거래수 · 승률 · 평균손익 3열
    ├── 우: fitness_score 바 (0~100)
    └── poor 종목: "성과 미흡 ⚠" 주황 배지
```

---

## 8. stats-tab.tsx 변경 설계

```typescript
// 신규 데이터 소스 병렬 추가
const [learningData, setLearningData] = useState<{
  snapshot: LearningSnapshot | null
  isExpired: boolean
  history: LearningSnapshot[]
} | null>(null)
const [stockStats, setStockStats] = useState<StockStat[]>([])

// fetchStats와 병렬 실행
const [statsRes, learnRes, stocksRes] = await Promise.all([
  fetch(`/api/stats?period=${period}`),
  fetch('/api/learn?history=5'),
  fetch('/api/stats/stocks'),
])

// 렌더링 순서 — 기존 섹션 아래에 추가
// ... 기존 통계 섹션 (승률/손익/지표적중률 등) ...
<LearningSection
  snapshot={learningData?.snapshot ?? null}
  isExpired={learningData?.isExpired ?? false}
  history={learningData?.history ?? []}
  recentTrades={abScores}
/>
<StockStatsSection stats={stockStats} />
```

---

## 9. 신뢰도 등급별 학습 적용 범위

```typescript
interface AppliedLearning {
  weights: { trending: Record<string, number>; ranging: Record<string, number> } | undefined
  atrMultipliers: AtrMultipliers
  targetRiskAmount: number
  takeProfitRatio: number
}

function applyLearning(
  learned: LearningResult | null,
  config: EngineConfig
): AppliedLearning {
  const defaults: AppliedLearning = {
    weights: undefined,
    atrMultipliers: DEFAULT_ATR_MULTIPLIERS,
    targetRiskAmount: 30000,
    takeProfitRatio: config.takeProfitRatio ?? 50,
  }

  if (!learned || learned.confidence === "none") return defaults

  if (learned.confidence === "low") {
    // ATR 배수 + 포지션 사이징만 적용, 가중치·takeProfitRatio 기본값
    return {
      ...defaults,
      atrMultipliers: learned.atrMultipliers,
      targetRiskAmount: learned.positionSizing.targetRiskAmount,
    }
  }

  // medium / high: 전체 적용 (takeProfitRatio도 학습값 사용)
  // takeProfitRatio: 승률 기반 자동 조정 (승률↑ → 적게 팔고 트레일링, 승률↓ → 많이 팔아 확정)
  return {
    weights: learned.weights,
    atrMultipliers: learned.atrMultipliers,
    targetRiskAmount: learned.positionSizing.targetRiskAmount,
    takeProfitRatio: learned.risk.takeProfitRatio,
  }
}
```

---

## 10. 구현 순서 (Do 단계 참고)

```
Step 1. Supabase SQL 실행
        ① trade_memory 테이블 생성
        ② learning_snapshots 테이블 생성
        ③ 백필 SQL 실행 (positions → trade_memory)

Step 2. indicators.ts 수정
        ① AtrMultipliers 인터페이스 + DEFAULT_ATR_MULTIPLIERS 추가
        ② calcDynamicRisk() multipliers 파라미터 추가
        ③ calcPositionSize() 신규 (최소 1주 보장 포함)
        ④ extractCandlePattern() 헬퍼 신규

Step 3. learning.ts 확장
        ① LearningResult 타입 확장 (atrMultipliers, positionSizing, risk.takeProfitRatio, patternStats)
        ② learnAtrMultipliers() 추가 (0 나누기 가드 포함)
        ③ learnPositionSizing() 추가
        ④ learnRiskParamsTakeProfitRatio() 추가 (기존 learnRiskParams에서 분리)
        ⑤ learnPatternStats() 추가
        ⑥ saveLearning() 추가 (UPDATE → INSERT 순서)
        ⑦ loadLatestLearning() 추가 (만료 폴백 포함)
        ⑧ calcConfidence() 추가
        ⑨ runLearning() 확장 (기존 함수 재사용 + 신규 함수 추가)

Step 4. engine/route.ts 수정
        ① import 변경: runLearning → loadLatestLearning
        ② applyLearning() 함수 추가
        ③ 엔진 상단: loadLatestLearning() 로딩 + applyLearning() 호출
        ④ STEP 1 루프: let stopLoss 제거 → 루프 내 const 선언
        ⑤ 매수 시: A/B 병렬 계산 (baseSignal + learnedSignal)
        ⑥ 매수 시: calcPositionSize()로 qty 계산 변경
        ⑦ 매수 성공 후: recordTradeMemory() 호출
        ⑧ 청산 시: closeTradeMemory() 호출

Step 5. /api/learn 신규 + vercel.json 수정
        ① Vercel 플랜 확인 후 Cron 추가 or 옵션 B 선택

Step 6. /api/stats/stocks 신규 (Step 4와 독립, 병렬 가능)

Step 7. UI 컴포넌트 신규 + stats-tab.tsx 연결 (Step 5/6과 독립, 병렬 가능)
```

---

## 11. 설계 검증 체크리스트

**기존 코드 호환성**
- [ ] `calcDynamicRisk()` 기존 호출부 (multipliers 기본값으로 하위 호환 확인)
- [ ] `backtest.ts`에서 `learning.ts` import 여부 확인 → 있으면 LearningResult 타입 변경 영향 확인
- [ ] `bb_position`: trade_memory 저장 시 `raw.bbPosition` 그대로 사용 (`below`/`above`) 확인

**핵심 로직**
- [ ] ATR 스코프: STEP 1 루프 내 `const { stopLoss, ... }` 선언으로 종목별 독립 확인
- [ ] A/B 계산: `baseSignal = analyzeSignal()`, `learnedSignal = analyzeSignalWithWeights()` 캔들 재사용 확인
- [ ] `qty >= 1`: `calcPositionSize` 최소 1주 보장 → `Math.floor(positionSize / price) >= 1` 확인
- [ ] `learnAtrMultipliers`: `atr_value = 0` 레코드 WHERE 절로 제외 확인
- [ ] `closeTradeMemory`: buyOrder 성공 후에만 INSERT, 청산과 동일 시점 UPDATE 확인

**신뢰도 분기**
- [ ] `confidence = "none"`: 기본값 사용, 엔진 로그에 "학습 미적용" 표기
- [ ] `confidence = "low"`: ATR 배수 + 포지션 사이징만 적용, 가중치 미적용 확인
- [ ] `loadLatestLearning`: 만료 시 폴백 스냅샷 반환 + 로그 경고 출력 확인

**인프라**
- [ ] Vercel Cron 슬롯 확인 (Hobby = 2개 제한)
- [ ] `vercel.json` Cron: `0 15 * * 6` (UTC 토요일 = KST 일요일 00:00) 확인
- [ ] `saveLearning` UPDATE 실패 시 INSERT 계속 진행 (기존 스냅샷 유지 안전)
- [ ] 백필 SQL 1회 실행 후 중복 방지 (WHERE closed_at IS NOT NULL 조건으로 충분)

**UI**
- [ ] `LearningSection` props: `isExpired=true`일 때 만료 경고 배지 표시 확인
- [ ] `StockStatsSection` poor 종목 배지: `fitness_label === "poor"` 조건 확인
