# Order Management — 주문 관리

[coverage: medium -- 3 sources]

## Purpose

KIS(한국투자증권) API를 통해 실제 주식 주문을 실행하고, 포지션 보유 중 청산 조건을 판단하는 시스템.

## 위치

- **KIS API 클라이언트**: `src/lib/kis/api.ts`, `src/lib/kis/client.ts`
- **엔진 통합**: `src/app/api/engine/route.ts`
- **수동 매수**: `src/app/api/manual-buy/route.ts`
- **포지션 조회**: `src/app/api/positions/route.ts`

## 주문 실행 흐름

### 자동 매수 (엔진)

1. 신호 점수 임계값 초과
2. `calcPositionSize()` → 투자금액 결정 (ATR 기반 동적 사이징)
3. `buyOrder()` 실행 (KIS API)
4. 성공 시 `recordTradeMemory()` 호출 → 지표 스냅샷 저장

### 자동 청산 조건 (STEP 1, 하루 4회 평가)

| 조건 | 설명 |
|------|------|
| 손절 (stop_loss) | 현재가 <= stopLoss 기준 |
| 익절 (take_profit) | 현재가 >= takeProfit 기준 |
| 트레일링 스탑 (trailing_stop) | 고점 대비 trailingStop 비율 하락 |
| 최대 보유 기간 (max_hold) | hold_days 초과 |

청산 유형은 `exit_reason` 필드로 `trade_memory`에 기록됨.

### 수동 매수

`src/app/api/manual-buy/route.ts` — 관리자 UI에서 직접 종목명/수량 입력하여 즉시 매수.

## 청산 가격 계산

`calcDynamicRisk(atr, price, atrMultipliers)` (`indicators.ts`):

```typescript
stopLoss    = -(atr × multipliers.stop    / price) × 100
takeProfit  =  (atr × multipliers.profit  / price) × 100
trailingStop = -(atr × multipliers.trailing / price) × 100

// 하한 가드
stopLoss    = Math.min(stopLoss, -2)       // 최소 -2%
takeProfit  = Math.max(takeProfit, 3)      // 최소 +3%
trailingStop = Math.min(trailingStop, -1.5) // 최소 -1.5%
```

기본 ATR 배수: `stop=2.0, profit=3.0, trailing=1.5` — 학습 데이터 누적 시 자동 최적화.

## Gotchas

- KIS API 장애 시 해당 종목만 건너뜀 (전체 엔진 중단 없음)
- `closeTradeMemory()`는 `closed_at IS NULL` 조건으로 UPDATE — 중복 업데이트 방지
- 포지션 사이징 상한선(`maxPerTrade`)은 설정탭에서 관리자 설정 가능

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md` (Section 3: P1, P2)
- `docs/02-design/features/adaptive-engine.design.md` (Section 2)
- `docs/04-report/features/adaptive-engine.report.md` (Section 3: P1, P2)
