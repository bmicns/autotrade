# Order Management — 주문 관리

[coverage: high -- 7 sources]

## Purpose

KIS(한국투자증권) 모의투자 API를 통해 실제 주식 주문을 실행하고, 포지션 보유 중 청산 조건을 판단하며, 수동/자동 매수 경로를 통합 관리하는 시스템. 엔진 실행 사이클(크론 호출)과 UI 즉시매수 경로가 완전히 분리되어 있으며, 보안 설계상 클라이언트가 KIS 자격증명을 직접 다루지 않는다.

---

## Architecture

주문 관련 코드는 두 레이어로 나뉜다.

| 레이어 | 파일 | 역할 |
|--------|------|------|
| 저수준 KIS 클라이언트 | `src/lib/kis/api.ts` | `placeOrder`, `getBalance`, `getOrderHistory` 등 범용 래퍼 |
| 엔진 전용 KIS 래퍼 | `src/lib/engine/kis.ts` | `limitBuyOrder`, `sellOrder`, `cancelOpenBuyOrders`, `roundToTick` |
| UI 즉시매수 API | `src/app/api/kis/order/route.ts` | 관리자 대시보드 → 즉시 단건 주문 |
| 수동 매수 예약 API | `src/app/api/manual-buy/route.ts` | 관리자가 지정한 종목을 `pending_signals`에 `approved` 상태로 삽입 |
| 엔진 오케스트레이터 | `src/app/api/engine/route.ts` | STEP 0~3 전체 실행, 위 함수들을 조합 |

`src/lib/kis/client.ts`는 UI 레이어에서 Next.js API Route를 통해 간접 호출하는 클라이언트 사이드 헬퍼다(`/api/kis/price`, `/api/kis/balance` 프록시 경유). 직접 KIS API를 호출하지 않는다.

---

## Trading Engine — 주문 실행 단계

엔진은 크론 호출 시 `runEngine(config)`를 실행하며, 순서대로 아래 STEP을 처리한다.

### STEP 0 — 미체결 주문 체결 확인 + 타임아웃 취소 + 시장 모멘텀 수집

이전 사이클에서 발행된 지정가 매수 주문의 체결 여부를 `pending_orders` 테이블을 기반으로 확인하고, 미체결 주문을 처리한다. 시장 모멘텀(`getMarketTrend`) 수집 및 시장 급락 감지도 함께 수행한다.

**시장 급락 차단 (`marketCrashThreshold`, 기본 -2.0%)**:
KOSPI 등락률이 `config.marketCrashThreshold` 이하이면 `halted: true`를 반환하고 엔진 전체를 중단한다. 이후 모든 신규 매수 주문이 스킵된다.

**`pending_orders` 체결 확인 흐름**:
1. `getPendingOrders()` — `pending_orders` 테이블에서 미처리 주문 목록 조회
2. 각 주문에 대해 `checkOrderFill(config, orderNo, stockCode)` 호출
   - KIS `VTTC8001R`(`inquire-daily-ccld`) API로 체결 여부 조회
   - 반환: `{ filled: boolean, filledQty: number, filledPrice: number }`
3. 체결된 경우: `deletePendingOrder(order.id)` + action `"order_filled"` 기록
4. 미체결 + 생성 후 30분 경과: `deletePendingOrder(order.id)` + action `"order_cancelled_timeout"` 기록

**기존 미체결 매수 취소 (`cancelOpenBuyOrders`)**:

```typescript
const [cancelResult, marketTrend] = await Promise.all([
  cancelOpenBuyOrders(config),
  getMarketTrend(config),
]);
```

`cancelOpenBuyOrders` 내부 흐름:
1. `getOpenBuyOrders(config)` — `inquire-psbl-rvsecncl` API, `SLL_BUY_DVSN_CD: "02"` (매수만)
2. `rmn_qty > 0`인 주문만 선별
3. `order-rvsecncl` API로 취소 (`RVSE_CNCL_DVSN_CD: "02"`, `QTY_ALL_ORD_YN: "Y"`)
4. 주문 간 200ms 딜레이 (KIS API 초당 호출 제한 방어)
5. 반환: `{ cancelled: number, failed: number }`

