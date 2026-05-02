# Trading Engine — 자동매매 엔진

[coverage: high -- 16 sources]

## Purpose

NEXIO 자동매매 엔진의 핵심 실행 모듈. GitHub Actions로 평일 하루 4회 자동 실행되며, 관심종목과 급등주 후보에 대해 신호 분석 → 포지션 평가 → 주문 실행 전 과정을 수행한다. STEP 0/1/1.5/2/3 구조로 각 단계가 순차 실행되고, 배치 병렬 패치(`batchFetch`)로 N+1 쿼리를 제거했다. 매매 체결 시마다 텔레그램으로 실시간 알림이 발송된다.

## Architecture

### 파일 구조

| 파일 | 역할 | 줄 수 |
|------|------|-------|
| `src/app/api/engine/route.ts` | 오케스트레이터 (GET 크론 핸들러, POST 수동 핸들러, `runEngine`) | 169줄 |
| `src/lib/engine/steps.ts` | STEP 0/1/1.5 실행 로직 | 356줄 |
| `src/lib/engine/steps-scan.ts` | STEP 2/3 실행 로직 (관심종목 신호 분석, 급등주 스캔) | 295줄 |
| `src/lib/engine/notify.ts` | 텔레그램 알림 (`sendTradeAlert`, `sendDailyReport`, `sendEngineErrorAlert`, `sendKISApiErrorAlert`, `sendKISConnectionAlert`) | ~175줄 |
| `src/lib/engine/types.ts` | `EngineConfig`, `EngineAction`, `StepContext`, `MarketTrend`, `KISHealthStatus`, `KISApiErrorContext` 등 | ~90줄 |
| `src/lib/engine/db.ts` | Supabase 포지션/메모리 CRUD | ~345줄 |
| `src/lib/engine/kis.ts` | KIS API 래퍼 (`getPrice`, `getDailyCandles`, `getBalance`, `sellOrder`, `limitBuyOrder`, `cancelOpenBuyOrders` 등) | - |
| `src/lib/engine/filters.ts` | 종목 안전 필터 (`hasDangerousDisclosure`, `getListingDate`, `applyStockFilter`, `applySectorFilter`) | - |
| `src/lib/engine/market.ts` | 시장·투자자 데이터 (`getMarketTrend`, `getInvestorTrend`, `scanSurgeStocks`) | - |
| `src/lib/engine/constants.ts` | 엔진 공통 상수 (보너스/패널티 점수, 임계값, Rate Limit 딜레이 등) | 52줄 |
| `src/lib/engine/intraday.ts` | VWAP·Volume Profile POC 계산 (`calcVWAP`, `calcPOC`, `calcIntradayBonus`) | 78줄 |
| `src/lib/engine/strategies.ts` | 전략 배분 로직 (`StrategyKey`, `DEFAULT_STRATEGY_ALLOCATIONS`, `normalizeStrategyAllocations`, `getStrategyBudget`) | 44줄 |
| `src/lib/engine/market-calendar.ts` | 장 시간·휴장일 판단 (`getKstNowParts`, `getMarketClosureReason`, `getEngineSkipReason`) | 121줄 |
| `src/lib/engine/utils.ts` | 배치 처리·장초반 보너스 계산 (`batchFetch`, `getOpeningBonus`) | 35줄 |
| `src/lib/engine/retry.ts` | 지수 백오프 재시도 래퍼 (`withRetry`) | 35줄 |
| `src/lib/config-validator.ts` | 필수 환경변수 검증 (`validateRequiredEnv`) | ~40줄 |

### 분리 이력

- 2026-04-17: `route.ts`(524줄)를 오케스트레이터(169줄)와 `steps.ts`(466줄)로 분리. `batchFetch`, `getOpeningBonus`, 각 Step 함수가 `steps.ts`로 이동.
- 2026-04-20: `steps.ts`(466줄)를 `steps.ts`(356줄, STEP 0/1/1.5)와 `steps-scan.ts`(295줄, STEP 2/3)로 재분리.
- 2026-05-02 (v7.1): `constants.ts`, `intraday.ts`, `strategies.ts`, `market-calendar.ts`, `utils.ts`, `retry.ts` 신규 분리. 매직 넘버를 상수 파일로 이관하고 단일 책임 원칙 준수.

### StepContext

각 Step 함수에 공통 컨텍스트를 전달하는 인터페이스:

```typescript
interface StepContext {
  config: EngineConfig;
  applied: AppliedLearning;
  maxPerTrade: number;
  maxDailyTrades: number;
  maxPositions: number;     // app_config.max_positions에서 로딩
  maxPerSector: number;     // 섹터당 최대 포지션 수 (app_config.max_per_sector, 기본 2)
  takeProfitRatio: number;
  dailyLossLimit: number;
  customWeights: { trending: Record<string, number>; ranging: Record<string, number> } | undefined;
}
```

### EngineConfig

