# Adaptive Learning Engine — 적응형 학습 엔진

[coverage: high -- 4 sources]

## Purpose

실전 매매 결과를 경험 데이터로 학습하여 매매 전략 파라미터(지표 가중치, ATR 배수, 포지션 사이징)를 자동으로 최적화하는 자가학습 시스템. v5.9.0에서 완성되었으며 GAP 분석 97% Match Rate를 달성했다.

## 피드백 루프 구조

```
[매매 실행] → [결과 저장 (trade_memory)] → [패턴 분석 (learnXxx)] 
    → [가중치 개선 (learning_snapshots)] → [다음 매매에 적용]
```

## 주요 파일

| 파일 | 역할 |
|------|------|
| `src/lib/learning.ts` | 학습 핵심 로직 전체 |
| `src/lib/kis/indicators.ts` | ATR 계산, 포지션 사이징 |
| `src/app/api/learn/route.ts` | 학습 실행 API (GET/POST) |
| `src/app/api/engine/route.ts` | 학습 결과 적용 + 경험 데이터 수집 |
| `src/app/api/observer/route.ts` | 주간 학습 트리거 (UTC 월요일 병합) |
| `src/components/stats/learning-section.tsx` | 학습 현황 대시보드 |

## 학습 함수 목록 (learning.ts)

| 함수 | 설명 |
|------|------|
| `learnWeights()` | 지표별 실전 가중치 계산 |
| `learnAtrMultipliers()` | 손절/익절/트레일링 ATR 배수 최적값 (중앙값 기반) |
| `learnPositionSizing()` | 손절 건 평균 손실 역산으로 목표 리스크 금액 최적화 |
| `learnRiskParamsTakeProfitRatio()` | 승률 기반 익절 비율 자동 조정 |
| `learnPatternStats()` | RSI 구간별/MACD 패턴별/조합별 세부 성과 집계 |
| `runLearning()` | 5개 학습 함수 병렬 호출 |
| `saveLearning()` | 학습 결과 DB 저장 (UPDATE → INSERT 원자성 보장) |
| `loadLatestLearning()` | 최신 활성 스냅샷 로딩 (만료 시 폴백 포함) |
| `calcConfidence()` | 샘플 수 기반 신뢰도 등급 계산 |
| `applyLearning()` | 신뢰도 등급별 적용 범위 결정 |

## ATR × 학습 통합 (P1)

### 문제
학습 리스크 파라미터(`learning.risk.stopLoss`)와 ATR 계산 결과가 서로 덮어쓰는 충돌 구조.

### 해결
ATR 배수 자체를 학습 대상으로 통합:

```typescript
export interface AtrMultipliers {
  stop: number;      // 기본 2.0 → 학습으로 최적화
  profit: number;    // 기본 3.0 → 학습으로 최적화
  trailing: number;  // 기본 1.5 → 학습으로 최적화
}

// 하한 가드
// stopLoss <= -2, takeProfit >= 3, trailingStop <= -1.5
```

`learnAtrMultipliers()`: 청산 유형별(stop_loss/take_profit/trailing_stop) 최소 5건 이상일 때만 학습값 사용, 미만은 DEFAULT.

## 포지션 사이징 동적화 (P2)

```
투자금액 = targetRiskAmount / (ATR × stopMultiplier / 현재가)

예시:
- A종목 ATR 2% → 투자 100만원 (손실 한도 ≈ 4%)
- B종목 ATR 5% → 투자  40만원 (손실 한도 ≈ 4%)
→ 두 종목 모두 손실 시 동일 금액 잃음
```

`calcPositionSize(atr, price, targetRiskAmount, maxPerTrade)`:
- 상한: `Math.min(calculated, maxPerTrade)`
- 하한: `Math.max(result, currentPrice)` — 최소 1주 보장

## 신뢰도 체계

```
none   (샘플 < 10)  → 기본값 전체 사용
low    (10 ~ 29)   → ATR 배수 + 포지션 사이징만 적용
medium (30 ~ 49)   → 가중치 + ATR + takeProfitRatio 포함 전체
high   (50 이상)   → 전체 적용
```

`takeProfitRatio` (익절 시 매도 비율) 자동 조정 — 신뢰도 medium 이상 시만 적용:
- 승률 >60% → 30%
- 승률 >50% → 40%
- 승률 <35% → 70%
- 그 외 → 50% (기본값)

## 학습 Cron 스케줄

별도 Cron 추가 대신 `/api/observer`에 UTC 월요일 조건 병합:
```typescript
if (new Date().getUTCDay() === 1) {
  // runLearning() 호출
}
```
→ Vercel Hobby 플랜 Cron 2개 슬롯 제약 준수.

## 학습 API

- `GET /api/learn?history=N` — 최근 N회 학습 이력 조회
- `POST /api/learn` — 학습 실행 (CRON_SECRET 인증 필요)

## 학습 현황 대시보드 (P6)

`learning-section.tsx` 제공 항목:
- 신뢰도 배지 + 마지막 학습 날짜
- 만료 경고 (isExpired=true 시)
- AtrMultiplierRow: 기본값 → 학습값 비교
- WeightBarChart: 추세장 지표 가중치 시각화 (현재 ranging 탭 미구현)
- LearningHistoryTable: 최근 5회 학습 이력

**미구현 항목**: ABCompareCard (base_score vs learned_score 최근 30건 평균 비교) — v5.9.1 예정.

## 종목 적합성 스코어링 (P5)

```
fitness_score = winRate × 0.5 + ProfitFactor × 0.3 + sampleAdequacy × 0.2
→ 5건 미만: neutral 등급 / 50점
→ 30점 미만: "성과미흡" 배지 + 관심종목 제거 제안
```

- API: `GET /api/stats/stocks`
- UI: `stock-stats-section.tsx`

## Gotchas

- 엔진에서 `runLearning()` 직접 호출 제거됨 — `loadLatestLearning()`만 사용
- `atr_value = 0` 또는 `entry_price = 0` 레코드는 학습에서 제외 (0 나누기 방지)
- 학습 스냅샷 유효기간: 7일 (`expires_at`). 만료 시 최신 활성 스냅샷으로 폴백
- 현재 배포 직후라 실거래 데이터 < 50건 → 대부분 none/low 신뢰도 상태

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md`
- `docs/02-design/features/adaptive-engine.design.md`
- `docs/03-analysis/adaptive-engine.analysis.md`
- `docs/04-report/features/adaptive-engine.report.md`