### STEP 1 — 보유 종목 청산 감시

`getBalance(config)`로 `output1`(보유 종목 목록)을 조회한 후, 각 종목에 대해 손절/익절/트레일링스탑/최대보유기간 조건을 평가한다.

**청산 조건 및 매도 방식:**

| 조건 | exit_reason | 매도 수량 | 함수 |
|------|-------------|----------|------|
| 손절 (stop_loss) | `stop_loss` | 전량 | `sellOrder` (시장가) |
| 익절 (take_profit) | `take_profit` | phase별 분할 (아래 참조) | `sellOrder` (시장가) |
| 트레일링 스탑 | `trailing_stop` | 전량 | `sellOrder` (시장가) |
| 최대 보유 기간 초과 | `max_hold` | 전량 | `sellOrder` (시장가) |

**2단계 익절 (2-stage take profit)**:

익절은 포지션의 `phase` 값에 따라 단계적으로 실행된다.

| phase | 동작 | 다음 phase |
|-------|------|-----------|
| `initial` | 보유 수량의 `takeProfitRatio`% 매도 | → `partial_tp` |
| `partial_tp` | 추가 30% 매도 | → `final_tp` |
| `final_tp` | `take_profit` 액션 없음 — 트레일링 스탑만 작동 | — |

```typescript
if (risk.action === "take_profit") {
  if (position.phase === "initial") {
    sellQty = Math.max(1, Math.floor(qty * takeProfitRatio / 100));
    // phase → "partial_tp"
  } else if (position.phase === "partial_tp") {
    sellQty = Math.max(1, Math.floor(qty * 0.30));
    // phase → "final_tp"
  }
  // phase === "final_tp": take_profit 스킵, trailing_stop만 적용
}
```

최대 보유 기간(`maxHoldDays`, 기본 5일) 초과 시 `risk.action === "hold"`여도 강제 청산한다.

청산 성공 시 `closePosition()` + `closeTradeMemory()` 호출로 DB 상태를 동기화한다.

**일일 손실 한도 (`dailyLossLimit`, 기본 -3%)**: STEP 0 직후 `getTodayRealizedLoss()`를 조회하여, 당일 실현 손실이 한도를 초과하면 엔진 전체를 중단(`halted: true` 반환)한다.

### STEP 1.5 — 승인된 신호 매수 실행

`pending_signals` 테이블에서 `status='approved'`인 레코드를 조회하여 `limitBuyOrder`를 실행한다.

```typescript
const { data: approvedSignals } = await supabase
  .from("pending_signals")
  .select("*")
  .eq("status", "approved");
```

수량 결정 우선순위:
1. `signal_data.qty_override`가 있으면 해당 값 사용
2. 없으면 `Math.floor((maxPerTrade * 0.5) / price)` (기본 예산의 50%)

실행 결과와 무관하게 처리 후 `status → "expired"`, `resolved_at` 기록.

이미 해당 종목을 보유 중이면 매수 없이 `expired` 처리.

### STEP 2 — 관심종목 (Watchlist) 신호 분석 및 매수

watchlist 종목 중 미보유 종목에 대해 신호 분석 후 `adjustedScore`를 계산한다.

**매수 트리거**: `adjustedScore >= 70` (strong) + `side === "buy"`

**포지션 사이징 (분할 매수)**:
```typescript
const existingPos = await getOpenPosition(code);
const buyRatio = existingPos?.phase === "initial" ? 1 : 0.5;
const positionSize = calcPositionSize(atr, price, targetRiskAmount, maxPerTrade, atrStop);
const qty = Math.floor((positionSize * buyRatio) / price);
```
- `phase === "initial"` (신규 진입): `buyRatio=1` → 계산된 포지션 전액
- 이미 포지션 보유 (`phase !== "initial"` or "full"): `buyRatio=0.5` → 반액 추가 매수

**약한 신호 처리** (`adjustedScore >= 40`): `pending_signals` 테이블에 `status="pending"` 삽입. 관리자 승인 후 STEP 1.5에서 실행된다.

### STEP 3 — 급등주 스캔 매수