```typescript
{
  appKey, appSecret, accountNo, token,
  stopLoss: -5,           // 기본 손절 (%) — ATR dynamicRisk 시 재계산
  takeProfit: 5,          // 기본 익절 (%) — ATR dynamicRisk 시 재계산
  trailingStop: -3,       // 기본 트레일링 (%) — ATR dynamicRisk 시 재계산
  maxPerTrade: 1000000,   // 종목당 최대 투자금 (원)
  maxDailyTrades: 5,      // 하루 최대 매매 횟수
  takeProfitRatio: 50,    // 익절 시 분할 매도 비율 (%)
  dailyLossLimit: -3,     // 일일 최대 손실 한도 (%)
  dynamicRisk: true,      // ATR 기반 동적 손절 사용 여부
  maxHoldDays: 5,         // 최대 보유 기간 (일)
  watchlist: string[],    // 관심종목 코드 목록 (Supabase watchlist 테이블)
  marketCrashThreshold?: number,  // 시장 폭락 중단 기준 등락률 (기본 -2.0%)
  trendingParams?: RegimeParams,  // 추세장 레짐 파라미터
  rangingParams?: RegimeParams,   // 횡보장 레짐 파라미터
}
```

## Trading Engine

### 트리거 방식

GitHub Actions (`engine-cron.yml`)가 평일 4회 `GET /api/engine`을 호출한다.

```
KST 09:30 → cron "30 0 * * 1-5"
KST 11:00 → cron "0 2 * * 1-5"
KST 13:00 → cron "0 4 * * 1-5"
KST 14:30 → cron "30 5 * * 1-5"
```

Vercel Cron에서 GitHub Actions로 이전된 이유: Vercel 무료 플랜의 2개 슬롯 제한을 해소하고, 실행 로그·재시도 관리를 Actions에서 통합하기 위함이다.

### GET 핸들러 (크론 실행) — v7.1 진입부 확장

v7.1부터 GET 핸들러 진입부에 검증 + 안전장치가 추가되었다. 요청/응답 인터페이스는 기존과 동일하다.

```
1. validateRequiredEnv()               ← 신규 (v7.1). 실패 시 Telegram 알림 + 즉시 500 반환
2. app_config 'engine_lock' 확인       ← 신규 (v7.1). 5분 이내 락 존재 시 skipped 반환
3. app_config 'engine_lock' 획득       ← 신규 (v7.1). ISO timestamp upsert
4. cleanupStaleSignals()               ← 기존 유지
5. cleanupStalePendingOrders()         ← 신규 (v7.1). 30분 초과 pending_orders 삭제
6. getEngineSkipReason() 확인          ← 기존 유지 (장 휴장 등)
7. resolveKisCredentials()
   └── withRetry(issueKisToken, { maxAttempts: 3, baseDelayMs: 1000 })  ← 기존 2회→3회 + 지수백오프
8. runEngine()
9. [finally] app_config 'engine_lock' = null  ← 신규 (v7.1). 정상/오류 모두 락 해제
```

**`getEngineSkipReason()` 판단 순서** (`src/lib/engine/market-calendar.ts`):
1. `engine_enabled = false` → 비상 정지 활성
2. 주말(weekday 0/6) → 주말 스킵
3. 근로자의날(5월 1일), 연말 휴장 → 휴장일 스킵
4. `market_holidays` DB 설정 키에 등록된 날짜 → 설정 휴장일 스킵
5. 장 시간(`morning_start`~`morning_end`) 범위 외 → 장 외 시간

**환경변수 검증 응답 (v7.1 신규):**
- 환경변수 누락 → `{ "error": "환경변수 검증 실패", "missing": ["TELEGRAM_BOT_TOKEN"] }` + 500
- 이미 실행 중 → `{ "skipped": true, "reason": "engine_lock: 이미 실행 중 (since: ...)" }`

기존 단계:
- `Authorization: Bearer <CRON_SECRET>` 헤더 검증 — 미설정 또는 불일치 시 즉시 401/500 반환.
- KST 장 시간 체크 — `(09:30–11:50)` 또는 `(12:50–15:10)` 범위 외이면 `skipped` 로그 후 반환.
- KIS VTS 서버에 `client_credentials` 방식으로 OAuth 토큰 발급.
- Supabase `watchlist` 테이블에서 `active=true` 종목 코드 조회.
- `runEngine(config)` 호출.

환경변수 `KIS_APP_KEY`, `KIS_APP_SECRET`에 Vercel env pull 포맷 버그로 trailing `\n`이 붙는 경우가 있으므로 `.replace(/\\n|\n/g, "").trim()` 전처리를 적용한다.

### POST 핸들러 (수동 실행)

클라이언트에서 `EngineConfig` JSON을 전송하면 `runEngine()`을 직접 실행한다. `takeProfitRatio`, `dailyLossLimit`, `dynamicRisk`, `maxHoldDays`는 전송값이 없을 경우 기본값으로 채워진다.

### batchFetch 헬퍼 (`src/lib/engine/utils.ts`)

N+1 성능 문제 해결을 위해 도입. 종목 코드 배열을 `batchSize`(기본 3)개씩 묶어 `Promise.allSettled`로 병렬 요청하고, 배치 사이에 200ms 딜레이를 삽입한다. 개별 종목 실패 시 해당 종목만 건너뛰고 나머지는 계속 진행한다.

```typescript
async function batchFetch<T>(
  codes: string[],
  fetcher: (code: string) => Promise<T>,
  batchSize = 3
): Promise<Map<string, T>>
// Promise.allSettled → 부분 실패 허용
// 배치 간 200ms delay → KIS API 요청 제한 대응
```

### runEngine() 실행 흐름

