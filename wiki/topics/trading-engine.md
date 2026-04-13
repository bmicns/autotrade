# Trading Engine — 자동매매 엔진

[coverage: high -- 4 sources]

## Purpose

NEXIO 자동매매 엔진의 핵심 실행 모듈. Vercel Cron으로 하루 4회 자동 실행되며, 관심종목에 대해 신호 분석 → 포지션 평가 → 주문 실행을 수행한다.

## 위치

- **메인 파일**: `src/app/api/engine/route.ts`
- **Cron 설정**: `vercel.json` (2개 슬롯 사용 중)

## 실행 흐름

```
Cron 트리거 (하루 4회)
  ↓
loadLatestLearning()        ← 학습 스냅샷 로딩 (재계산 없음)
  ↓
applyLearning(learned, config)  ← 신뢰도 기반 파라미터 결정
  ↓
워치리스트 조회
  ↓
STEP 0: 신규 신호 분석
  - analyzeSignal()         (base_score: 기본 가중치)
  - analyzeSignalWithWeights() (learned_score: 학습 가중치)
  - 매수 조건 충족 시 → calcPositionSize() → buyOrder()
  - recordTradeMemory()     ← 7종 지표 + A/B 점수 저장
  ↓
STEP 1: 기존 포지션 청산 평가 (종목별 루프)
  - const { stopLoss, takeProfit, trailingStop }
      = calcDynamicRisk(atr, price, atrMultipliers)   ← 루프 내 const (스코프 버그 해소)
  - 손절/익절/트레일링/최대보유 조건 확인
  - closePosition() + closeTradeMemory()
```

## 주요 설계 결정

### ATR × 학습 통합 (v5.9.0)

**기존 문제**: `learning.risk.stopLoss = -4%` 적용 후 ATR 계산이 이를 덮어써 학습 결과가 무시됨. 또한 `let stopLoss`가 for 루프 밖에 선언되어 첫 번째 종목 결과가 다음 종목 초기값을 오염시키는 스코프 버그 존재.

**해결**: ATR 배수(multiplier) 자체를 학습 대상으로 만들어 둘을 통합. STEP 1 루프 내에서 `const`로 독립 선언.

```typescript
// 변경 후 — 학습 배수를 적용한 단일 경로
const { stopLoss, takeProfit, trailingStop } =
  calcDynamicRisk(atr, price, atrMultipliers);
```

### 포지션 사이징 (v5.9.0)

기존에는 변동성 무관하게 모든 종목에 동일 금액(100만원) 투자. 변경 후 ATR 기반 변동성 역비례 사이징 적용:

```
투자금액 = targetRiskAmount / (atr × stopMultiplier / currentPrice)
→ 상한: Math.min(calculated, maxPerTrade)
→ 하한: Math.max(result, currentPrice)  // 최소 1주 보장
```

## 학습 결과 적용 방식 (applyLearning)

| 신뢰도 | 적용 범위 |
|--------|----------|
| none (10건 미만) | 기본값 전체 사용 |
| low (10~29건) | ATR 배수 + 포지션 사이징만 |
| medium (30~49건) | 가중치 + ATR 배수 + takeProfitRatio 포함 전체 |
| high (50건 이상) | 전체 적용 |

## A/B 점수 병렬 계산

매수 결정은 `learned_score` 기준으로 하되, `base_score`도 동시에 계산하여 `trade_memory`에 함께 저장. 이를 통해 학습 전/후 성과 비교(A/B) 가능.

## Gotchas

- 엔진 실행 시 `runLearning()` 직접 호출 제거됨 (v5.9.0). 반드시 `loadLatestLearning()` 사용.
- Vercel Cron 2개 슬롯 이미 사용 중 — 추가 Cron 등록 불가
- KIS API 호출 실패 시 해당 종목 건너뜀 (전체 엔진 중단 아님)

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md` (Section 1, 3)
- `docs/02-design/features/adaptive-engine.design.md` (Section 1, 2)
- `docs/03-analysis/adaptive-engine.analysis.md`
- `docs/04-report/features/adaptive-engine.report.md` (Section 3)