KOSPI/KOSDAQ 전체에서 급등 종목(`scanSurgeStocks`)을 스캔하여 watchlist와 동일한 신호 분석을 적용한다. 단, 급등주는 변동성이 높으므로 분할 매수 비율을 **0.5 고정**으로 제한한다.

```typescript
const qty = Math.floor((surgePositionSize * 0.5) / price);
```

급등주도 동일하게 `applyStockFilter` + `hasDangerousDisclosure` 필터를 통과해야 주문이 실행된다.

---

## Signal System — 신호와 주문의 연결

| 신호 강도 | adjustedScore | 주문 경로 |
|----------|---------------|----------|
| strong | ≥ 70 | 즉시 `limitBuyOrder` 실행 |
| weak | 40–69 | `pending_signals` 저장 → 관리자 승인 대기 |
| none | < 40 | 무시 |

`adjustedScore = learnedSignal.totalScore + openingBonus + investor.bonus + marketTrend.bonus`

보정 요소:
- `openingBonus`: 장 초반 스냅샷 기반 갭 보정 (+15, +8, -10, -20)
- `investor.bonus`: 기관/외국인 순매수 보정
- `marketTrend.bonus`: KOSPI/KOSDAQ 시장 흐름 보정

---

## Adaptive Learning Engine — 학습과 주문의 연동

엔진 실행 시 `loadLatestLearning()` → `applyLearning(learning, config)`를 통해 학습된 파라미터를 주문 로직에 반영한다.

주문에 영향을 주는 학습 파라미터:
- `atrMultipliers.stop`: `calcPositionSize` 내부에서 포지션 사이징에 사용
- `targetRiskAmount`: ATR 기반 리스크 허용 금액 (동적 포지션 사이징)
- `takeProfitRatio`: 익절 시 분할 매도 비율
- `weights`: 신호 지표 가중치 → `analyzeSignalWithWeights`에 전달

학습 데이터가 없거나 신뢰도가 낮으면 기본값으로 fallback한다.

---

## Order Management — 핵심 함수 레퍼런스

### `limitBuyOrder(config, code, qty, currentPrice)`

지정가 매수. 현재가의 0.5% 아래로 호가를 설정한다.

```typescript
const limitPrice = roundToTick(currentPrice * 0.995);
// ORD_DVSN: "00" (지정가)
```

반환: `{ success, msg, ordNo, raw, limitPrice }`

슬리피지를 최소화하면서도 즉시 체결 가능성을 높이기 위해 -0.5% 디스카운트를 사용한다. 주문 성공 시 `savePendingOrder()`가 호출되어 `pending_orders` 테이블에 기록된다. 다음 사이클 STEP 0에서 체결 여부를 확인하며, 30분 이상 미체결 시 타임아웃 처리된다.

### `checkOrderFill(config, orderNo, stockCode)`

KIS `VTTC8001R`(`inquire-daily-ccld`) API를 사용하여 특정 주문 번호의 체결 여부를 확인한다.

반환: `{ filled: boolean, filledQty: number, filledPrice: number }`

STEP 0에서 `pending_orders` 테이블의 각 미처리 주문에 대해 호출된다.

### `roundToTick(price)` — KRX 호가 단위 조정

KRX 규정에 따라 주문가격을 호가 단위로 반올림한다.

| 주가 범위 | 호가 단위 |
|----------|----------|
| < 1,000원 | 1원 |
| < 5,000원 | 5원 |
| < 10,000원 | 10원 |
| < 50,000원 | 50원 |
| < 100,000원 | 100원 |
| < 500,000원 | 500원 |
| ≥ 500,000원 | 1,000원 |

```typescript
export function roundToTick(price: number): number {
  if (price < 1000)   return Math.round(price);
  if (price < 5000)   return Math.round(price / 5) * 5;
  if (price < 10000)  return Math.round(price / 10) * 10;
  if (price < 50000)  return Math.round(price / 50) * 50;
  if (price < 100000) return Math.round(price / 100) * 100;
  if (price < 500000) return Math.round(price / 500) * 500;
  return Math.round(price / 1000) * 1000;
}
```

### `sellOrder(config, code, qty)`