**Pre-run 1**: `app_config` 테이블 일괄 조회 (`SELECT key, value`):
- `engine_enabled = false` → `skipped: true` 즉시 반환 (비상 정지 활성)
- `max_positions` → `StepContext.maxPositions`에 전달 (기본값 5)
- `max_per_sector` → `StepContext.maxPerSector`에 전달 (기본값 2)

**Pre-run 2**: `loadLatestLearning()` → `applyLearning(learning, config)` — 신뢰도 등급별로 가중치, ATR 배수, `takeProfitRatio`, `targetRiskAmount` 파라미터를 결정한다. 학습 로딩 실패 시 기본값으로 진행.

---

**STEP 0**: `cancelOpenBuyOrders()` + `getMarketTrend()` — 병렬 실행

전 회차에 체결되지 않고 남은 지정가 매수 주문을 전량 취소한다. 동시에 KOSPI(`0001`) + KOSDAQ(`1001`) 지수 변화율을 조회하여 시장 보정 점수(`marketTrend.bonus`)를 계산한다.

시장 보정 점수 (상수: `src/lib/engine/constants.ts`):

| 시장 상황 | bonus |
|-----------|-------|
| 평균 등락률 ≥ +1.0% | +15 (`MARKET_BONUS_STRONG`) |
| 평균 등락률 ≥ +0.3% | +8 (`MARKET_BONUS_MILD`) |
| 평균 등락률 ≤ -0.3% | -10 (`MARKET_PENALTY_MILD`) |
| 평균 등락률 ≤ -1.0% | -20 (`MARKET_PENALTY_STRONG`) |

이후 추가로 3가지 동작을 수행한다:

**Signal auto-expiry**: `pending_signals` 테이블에서 `status='pending'`이면서 `created_at`이 2시간 이상 경과한 행을 `status='expired'`로 일괄 업데이트한다. Action 타입: `"signals_expired"`.

**Order fill confirmation loop**: `pending_orders` 테이블을 조회하여 각 항목에 대해 `checkOrderFill(config, orderNo, stockCode)`를 호출한다. 체결 확인 시 `pending_orders`에서 해당 행을 삭제하고 action `"order_filled"`를 기록. 미체결 상태에서 등록 후 30분 이상 경과한 경우 자동 삭제 + action `"order_cancelled_timeout"`. 각 항목 처리 사이에 200ms 딜레이를 삽입한다.

**Market crash halt**: KOSPI 등락률이 `marketCrashThreshold`(기본 -2.0%) 이하인 경우 `halted: true, haltReason`을 반환하며 엔진을 즉시 중단한다. Action 타입: `"market_crash_halt"`. 임계값은 `EngineConfig.marketCrashThreshold`로 설정 가능.

이후 `getTodayRealizedLoss()`로 당일 실현 손실을 합산하여 `dailyLossLimit`(-3%)에 도달하면 엔진을 즉시 중단한다.

---

**STEP 1**: 보유 종목 손절/익절 감시

`getBalance()`로 현재 보유 종목 목록을 조회한 뒤 각 종목별 루프를 실행한다.

- `dynamicRisk=true`이면 `getDailyCandles()` → `calcATR()` → `calcDynamicRisk(atr, price, atrMultipliers)` 순으로 동적 손절/익절/트레일링 비율을 계산한다. 캔들이 15개 미만이면 `EngineConfig` 기본값을 사용한다.
- `checkRisk(avgPrice, currentPrice, highPrice, stopLoss, takeProfit, trailingStop)`으로 청산 조건을 판단한다.
- `maxHoldDays` 초과 시 `action="hold"`여도 강제 전량 청산(`sellOrder`)한다. 청산 사유는 `max_hold`.
- 익절(`take_profit`) 조건 충족 시 **2단계 분할 매도** 방식으로 처리한다:
  - `phase='initial'` → `takeProfitRatio`%(기본 50%) 분할 매도. 이후 `updatePositionPhase(code, 'partial_tp')` 호출.
  - `phase='partial_tp'` → 추가 30% 매도. 이후 `updatePositionPhase(code, 'final_tp')` 호출.
  - `phase='final_tp'` → 익절 건너뜀 (트레일링 스탑 전용). Action 타입: `"trailing_only"`.
  - `updatePositionPhase(code, nextPhase)`는 `db.ts`에 정의되어 있다.
- 손절/트레일링 시 전량 매도.
- 청산 성공 시 `closePosition()` + `closeTradeMemory()` + `sendTradeAlert()` 순서로 실행.

---

**STEP 1.5**: 승인된 신호 매수 실행

Supabase `pending_signals` 테이블에서 `status='approved'` 행을 조회한다.

- 이미 해당 종목을 보유 중이면 `status='expired'`로 처리.
- 미보유 종목은 현재가를 조회한 후 `limitBuyOrder()`로 지정가 매수 실행.
- 매수 성공 시 `openPosition()` + `sendTradeAlert({ type: "buy" })` + `status='expired'` 처리 + `savePendingOrder()` 호출로 지정가 매수 주문을 `pending_orders` 테이블에 등록.
- `signal_data.qty_override`가 있으면 해당 수량 우선 사용. 없으면 `maxPerTrade × 0.5 / price`.

---

**STEP 2**: 관심종목 신호 분석 (매수 탐색)

`batchFetch`로 관심종목 전체의 일봉(`getDailyCandles`)과 투자자 동향(`getInvestorTrend`)을 병렬 사전 조회한다. 이미 보유 중인 종목은 제외.

