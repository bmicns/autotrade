# Signal System — 매매 신호 시스템

[coverage: medium -- 3 sources]

## Purpose

다중 기술 지표를 분석하여 매수 신호를 도출하는 시스템. 기본 가중치(default)와 학습 가중치(learned)를 병렬로 계산하여 A/B 비교를 지원한다.

## 위치

- **신호 분석**: `src/lib/kis/indicators.ts`
- **학습 가중치 적용**: `src/lib/learning.ts`
- **신호 UI**: `src/components/signal/`
- **신호 API**: `src/app/api/pending-signals/`

## 사용 지표 (7종)

| 지표 | 설명 | 레짐 가중치 |
|------|------|------------|
| RSI | 과매도/과매수 강도 | trending/ranging 별 상이 |
| MACD 히스토그램 | 추세 전환 모멘텀 | trending 비중 높음 |
| MA 크로스 | 이동평균선 교차 (golden/dead/none) | trending 비중 높음 |
| 볼린저 밴드 위치 | 현재가 위치 (below/middle/above) | ranging 비중 높음 |
| 거래량 비율 | 현재 거래량 / 20일 평균 배수 | 공통 |
| ADX | 추세 강도 | trending 비중 높음 |
| 캔들 패턴 | 패턴명 (예: hammer, engulfing) | 보조 |

> 주의: `bb_position` 값은 코드 기준 `below`/`above` 사용 (설계서의 `lower`/`upper`와 다름)

## 레짐 (Regime) 분류

- **trending**: 추세장 — RSI, MACD, MA 크로스 가중치 증가
- **ranging**: 횡보장 — 볼린저 밴드 가중치 증가

## 신호 점수 계산

```
base_score    = analyzeSignal(indicators, defaultWeights)
learned_score = analyzeSignalWithWeights(indicators, learnedWeights)
```

- 매수 결정 기준: `learned_score` (신뢰도 low 이상일 때)
- `trade_memory`에 두 점수 모두 저장 → A/B 비교

## 보정 점수 3종

| 보정 유형 | 설명 |
|----------|------|
| market_bonus | 시장 전체 모멘텀 보정 |
| investor_bonus | 기관/외국인 순매수 보정 |
| snapshot_bonus | 장 초반 스냅샷 데이터 기반 보정 |

## 캔들 패턴 추출

`extractCandlePattern()` 헬퍼 (`engine/route.ts`)가 `SignalRaw`에서 캔들 패턴명을 추출. `signal.indicators`에서 직접 접근.

## 종목 필터링 (신호 탈락 조건)

- 시총 기준 미달
- 시장 경고 종목
- DART 공시 이상 종목
- 종목 적합성 스코어 30점 미만 (v5.9.0, P5) — UI 알림으로 관심종목 제거 제안

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md` (Section 1-1, 3 P4)
- `docs/02-design/features/adaptive-engine.design.md` (보완이력 #2, #6, #7)
- `docs/03-analysis/adaptive-engine.analysis.md` (P1, P2 검증)