시장가 매도. `ORD_DVSN: "01"`, `ORD_UNPR: "0"` 고정.

내부적으로 `executeOrder(config, KIS_TR.SELL, code, qty, "sell")`을 호출한다.

### `executeOrder(config, trId, code, qty, side)`

모든 주문의 기저 실행 함수. `rt_cd === "0"` 이면 성공으로 판정한다.

```typescript
if (rtCd === "0") {
  return { success: true, msg, ordNo: data.output?.ODNO, raw: data };
}
```

HTTP 오류 또는 네트워크 예외는 `success: false`로 반환하며, 예외가 전파되지 않는다.

### `getBalance(config)`

잔고 및 보유 종목 조회. `output1`(보유 종목 배열)에서 아래 필드를 사용한다.

| 필드 | 설명 |
|------|------|
| `pdno` | 종목 코드 |
| `hldg_qty` | 보유 수량 |
| `pchs_avg_pric` | 평균 매입 단가 |
| `prpr` | 현재가 |
| `stck_hgpr` | 고가 (트레일링 스탑 계산용) |
| `prdt_name` | 종목명 |

---

## Position Sizing — 포지션 사이징

`calcPositionSize(atr, price, targetRiskAmount, maxPerTrade, atrStopMultiplier)`

ATR 기반 동적 사이징으로 리스크 금액을 일정하게 유지한다.

```
positionSize = targetRiskAmount / (atr * atrStopMultiplier / price)
positionSize = Math.min(positionSize, maxPerTrade)
```

- `targetRiskAmount`: 학습으로 최적화되는 허용 리스크 금액 (원화)
- `maxPerTrade`: 단일 거래 상한선 (기본 1,000,000원, 관리자 설정 가능)
- `atrStopMultiplier`: ATR 손절 배수 (기본 2.0, 학습으로 조정)

최종 수량: `qty = Math.floor((positionSize * buyRatio) / price)`

---

## Data & Database

주문 실행 후 DB 기록 함수:

| 함수 | 테이블 | 시점 |
|------|--------|------|
| `openPosition(code, name, price, qty, signal, phase)` | `positions` | 매수 체결 성공 시 |
| `recordTradeMemory(params)` | `trade_memory` | 신규 매수 시 (지표 스냅샷 저장) |
| `closePosition(code, price, qty, reason)` | `positions` | 청산 성공 시 |
| `closeTradeMemory(code, pnlPct, pnlAmt, days, reason)` | `trade_memory` | 청산 성공 시 (`closed_at IS NULL` 조건으로 UPDATE) |
| `logEngineRun(tradeCount, actions, scanned, ms)` | `engine_logs` | 매 사이클 완료 시 |
| `savePendingOrder(params)` | `pending_orders` | `limitBuyOrder` 성공 직후 |
| `getPendingOrders()` | `pending_orders` | STEP 0 시작 시 전체 조회 |
| `deletePendingOrder(orderId)` | `pending_orders` | 체결 확인 또는 타임아웃 시 |

### `pending_orders` 테이블

지정가 매수 주문이 발행되면 체결 여부가 확인될 때까지 임시 보관하는 테이블이다. 매 사이클 STEP 0에서 체결 여부를 KIS API로 확인하고, 체결되거나 30분 경과 시 삭제된다.

```sql
-- pending_orders table schema
id          uuid         PK
stock_code  text         NOT NULL
stock_name  text
order_no    text         NOT NULL  -- KIS 주문 번호 (ODNO)
order_qty   integer      NOT NULL
limit_price integer      NOT NULL
signal_score integer
created_at  timestamptz  DEFAULT now()
```

상태 전이:

```
주문 발행 → savePendingOrder() → pending_orders 삽입
  ↓ (다음 STEP 0)
  checkOrderFill() 호출
    ├── filled: true  → deletePendingOrder() + action "order_filled"
    └── filled: false + age ≥ 30min → deletePendingOrder() + action "order_cancelled_timeout"
```

`pending_signals` 테이블 상태 전이:

```
pending → approved (관리자 승인)
pending → expired  (만료/거절)
approved → expired (STEP 1.5 처리 완료 후)
```