각 종목별 점수 계산:

```
adjustedScore = learnedSignal.totalScore
              + openingBonus    // 장 초반 스냅샷 보너스 (getOpeningBonus, utils.ts)
              + investor.bonus  // 기관/외국인 순매수 보너스
              + marketTrend.bonus  // 시장 모멘텀 보너스
```

- `adjustedScore ≥ 70` → **strong**: 실시간 가격 조회 → 종목 필터 → 섹터 필터 → DART 공시 필터 → `limitBuyOrder()` → `openPosition()` + `recordTradeMemory()` + `sendTradeAlert({ type: "buy" })` + `savePendingOrder()`
- `adjustedScore 40–69` → **weak**: `pending_signals` 테이블에 INSERT (`status='pending'`, 관리자 승인 대기)
- `adjustedScore < 40` → 신호 없음, 스킵

이미 포지션이 있고 `phase='initial'`인 종목에 strong 신호가 재발생하면 `buyRatio=1`로 2차(full) 매수를 실행한다.

---

**STEP 3**: KOSPI + KOSDAQ 급등주 스캔

`scanSurgeStocks()`가 등락률 상위(전일 대비 +3% 이상) + 거래량 상위 종목을 KIS 랭킹 API(`FHPST01700000`)에서 각 시장별 최대 20개+15개씩 수집한다. 이미 보유 중이거나 관심종목에 포함된 코드는 제외.

STEP 2와 동일한 `batchFetch` + strong/weak 판정 로직을 적용한다. strong 매수 시 `positionSize × 0.5 / price`로 1차 매수만 실행. snapshot 보너스는 적용하지 않는다. 매수 성공 시 `sendTradeAlert({ type: "surge_buy" })` + `savePendingOrder()`.

---

**완료**: `logEngineRun(tradeCount, actions, scannedCount, durationMs)`로 실행 기록 저장 후 결과 JSON 반환.

## Signal System

신호 점수는 `analyzeSignal(candles)`(기본 가중치)와 `analyzeSignalWithWeights(candles, learnedWeights)`(학습 가중치)를 병렬 계산하여 둘 다 `trade_memory`에 저장(A/B 비교용)한다. 매수 결정 기준은 `learnedSignal.totalScore`이며, `customWeights`가 없으면 `baseSignal`을 그대로 사용한다.

### 장 초반 스냅샷 보너스 (Opening Snapshot Bonus, `src/lib/engine/utils.ts`)

당일 KST 09:00경에 저장된 `market_snapshots` 테이블을 기준으로 계산한다.

```
gap = (snapshot_price - open_price) / open_price
```

상수는 `src/lib/engine/constants.ts`에서 임포트된다:

| 조건 | bonus | 상수 |
|------|-------|------|
| gap > 1% AND 거래량 > 50,000주 | +15 | `OPENING_BONUS_STRONG` |
| gap > 0.5% | +8 | `OPENING_BONUS_MILD` |
| gap < -1% | -10 | `OPENING_PENALTY_MILD` |
| gap < -2% | -20 | `OPENING_PENALTY_STRONG` |

### 투자자 동향 보너스

상수는 `src/lib/engine/constants.ts`:

| 조건 | bonus | 상수 |
|------|-------|------|
| 기관 + 외국인 동반 순매수 | +25 | `INVESTOR_BONUS_BOTH` |
| 기관 순매수만 | +15 | `INVESTOR_BONUS_ORGN` |
| 외국인 순매수만 | +10 | `INVESTOR_BONUS_FRGN` |
| 기관 + 외국인 동반 순매도 | -25 | `INVESTOR_PENALTY_BOTH` |
| 기관 순매도만 | -15 | `INVESTOR_PENALTY_ORGN` |
| 외국인 순매도만 | -10 | `INVESTOR_PENALTY_FRGN` |

### 종목 필터 (applyStockFilter)

강한 신호(`strong`) 종목에만 적용. 하나라도 실패하면 `filtered_out`으로 기록되고 매수하지 않는다.

| 조건 | 기준 |
|------|------|
| 시가총액 | 500억 원 이상 |
| 시장 경고 | 00(정상)만 허용. 투자주의/경고/위험 제외 |
| 정리매매 | `sltr_yn=Y` 제외 |
| 상장 기간 | 상장 후 1년 이상 |

### 섹터 필터 (applySectorFilter, `src/lib/engine/filters.ts`)

v6.2 설계 기준 (`docs/02-design/features/sector-limit.design.md`). 동일 업종 집중 리스크를 방지한다.

```typescript
export function applySectorFilter(
  sector: string | null,
  sectorCounts: Map<string, number>,
  maxPerSector: number
): FilterResult
```

- 섹터 정보: `getPrice()` 응답의 `bstp_kor_isnm` (업종명) 사용
- 섹터 저장: `positions.sector` 컬럼 (TEXT, NULL 허용)
- 기본 제한: 섹터당 최대 2종목 (`app_config.max_per_sector`)
- N+1 방지: STEP 시작 시 `getSectorCounts()`로 1회 조회 후 Map 캐싱
- 섹터 NULL인 포지션(기존 포지션)은 카운트에서 제외 (하위 호환)

### DART 공시 필터 (hasDangerousDisclosure)

최근 30일 공시에 위험 키워드가 포함된 종목은 매수하지 않는다.

위험 키워드: `유상증자`, `전환사채`, `신주인수권`, `감사의견 거절`, `감사의견 한정`, `영업정지`, `상장폐지`, `횡령`, `배임`, `불성실공시`

`DART_API_KEY` 환경변수가 없으면 필터를 건너뛴다(통과 처리).

## Adaptive Learning Engine

학습 엔진과의 연동 방식:

1. 엔진 시작 시 `loadLatestLearning()`으로 최신 `learning_snapshots` 행을 조회.
2. `applyLearning(learning, config)`이 신뢰도 등급에 따라 적용 범위를 결정.

| 신뢰도 | 샘플 수 | 적용 범위 |
|--------|---------|----------|
| none | 10건 미만 | 기본값 전체 사용 |
| low | 10–29건 | ATR 배수 + 포지션 사이징만 |
| medium | 30–49건 | 가중치 + ATR 배수 + takeProfitRatio 포함 |
| high | 50건 이상 | 전체 적용 |

3. 매수 실행 후 `recordTradeMemory()`에 `base_score`, `learned_score`, `total_score`, `market_bonus`, `investor_bonus`, `snapshot_bonus`, `weights_source`, ATR 값, 포지션 크기를 저장.
4. 청산 후 `closeTradeMemory()`에 손익, 보유일, 청산 사유, `is_win` 기록.
5. 별도 `POST /api/learn` 엔드포인트에서 `trade_memory` 데이터를 분석해 새 가중치를 `learning_snapshots`에 저장. 엔진 자체에서는 학습(`runLearning()`)을 실행하지 않는다.

## Order Management

### 매수 주문 방식

시장가 매수(`buyOrder`, `ORD_DVSN=01`)는 사용하지 않는다. 모든 매수는 **지정가**(`limitBuyOrder`, `ORD_DVSN=00`)로 현재가 -0.5% 호가 단위 반올림 가격을 사용한다.

```typescript
limitPrice = roundToTick(currentPrice * LIMIT_BUY_DISCOUNT)  // LIMIT_BUY_DISCOUNT = 0.995
```

`roundToTick`은 KRX 호가 단위 규정을 준수한다:

| 가격 범위 | 호가 단위 |
|-----------|----------|
| 1,000원 미만 | 1원 |
| 1,000–4,999원 | 5원 |
| 5,000–9,999원 | 10원 |
| 10,000–49,999원 | 50원 |
| 50,000–99,999원 | 100원 |
| 100,000–499,999원 | 500원 |
| 500,000원 이상 | 1,000원 |

### 분할 매수 시스템

| 단계 | 조건 | 비율 |
|------|------|------|
| 1차 (initial) | 신규 strong 신호 | `calcPositionSize() × 0.5 / price` |
| 2차 (full) | 기존 `phase='initial'` 포지션에 재신호 | `calcPositionSize() × 1.0 / price` |

`openPosition()` 호출 시 `phase` 인자로 `"initial"` 또는 `"full"`을 전달한다. 2차 매수 시에는 `recordTradeMemory()`를 다시 호출하지 않는다.

### 매도 주문

매도는 시장가(`sellOrder`, `ORD_DVSN=01`)를 사용한다. 익절 시 `takeProfitRatio`(기본 50%)만큼만 분할 매도 후 나머지 포지션은 유지한다. 손절/트레일링/최대 보유 기간 초과 시 전량 청산한다.

### 일일 손실 한도

`getTodayRealizedLoss()`가 당일 `positions` 테이블에서 `status='closed'` 행의 `pnl_percent` 합계를 계산한다. 합계가 `dailyLossLimit`(-3%) 이하이면 `runEngine()`이 STEP 0 직후 즉시 중단된다.

## Position Sizing

ATR 기반 변동성 역비례 포지션 사이징:

```
positionSize = targetRiskAmount / (atr × stopMultiplier / currentPrice)
상한: Math.min(positionSize, maxPerTrade)
하한: Math.max(result, currentPrice)  // 최소 1주 보장
```

- `targetRiskAmount`: 학습 엔진이 최적화. 기본값은 `learning.ts`의 DEFAULT 상수.
- `stopMultiplier`: `atrMultipliers.stop` (기본 2.0, 학습으로 최적화).
- ATR이 높을수록(변동성 큼) 투자금이 작아져 종목 간 손실 금액이 균일해진다.

급등주 스캔(STEP 3) 매수 시에는 산출된 `positionSize × 0.5`로 축소하여 1차 매수만 실행한다.

## Data & Database

### Supabase 테이블