KIS 자격증명은 `kis_config` 테이블(`id="default"`)에 저장되며, UI 즉시매수 API `/api/kis/order`가 서버에서 직접 조회한다. 클라이언트는 자격증명을 전달하지 않는다.

---

## API Endpoints

### KIS 원격 API (모의투자)

| 기능 | Method | 경로 | tr_id |
|------|--------|------|-------|
| 잔고 조회 | GET | `/uapi/domestic-stock/v1/trading/inquire-balance` | `VTTC8434R` |
| 현재가 조회 | GET | `/uapi/domestic-stock/v1/quotations/inquire-price` | `FHKST01010100` |
| 주문 (매수/매도) | POST | `/uapi/domestic-stock/v1/trading/order-cash` | `VTTC0802U`(매수) / `VTTC0801U`(매도) |
| 미체결 조회 | GET | `/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl` | `VTTC8036R` |
| 주문 취소 | POST | `/uapi/domestic-stock/v1/trading/order-rvsecncl` | `VTTC0803U` |
| 일별 캔들 | GET | `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice` | `FHKST03010100` |
| 주문 내역 | GET | `/uapi/domestic-stock/v1/trading/inquire-daily-ccld` | `VTTC8001R` |

지정가(`ORD_DVSN: "00"`)와 시장가(`ORD_DVSN: "01"`)는 같은 `order-cash` 엔드포인트를 공유하며, `ORD_UNPR`을 `"0"`으로 설정하면 시장가로 처리된다.

### 내부 API Routes

| 경로 | Method | 설명 |
|------|--------|------|
| `/api/engine` | GET | 크론 호출 (CRON_SECRET 인증) |
| `/api/engine` | POST | 수동 엔진 실행 (관리자) |
| `/api/kis/order` | POST | UI 즉시 단건 주문 |
| `/api/manual-buy` | POST | 수동 매수 예약 → `pending_signals` 삽입 |

`/api/kis/order` 요청 형식:
```json
{
  "side": "buy" | "sell",
  "stockCode": "005930",
  "quantity": 10,
  "price": 72000,
  "orderType": "00"
}
```
서버가 `kis_config` 테이블에서 자격증명을 조회하므로 클라이언트 요청에 자격증명 없음.

`/api/manual-buy` 요청 형식:
```json
{
  "items": [
    { "stock_code": "005930", "stock_name": "삼성전자", "qty": 10 }
  ]
}
```
삽입된 레코드는 `signal_score=100`, `source="manual"`, `status="approved"` 고정이며, 다음 엔진 사이클 STEP 1.5에서 실행된다.

---

## Key Decisions

**지정가 -0.5% 전략**: 시장가 주문은 슬리피지가 크고 모의투자 환경에서 변동성이 높다. 현재가 대비 0.5% 낮은 지정가를 사용하면 슬리피지를 줄이면서도 단기 조정 시 체결 확률이 높다. 미체결 시 다음 사이클 STEP 0에서 자동 취소되어 무한 대기가 없다.

**수동 매수 2-tier 설계**: UI 즉시매수(`/api/kis/order`)는 단건 즉시 실행용이고, `/api/manual-buy`는 수량을 지정하여 엔진 사이클에 위임하는 방식이다. 후자는 `qty_override`를 `signal_data`에 포함하므로 엔진의 포지션 사이징을 완전히 우회한다.

**보안 설계 (2026-04-17 적용)**: `/api/kis/order`에서 클라이언트가 전달하는 자격증명을 제거하고, 서버가 `kis_config` 테이블에서 직접 조회한다. XSS로 탈취된 클라이언트 측 자격증명이 주문에 악용되는 경로를 차단한다.

**API 호출 간 딜레이**: KIS API의 초당 호출 제한(약 20회/초)을 초과하지 않도록 종목 반복 처리 루프에서 `await new Promise(r => setTimeout(r, 200))` 딜레이를 삽입한다. `batchFetch`는 3개 종목을 병렬 처리 후 200ms 대기한다.

---

## Gotchas