| 테이블 | 용도 |
|--------|------|
| `positions` | 오픈/청산 포지션 기록. `entry_date`, `entry_price`, `entry_qty`, `phase`, `status`, `pnl_amount`, `pnl_percent`, `hold_days`, `exit_reason`, `sector` (v6.2 추가) |
| `trade_memory` | 매매 신호 상세 기록. `rsi_value`, `macd_histogram`, `ma_cross`, `bb_position`, `volume_ratio`, `adx_value`, `candle_pattern`, `regime`, `base_score`, `learned_score`, `total_score`, `market_bonus`, `investor_bonus`, `snapshot_bonus`, `weights_source`, `atr_value`, `position_size`, `pnl_percent`, `pnl_amount`, `hold_days`, `exit_reason`, `is_win`, `closed_at` |
| `pending_signals` | weak 신호 승인 대기 목록. `status`: `pending` → `approved` / `expired` |
| `watchlist` | 관심종목 코드 (`active=true` 조건으로 조회) |
| `market_snapshots` | 장 초반(09:00경) 가격·거래량 스냅샷. `date`, `stock_code`, `open_price`, `snapshot_price`, `snapshot_volume` |
| `engine_runs` | 실행 로그. `trade_count`, `scanned_count`, `duration_ms`, `actions`, `error` |
| `learning_snapshots` | 자가학습 결과 스냅샷 |
| `app_config` | 동적 엔진 제어 (`engine_enabled`, `max_positions`, `engine_lock`, `max_per_sector` 등) |

### 포지션 조회 순서

`closePosition()`에서 동일 종목의 오픈 포지션이 여러 개일 경우 `entry_date` 오름차순(가장 오래된 것 먼저) FIFO 방식으로 청산한다.

## 신규 모듈

### src/lib/engine/constants.ts (v7.1 신규)

엔진 전체에서 사용되는 매직 넘버를 상수로 통합 관리. 주요 상수 목록:

```typescript
export const END_OF_DAY_TIME = 1500;          // 장 마감 기준 시각 (HHMM)
export const APPROVED_BUY_RATIO = 0.5;        // 승인 신호 매수 비율
export const SECOND_TP_RATIO = 30;            // 2차 익절 비율 (%)
export const LIMIT_BUY_DISCOUNT = 0.995;      // 지정가 매수 할인율
export const KIS_RATE_LIMIT_DELAY_MS = 200;   // KIS API 호출 간격 (ms)
// 투자자 동향 보너스/패널티 상수 (INVESTOR_BONUS_BOTH 등)
// 장초반 스냅샷 보너스/패널티 상수 (OPENING_BONUS_STRONG 등)
// 시장 지수 보너스/패널티 상수 (MARKET_BONUS_STRONG 등)
```

### src/lib/engine/intraday.ts (v7.1 신규)

분봉 데이터 기반 장중 지표 계산. 아직 엔진 메인 루프에 통합되지 않은 확장 예정 모듈.

```typescript
// VWAP 계산: (가격×거래량) 누적합 / 거래량 누적합
export function calcVWAP(candles: MinuteCandle[]): number

// Volume Profile POC: 가장 많이 거래된 가격대
export function calcPOC(candles: MinuteCandle[]): number

// 장중 보너스 점수: VWAP 하방(저평가) +15/+10, POC 근처(지지선) +8/+5
// VWAP 상방(과열) -10/-15
export function calcIntradayBonus(price, vwap, poc): { bonus: number; label: string }
```

### src/lib/engine/strategies.ts (v7.1 신규)

전략 배분(Strategy Allocations) 관리. 3개 전략에 예산을 배분한다.

```typescript
export const STRATEGY_KEYS = ["watchlist_pullback", "surge_momentum", "institutional_follow"] as const;

export const DEFAULT_STRATEGY_ALLOCATIONS: StrategyAllocations = {
  watchlist_pullback: 40,    // 관심종목 눌림목 전략 40%
  surge_momentum: 25,        // 급등 모멘텀 전략 25%
  institutional_follow: 35,  // 기관 순매수 추종 전략 35%
};

// 배분값 정규화 (합이 100%가 되도록)
export function normalizeStrategyAllocations(raw): StrategyAllocations

// 전략별 예산 계산: maxPerTrade × allocationPct / 100
export function getStrategyBudget(maxPerTrade, allocationPct): number
```

### src/lib/engine/market-calendar.ts (v7.1 신규)

KST 시간 계산과 장 시간/휴장일 판단 로직 분리.

```typescript
// KST 현재 시각 분해: date, year, month, day, weekday, hour, minute, hhmm
export function getKstNowParts(now?): KstNowParts

// 장 마감 이유 반환 (주말/공휴일/설정 휴장일 포함)
export function getMarketClosureReason(cfgMap, now?): string | null

// 엔진 스킵 이유 반환 (비상 정지 + 장 마감 + 장 시간 외)
export function getEngineSkipReason(cfgMap, now?): string | null
```

내장 휴장일: 근로자의날(5/1), 연말 휴장(12월 마지막 평일). 추가 공휴일은 `app_config.market_holidays` DB 키에 `YYYY-MM-DD` 배열 또는 CSV로 등록.

### src/lib/config-validator.ts (신규, P0)

엔진 가동 전 필수 환경변수 검증. `validateRequiredEnv()` 함수 하나만 export한다.

```typescript
const REQUIRED_ENV_GROUPS = {
  supabase:  ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  auth:      ['CRON_SECRET', 'ADMIN_SECRET', 'ADMIN_PASSWORD'],
  telegram:  ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
} as const;

// KIS 환경변수는 DB(kis_config)로 대체 가능 → 경고(warn)만
const WARN_ENV_GROUPS = {
  kis: ['KIS_APP_KEY', 'KIS_APP_SECRET', 'KIS_ACCOUNT_NO'],
} as const;

interface ConfigValidationResult {
  ok: boolean;        // required 그룹 전부 통과 시 true
  missing: string[];  // 누락된 필수 환경변수 이름 목록
  warnings: string[]; // warn 그룹 누락 (오류 아님, 로그만)
}
```

**동작 규칙**: `missing`에 항목이 하나라도 있으면 `ok = false`. `ok = false` 시 호출부에서 Telegram 알림 + 즉시 종료. Telegram env 자체가 누락된 경우 `console.error`로 폴백.

### src/lib/engine/retry.ts (신규, P1)

지수 백오프 재시도 래퍼. KIS 토큰 발급 등 핵심 네트워크 호출에만 적용한다.

```typescript
interface RetryOptions {
  maxAttempts: number;   // default: 3
  baseDelayMs: number;   // default: 1000 (ms)
  maxDelayMs: number;    // default: 10000 (ms)
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T>
```

**백오프 계산식**: `delay = min(baseDelayMs × 2^(attempt - 1), maxDelayMs)`
- attempt 1 → 즉시 실행
- attempt 2 → 1초 후 재시도
- attempt 3 → 2초 후 재시도
- 모든 시도 실패 시 마지막 에러를 throw

## API Endpoints

### GET /api/engine

크론/GitHub Actions용 자동 실행 엔드포인트.

- **인증**: `Authorization: Bearer <CRON_SECRET>` 필수 (환경변수 미설정 시 500 반환)
- **장 외 시간**: `skipped: true` 응답 후 정상 종료
- **성공 응답**: `{ timestamp, tradeCount, scannedCount, durationMs, actions, learning }`
- **일일 손실 한도 도달 시**: `{ halted: true, reason: "일일 손실 한도 X%" }`

### POST /api/engine

대시보드에서 수동 실행용. `EngineConfig` JSON을 요청 본문으로 전송.

- **인증**: 없음 (클라이언트 세션에 의존)
- `token`, `accountNo` 필드 필수

## Key Decisions

**지정가 매수 채택**: 시장가 매수는 슬리피지 위험이 있어 현재가 -0.5% 지정가로 변경. 미체결 주문은 다음 실행 시 STEP 0에서 전량 취소되므로 오래된 주문이 쌓이지 않는다.

**GitHub Actions로 크론 이전**: Vercel 무료 플랜의 2개 크론 슬롯이 이미 다른 기능에 사용 중이어서 Actions로 이전. 4개 슬롯을 자유롭게 사용하고 실행 로그를 Actions UI에서 확인할 수 있다.

**`steps.ts` 분리 (2026-04-17)**: `route.ts`가 524줄로 500줄 원칙을 위반. 오케스트레이터(`route.ts`, 169줄)와 스텝 실행 로직(`steps.ts`, 466줄)으로 분리.

**`steps.ts` 재분리 (2026-04-20)**: STEP 0/1/1.5와 STEP 2/3의 책임을 명확히 분리. `steps.ts`(356줄)는 주문 관리·포지션 감시 역할, `steps-scan.ts`(295줄)는 종목 탐색·매수 신호 분석 역할.

**유틸리티 분리 (2026-05-02, v7.1)**: 매직 넘버를 `constants.ts`로, 장 시간 판단을 `market-calendar.ts`로, 배치 처리를 `utils.ts`로, 전략 배분을 `strategies.ts`로, VWAP/POC를 `intraday.ts`로 분리. 단일 책임 원칙 및 테스트 가능성 향상.

**`notify.ts` 알림 강화 (2026-05-02, v6.1)**: KIS API 오류 무음 처리 제거 목적으로 `sendKISApiErrorAlert`, `sendKISConnectionAlert` 함수 추가. 알림 메시지에 `appKey`/`appSecret`/`token` 절대 포함 금지.

**v7.1 신뢰 시스템 (2026-05-02)**: `GET /api/engine` 진입부에 4개 안전장치 추가:
1. `validateRequiredEnv()` — 필수 환경변수(supabase, auth, telegram) 누락 시 Telegram 알림 후 즉시 500 반환
2. `engine_lock` 5분 TTL 락 — 비정상 종료(Vercel timeout) 시 자동 만료. 정상 종료 시 try-finally 블록에서 `null`로 해제
3. `cleanupStalePendingOrders()` — 30분 초과 `pending_orders` 레코드 일괄 삭제
4. `withRetry(issueKisToken, { maxAttempts: 3 })` — 기존 2회 재시도를 3회 지수 백오프로 교체

**GAP 분석 (2026-05-02, nexio.analysis.md)**: v7.1 설계 대비 구현 97% 일치. 발견된 Gap:
- GAP-02 (보안, 즉시 수정 권고): `price/route.ts:22` — 500 에러에 `e.message` 그대로 노출, `"시세 조회 실패"` 고정 메시지로 교체 필요
- GAP-03 (경미): `engine/route.ts` — `getEngineSkipReason` 이중 호출, `app_config` 이중 조회 (기능 오류 없음)

**`batchFetch` 도입**: STEP 2/3에서 관심종목 수 × 2회 개별 API 호출이 발생하는 N+1 패턴을 제거. 3개씩 병렬 + 200ms 딜레이로 KIS API Rate Limit에 대응.

**분할 매수 (1차/2차)**: 신호 초기 확인 시 50% 포지션 진입 후, 재확인 시 나머지 추가 매수하여 진입 비용을 분산한다. `positions.phase` 컬럼으로 현재 단계를 추적한다.