- **KIS API 오류 격리**: `executeOrder`는 예외를 throw하지 않고 `{ success: false, msg }` 반환. 엔진은 종목별로 오류를 `actions` 배열에 기록하고 계속 진행한다. 단, 토큰 발급 실패는 엔진 전체를 중단시킨다.
- **미체결 주문 누적 방지**: 지정가 주문이 체결되지 않으면 STEP 0에서 반드시 취소된다. 취소하지 않으면 잔고에서 예수금이 묶여 실제 가용 자금이 줄어든다.
- **`closeTradeMemory` 중복 방지**: `closed_at IS NULL` 조건으로 UPDATE하므로, 이미 청산된 포지션을 다시 닫으려 해도 영향이 없다.
- **`maxDailyTrades` 카운터**: `tradeCount`는 매수(approved_buy, split_buy_1, split_buy_2, surge_buy)와 청산(stop_loss, take_profit, trailing_stop, max_hold) 모두 포함하여 증가한다. 하루 최대 거래 횟수 제한이 청산에도 적용되므로, 청산이 많은 날은 신규 매수 슬롯이 줄어들 수 있다.
- **`phase` 로직의 비대칭성**: STEP 2에서 `existingPos?.phase === "initial"`이면 `buyRatio=1`(전액)로 처리하는데, 이미 포지션이 있는 상태에서 `phase="initial"`이 되려면 이전 `openPosition` 호출 시 `phase="initial"`로 저장된 경우다. 첫 진입은 항상 `"initial"`. 2차 추가매수 시 `buyRatio=0.5`로 제한된다.
- **Vercel 환경변수 `\n` 버그**: `vercel env pull`로 받은 `KIS_APP_KEY`, `KIS_APP_SECRET` 값에 trailing `\n` 또는 `\\n`이 붙는 경우가 있다. 엔진 진입 시 `.replace(/\\n|\n/g, "").trim()`으로 정제한다.
- **수동 매수 `qty_override`의 우선순위**: `/api/manual-buy`로 삽입된 신호는 `qty_override`가 항상 존재하므로, 엔진의 ATR 기반 포지션 사이징이 완전히 무시된다. 관리자가 직접 수량을 지정하므로 의도된 동작이나, 지나치게 큰 수량을 입력하면 `maxPerTrade` 한도를 초과할 수 있다.

---

## KIS API 에러 알림

KIS API route의 오류 무음 처리가 제거되고 Telegram 즉시 알림이 추가됨.

| 엔드포인트 | 알림 조건 | 함수 |
|-----------|---------|------|
| `POST /api/kis/token` | KIS 401/403 또는 네트워크 에러 | `sendKISApiErrorAlert({ operation: "token", httpStatus, kisCode, kisMessage })` |
| `POST /api/kis/balance` | KIS 호출 실패 (401, 500, 네트워크 오류) | `sendKISApiErrorAlert({ operation: "balance", httpStatus, kisCode, kisMessage })` |

**보안 원칙**: `appKey`/`appSecret`/`token`은 알림 메시지에 절대 포함하지 않는다. `kisCode`, `kisMessage` (200자 이하)만 포함한다.

### Silent Catch 현황

| 파일 | 위치 | 내용 | 처리 방향 |
|------|------|------|---------|
| `src/lib/store.ts` | ~294 | 잔고 재시도 실패 | 클라이언트 UI 표시 (알림 불필요) |
| `src/lib/store.ts` | ~373 | 캔들 조회 실패 | 무음 유지 (비치명적) |
| `src/lib/store.ts` | ~378~382 | 전체 fetchKISData 실패 | kisConnected=false 처리로 대체 |

> **원칙**: 서버 API route의 KIS 통신 실패 → Telegram 알림. 클라이언트 store의 silent catch는 UI 경험 보호 목적이므로 유지.

## balance / price API POST 전환 (v7.1)

v7.1에서 `GET /api/kis/balance`와 `GET /api/kis/price`가 **POST**로 전환되었다. `appSecret` 등 민감 자격증명이 URL 쿼리 스트링으로 전달되면 Nginx/Vercel 액세스 로그, 브라우저 히스토리에 노출되는 보안 취약점을 해결한다.

### POST /api/kis/balance (v7.1, GET → POST 변경)

**Request Body:**
```json
{
  "appKey":    "xxxxxxxx",
  "appSecret": "xxxxxxxx",
  "token":     "eyJ...",
  "accountNo": "50123456-01"
}
```

**변경 포인트**: 핸들러 메서드 `GET` → `POST`. 자격증명 추출 `req.nextUrl.searchParams.get(...)` → `await req.json()`. 기존 에러 핸들링(`sendKISApiErrorAlert`) 그대로 유지.

**400 (필수 파라미터 누락)**: `{ "error": "appKey, appSecret, token, accountNo 필수" }`

### POST /api/kis/price (v7.1, GET → POST 변경)

**Request Body:**
```json
{
  "code":      "005930",
  "appKey":    "xxxxxxxx",
  "appSecret": "xxxxxxxx",
  "token":     "eyJ...",
  "accountNo": ""
}
```

### src/lib/kis/client.ts 변경 (v7.1)

인터페이스(함수 시그니처)는 변경 없음. 내부 HTTP 방식만 변경.

| 함수 | 변경 전 | 변경 후 |
|------|---------|---------|
| `fetchBalance(config)` | `fetch('/api/kis/balance?' + params)` GET | `fetch('/api/kis/balance', { method: 'POST', body: JSON.stringify(creds) })` |
| `fetchPrice(config, code)` | `fetch('/api/kis/price?' + params)` GET | `fetch('/api/kis/price', { method: 'POST', body: JSON.stringify({ code, ...creds }) })` |
| `fetchPrices(config, codes)` | `fetchPrice()` 루프 | 동일 (fetchPrice 수정 자동 반영) |

`params()` URLSearchParams 헬퍼 함수는 v7.1에서 제거된다.

## v6.2 섹터 필터 (설계 완료, 구현 예정)

`docs/02-design/features/sector-limit.design.md` 기준. STEP 2/3 강한 신호 매수 직전에 섹터 제한을 추가로 검사한다.

```typescript
// STEP 시작 시 1회 조회 (N+1 방지)
const sectorCounts = await getSectorCounts();

// 매수 직전 (applyStockFilter 다음)
const sector = priceData.bstp_kor_isnm || null;
const sectorFilter = applySectorFilter(sector, sectorCounts, ctx.maxPerSector);
if (!sectorFilter.passed) {
  actions.push({ type: "skip", code, name, detail: sectorFilter.reason });
  continue;
}
// 매수 성공 시 openPosition에 sector 전달 → positions.sector 저장
```

**관련 신규 DB 함수**:
- `getSectorCounts()` — `positions` WHERE `status='open' AND sector IS NOT NULL` 집계
- `openPosition(..., sector?)` — `positions.sector` 컬럼 저장 (sector 파라미터 추가)

## Sources

- `src/lib/engine/kis.ts` — 엔진 전용 KIS 주문 함수 전체 (`checkOrderFill` 포함)
- `src/lib/engine/db.ts` — `pending_orders` 헬퍼 (`savePendingOrder`, `getPendingOrders`, `deletePendingOrder`)
- `src/app/api/kis/order/route.ts` — UI 즉시매수 API (보안 개선 포함)
- `src/app/api/manual-buy/route.ts` — 수동 매수 예약 API
- `src/app/api/engine/route.ts` — 엔진 STEP 0~3 전체 오케스트레이션
- `src/lib/kis/api.ts` — 저수준 KIS API 래퍼
- `src/lib/kis/client.ts` — 클라이언트 사이드 KIS 프록시 헬퍼 (v7.1 POST 전환)
- `src/lib/engine/types.ts` — `EngineConfig`, `OrderResult`, `OpenOrder` 타입 정의
- `supabase/migrations/*_pending_orders.sql` — `pending_orders` 테이블 마이그레이션
- `docs/01-plan/features/nexio.plan.md` (v7.1 — balance/price POST 전환 계획)
- `docs/02-design/features/nexio.design.md` (v7.1 설계서 — POST API 스펙, client.ts 변경 상세)
- `docs/02-design/features/sector-limit.design.md` (v6.2 섹터 분산 제한 — 주문 흐름 변경)