**일일 손실 한도 (-3%)**: 연속 손절로 인한 계좌 급격한 손상을 방지. 당일 실현 손실 합계가 -3% 도달 시 당일 신규 매수를 전면 중단한다.

## Gotchas

- `CRON_SECRET`은 선택이 아닌 필수. 미설정 시 GET 핸들러가 500을 반환하여 GitHub Actions 워크플로우가 실패한다. GitHub Secrets와 Vercel 환경변수 양쪽에 동일한 값을 설정해야 한다.
- **v7.1 환경변수 검증**: `validateRequiredEnv()`는 엔진 진입 즉시 실행된다. `TELEGRAM_BOT_TOKEN`이 누락되면 Telegram 알림을 보낼 수 없으므로 `console.error`로 폴백한다. 응답의 `missing` 배열에는 변수명만 포함되며 실제 값은 절대 포함하지 않는다.
- **engine_lock TTL**: Vercel 서버리스 함수가 타임아웃으로 비정상 종료해도 `engine_lock`이 5분 내에 자동 만료된다. 다음 Cron 실행이 5분 이후면 정상 진입 가능하다.
- **withRetry 적용 범위**: `withRetry`는 `issueKisToken` 호출에만 적용한다. 일반 조회 API에 적용하면 타임아웃 누적으로 Vercel 함수 실행 시간 초과 위험이 있다.
- **constants.ts 임포트**: 보너스 점수 매직 넘버를 코드에 직접 쓰지 말고 반드시 `constants.ts`에서 임포트한다. 파일 내부에 중복 상수 정의 금지.
- **intraday.ts 미통합**: VWAP/POC 계산 함수는 구현되어 있으나 현재 엔진 메인 루프(STEP 2/3)에는 아직 연결되지 않았다. 향후 분봉 데이터 취득 후 `adjustedScore`에 추가 예정.
- KIS API 환경변수에 trailing `\n`이 포함될 수 있다 (Vercel env pull 버그). `route.ts`의 GET 핸들러에서 이를 `.trim()` 처리한다.
- `runLearning()`을 엔진 내에서 직접 호출하지 않는다. 반드시 `loadLatestLearning()`으로 사전 저장된 스냅샷을 로딩해야 한다.
- `getDailyCandles()`는 최소 26개 이상의 캔들이 있어야 신호 분석을 실행한다 (MACD 계산 요건). 26개 미만이면 해당 종목을 건너뛴다. ATR 동적 손절은 15개 이상이면 적용된다.
- `batchFetch`는 `Promise.allSettled`를 사용하므로 개별 종목 API 실패가 전체 엔진을 멈추지 않는다.
- `closePosition()`은 동일 종목 오픈 포지션이 여러 개일 때 가장 오래된 것부터 처리한다. 분할 매수로 인해 `initial` + `full` 포지션이 공존할 경우 양쪽 모두 청산하지 않으므로, 현재 청산 로직은 1개 행만 업데이트한다.
- `market_snapshots`가 없는 종목(스냅샷 저장 실패 또는 관심종목 외 급등주)은 `openingBonus=0`으로 처리되어 점수에 영향을 주지 않는다.
- `sendTradeAlert()` 내부의 알림 실패(`fetch` 오류)는 `catch {}`로 조용히 무시된다. 텔레그램 서버 장애 시에도 엔진 실행은 정상 진행된다.
- `notify.ts`는 서버 전용 모듈이다. 클라이언트 store(`store.ts`)에서 직접 호출하면 서버/클라이언트 경계 위반이다.
- `engine_enabled = false` 체크는 `getEngineSkipReason()`에서 수행된다. 장 시간 체크 이전, KIS 토큰 발급 이전에 실행된다.
- **G1 주의**: `store.ts`의 `startHealthPolling()`은 현재 첫 `poll()` 실행이 60초 지연됨. 앱 시작 직후 `kisHealthLastChecked`와 `kisLatencyMs`가 60초간 null로 유지된다.

## Sources

- `src/app/api/engine/route.ts` (오케스트레이터)
- `src/lib/engine/steps.ts` (STEP 0/1/1.5 실행 로직)
- `src/lib/engine/steps-scan.ts` (STEP 2/3 실행 로직)
- `src/lib/engine/notify.ts` (텔레그램 알림)
- `src/lib/engine/types.ts`, `db.ts`, `kis.ts`, `filters.ts`, `market.ts`
- `src/lib/engine/constants.ts` (엔진 공통 상수)
- `src/lib/engine/intraday.ts` (VWAP·POC 장중 지표)
- `src/lib/engine/strategies.ts` (전략 배분)
- `src/lib/engine/market-calendar.ts` (장 시간·휴장일 판단)
- `src/lib/engine/utils.ts` (batchFetch, getOpeningBonus)
- `src/lib/engine/retry.ts` (지수 백오프 재시도)
- `src/lib/config-validator.ts` (필수 환경변수 검증)
- `.github/workflows/engine-cron.yml`
- `docs/01-plan/features/nexio.plan.md` (v7.1 신뢰 시스템)
- `docs/02-design/features/nexio.design.md` (v7.1 설계서)
- `docs/03-analysis/nexio.analysis.md` (v6.1 GAP 분석)
- `docs/02-design/features/sector-limit.design.md` (v6.2 섹터 분산 제한 설계)
- `docs/operations/engine-runbook.md`
- `docs/operations/runtime-risks.md`
