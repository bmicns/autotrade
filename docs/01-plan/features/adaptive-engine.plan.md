# adaptive-engine — 매매 경험 기반 자가학습 엔진

> 작성일: 2026-04-11  
> 프로젝트: NEXIO v5.8.2  
> 목표: 매도/매수 데이터를 경험으로 학습해 수익성이 지속적으로 높아지는 자동매매 시스템

---

## 1. 현황 분석

### 1-1. 현재 구현된 것

| 항목 | 파일 | 상태 |
|------|------|------|
| 지표 가중치 학습 (`learnWeights`) | `src/lib/learning.ts` | ✅ 있음 |
| 리스크 파라미터 학습 (`learnRiskParams`) | `src/lib/learning.ts` | ✅ 있음 |
| ATR 기반 동적 손절 (`calcDynamicRisk`) | `src/lib/kis/indicators.ts` | ✅ 있음 |
| 엔진 실행 시 학습 결과 적용 | `src/app/api/engine/route.ts` | ✅ 있음 |
| 성과 분석 (승률·MDD·지표적중률·월별손익) | `src/lib/analytics.ts` | ✅ 있음 |
| 통계 UI | `src/components/stats/stats-tab.tsx` | ✅ 있음 |
| 백테스트 API + UI | `src/app/api/backtest` | ✅ 있음 |

### 1-2. 현재 구조의 문제점 (우선순위순)

1. **학습 리스크 vs ATR 충돌** ← 즉시 수정 필요
   - `learning.risk.stopLoss = -4%` 적용 후 → ATR 계산으로 -3.2% 덮어씀
   - 학습 결과가 무시되는 구조. 둘 중 하나만 살거나 통합 필요

2. **포지션 사이징 고정**
   - 변동성 큰 종목(ATR 높음)도, 안정적 종목도 동일하게 100만원 투자
   - 동일 리스크 유지하려면 변동성에 반비례하여 투자금액 조정 필요

3. **학습 결과 저장 없음 (재계산 반복)**
   - 엔진 실행(하루 4회)마다 `runLearning()` → DB 풀스캔
   - 학습이 나아지고 있는지 추적 불가

4. **경험 데이터 빈약**
   - `entry_signal`에 레짐, 보정점수 세부 내역 미저장
   - A/B 비교 불가 (기본 점수 vs 학습 점수 따로 저장 안 함)

5. **종목 적합성 필터 없음**
   - 현재: 시총·시장경고·DART 등 "나쁜 종목 제거"만 존재
   - 없는 것: "이 전략에 잘 맞는 종목 유형" 학습

6. **학습 현황 UI 없음**
   - 가중치 변화, 학습 이력, A/B 비교 화면 없음

---

## 2. 목표 구조 (피드백 루프)

```
[매매 실행] → [결과 저장] → [패턴 분석] → [가중치 개선] → [다음 매매]
     ↑                                                              ↓
     └──────────────── 피드백 루프 ──────────────────────────────────┘
```

### 1단계 — 경험 데이터 수집
- 매수 진입 시: 지표값 7종 + 점수(기본/학습 A/B) + 레짐 + 보정점수 저장
- 매도 청산 시: 손익률, 보유기간, 청산 유형 연결
- → Supabase `trade_memory` 테이블

### 2단계 — 패턴 학습 (핵심)
- 수익 매매 vs 손실 매매의 지표 조합 분석
- RSI 범위별 승률, MACD 조합별 평균 수익률 등 세부 집계
- ATR 배수 학습 (고정 ×2 → 실전 최적 배수 학습)
- 지표별 "실전 가중치" 자동 계산
- → 주 1회 학습 Cron

### 3단계 — 개선 결과 적용
- DB에서 학습 결과 로딩 (재계산 X)
- ATR × 학습 배수로 손절/익절 통합 계산 (충돌 해소)
- 변동성 기반 포지션 사이징 적용
- → 엔진 신뢰도 점수에 반영

---

## 3. 기능 범위 (우선순위순)

### P1 — ATR × 학습 통합 (버그 수정 성격)

**문제**: 학습 리스크 파라미터와 ATR이 서로 덮어쓰는 충돌  
**해결**: ATR 배수 자체를 학습 대상으로 만들어 둘을 통합

```
현재: stopLoss = 학습값 → ATR으로 덮어씀 (학습 무시)
개선: ATR_multiplier_stop  = 학습 (기본 2.0 → 실전 최적값)
      ATR_multiplier_profit = 학습 (기본 3.0 → 실전 최적값)
      → stopLoss = ATR × learned_multiplier (항상 ATR 기반, 배수만 학습)
```

- `learning.ts`에 `learnAtrMultipliers()` 추가
- `calcDynamicRisk(atr, price, multipliers)` 파라미터 확장
- 기존 `learning.risk.stopLoss` (고정값) → `learning.risk.atrMultipliers` 로 전환

### P2 — 포지션 사이징 동적화

**문제**: 변동성 무관하게 동일 금액 투자 → 고변동성 종목에서 손실 과다  
**해결**: ATR 기반 변동성 역비례 포지션 사이징

```
목표 리스크 금액: 매매당 고정 (예: 3만원 손실 한도)
투자금액 = 목표 리스크 / (ATR × 손절 배수 / 현재가)

예시:
- A종목 ATR 2% → 투자 100만원 (손실 한도 ≈ 4%)
- B종목 ATR 5% → 투자 40만원  (손실 한도 ≈ 4%)
→ 두 종목 모두 손실 시 동일 금액 잃음
```

- `calcPositionSize(atr, price, riskAmount, maxPerTrade)` 함수 신규
- `maxPerTrade` 설정값은 상한선으로만 사용
- 설정탭에 "매매당 목표 리스크 금액" 항목 추가

### P3 — 경험 데이터 수집 + 학습 결과 영속화

**해결**: `trade_memory` 테이블 + `learning_snapshots` 테이블 신규

**`trade_memory`에 저장할 것**:
- 지표값 7종 스냅샷 (RSI, MACD 히스토그램, MA 상태, 볼린저 위치, 거래량비율, ADX, 캔들패턴)
- base_score (기본 가중치 점수) + learned_score (학습 가중치 점수) → A/B 비교용
- 레짐, 보정점수 3종 (시장모멘텀·기관외국인·장초반)
- 청산 시: pnl, hold_days, exit_reason 업데이트

**`learning_snapshots`**:
- 학습 결과를 DB에 저장, 엔진은 로딩만 (재계산 제거)
- 유효기간 7일
- 신뢰도 등급 (샘플 수 기반): none/low/medium/high

### P4 — 학습 전용 Cron + 세부 패턴 분석

**해결**: `/api/learn` 엔드포인트 신규 + `/api/observer`에 학습 조건부 병합

> ✅ 결정: Vercel Hobby 플랜 Cron 2개 제한으로 별도 Cron 추가 대신
> 기존 `/api/observer` (매일 평일 UTC 00:00)에서 UTC 월요일 조건으로 학습 트리거.
> `vercel.json` 변경 없음.

학습 항목:
- 지표별 실전 가중치 (기존 + ADX·캔들패턴 추가)
- ATR 배수 최적값 학습 (P1 연동)
- RSI 범위별 승률 (0~20, 20~30, 30~40...)
- MACD 히스토그램 크기별 성과
- 지표 조합 매트릭스 (RSI<30 + 거래량>200% 조합 승률 등)
- 포지션 사이징 목표 리스크 최적값 (P2 연동)
- **`takeProfitRatio` (익절 시 매도 비율)**: 승률 기반 자동 조정
  - 승률 >60% → 30% (나머지 트레일링으로 추가 수익 추구)
  - 승률 >50% → 40%
  - 승률 <35% → 70% (확정 수익 우선)
  - ✅ 결정: 신뢰도 `medium` 이상(30건+)일 때만 학습값 적용, 미만은 기본값(50%) 유지

엔진에서 `runLearning()` 직접 호출 제거 → `loadLatestLearning()` 대체

### P5 — 종목 적합성 스코어링

**문제**: "나쁜 종목 제거"만 있고 "잘 맞는 종목 선별"이 없음  
**해결**: 과거 매매 이력으로 종목별 "전략 적합도" 계산

```
전략 적합도 = (승률 × 0.5) + (평균손익/최대손실 × 0.3) + (거래수 충분도 × 0.2)
```

- 5건 이상 매매 종목 대상으로 적합도 점수 계산
- 적합도 낮은 종목 (30점 미만) → 신호 탈락 시 관심종목 제거 제안 (UI 알림)
- 신규 종목은 중립 점수로 시작, 데이터 쌓이면 자동 업데이트
- `GET /api/stats/stocks` API 신규

### P6 — 학습 현황 대시보드

**해결**: 통계탭에 "학습 현황" 섹션 추가

표시 항목:
- 마지막 학습: 날짜, 샘플 수, 신뢰도
- A/B 비교: 최근 매매에서 기본 점수 vs 학습 점수 차이 (학습이 더 잘 맞는지 검증)
- 지표 가중치: 기본값 vs 현재 학습값 바 차트 (trending/ranging 탭)
- ATR 배수: 기본값(2.0/3.0) vs 학습값
- 학습 이력: 최근 5회 (날짜·샘플수·승률)
- 종목별 성과: 승률·손익 테이블, 성과 미흡 경고

---

## 4. 신규 DB 스키마

### `trade_memory` 테이블

```sql
id              uuid     PRIMARY KEY DEFAULT gen_random_uuid()
created_at      timestamptz DEFAULT now()
stock_code      text     NOT NULL
stock_name      text

-- 진입 시 지표 스냅샷 (7종)
rsi_value       numeric       -- RSI 수치 (예: 27.4)
macd_histogram  numeric       -- MACD 히스토그램 값
ma_cross        text          -- 'golden' | 'dead' | 'none'
bb_position     text          -- 'lower' | 'middle' | 'upper'
volume_ratio    numeric       -- 거래량/20일평균 배수
adx_value       numeric       -- ADX 추세 강도
candle_pattern  text          -- 캔들 패턴명

-- 진입 컨텍스트
regime          text          -- 'trending' | 'ranging'
base_score      int           -- 기본 가중치 점수 (A/B 비교)
learned_score   int           -- 학습 가중치 점수 (A/B 비교)
total_score     int           -- 보정 포함 최종 점수
market_bonus    int           -- 시장 모멘텀 보정
investor_bonus  int           -- 기관/외국인 보정
snapshot_bonus  int           -- 장초반 스냅샷 보너스
weights_source  text          -- 'learned' | 'default'
atr_value       numeric       -- 진입 시 ATR
position_size   int           -- 실제 투자금액 (원)

-- 결과 (청산 시 업데이트)
pnl_percent     numeric
pnl_amount      numeric
hold_days       int
exit_reason     text          -- 'stop_loss' | 'take_profit' | 'trailing_stop' | 'max_hold'
is_win          boolean
```

### `learning_snapshots` 테이블

```sql
id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid()
created_at          timestamptz DEFAULT now()
sample_size         int
confidence          text          -- 'none' | 'low' | 'medium' | 'high'

weights_trending    jsonb         -- { RSI:18, MACD:24, ... }
weights_ranging     jsonb
weights_source      text

-- ATR 배수 (P1 통합)
atr_mult_stop       numeric       -- 손절 ATR 배수 (기본 2.0)
atr_mult_profit     numeric       -- 익절 ATR 배수 (기본 3.0)
atr_mult_trailing   numeric       -- 트레일링 ATR 배수 (기본 1.5)

-- 포지션 사이징 (P2)
target_risk_amount  int           -- 매매당 목표 손실 한도 (원, 기본 30000)

win_rate            numeric
avg_win             numeric
avg_loss            numeric
pattern_stats       jsonb         -- RSI범위별·MACD조합별 세부 성과

is_active           boolean DEFAULT false
expires_at          timestamptz
```

---

## 5. 파일 변경 범위

### 신규 파일
| 파일 | 설명 |
|------|------|
| `src/app/api/learn/route.ts` | 학습 전용 API (GET/POST), 세부 패턴 분석 포함 |
| `src/app/api/stats/stocks/route.ts` | 종목별 성과 API |
| `src/components/stats/learning-section.tsx` | 학습 현황 UI (A/B 비교, 가중치 차트, 이력) |
| `src/components/stats/stock-stats-section.tsx` | 종목별 성과 UI |

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/kis/indicators.ts` | `calcDynamicRisk()` ATR 배수 파라미터 추가, `calcPositionSize()` 신규 |
| `src/lib/learning.ts` | `learnAtrMultipliers()` 추가, `saveLearning()` / `loadLatestLearning()` 추가, 신뢰도 로직 |
| `src/app/api/engine/route.ts` | ATR 충돌 해소, 포지션 사이징 적용, `runLearning()` → `loadLatestLearning()`, trade_memory 저장 |
| `src/components/stats/stats-tab.tsx` | 학습 현황·종목별 성과 섹션 추가 |
| `src/app/api/observer/route.ts` | UTC 월요일 조건부 학습 트리거 추가 (`runLearning()` 호출) |

---

## 6. 제외 범위

- ML 모델 — Vercel Serverless 제약
- 실시간 강화학습 — 데이터 부족 + 인프라 과도
- 종목 자동 추가 — 제거 제안만 (추가는 수동)
- 멀티 전략 분기 — 단일 엔진 유지

---

## 7. 성공 기준

- [ ] ATR × 학습 배수 통합 — 충돌 없이 단일 계산 경로
- [ ] 포지션 사이징 — ATR 기반 동적 투자금액 적용 확인
- [ ] `trade_memory` 매수 진입 시 지표 7종 + base/learned 점수 저장
- [ ] `trade_memory` 청산 시 pnl/exit_reason 업데이트
- [ ] `learning_snapshots` 저장 + 엔진이 로딩만 (재계산 없음)
- [ ] `/api/learn` POST — ATR 배수 + 세부 패턴 포함 학습 실행
- [ ] `/api/observer` UTC 월요일 실행 시 학습 자동 트리거 확인
- [ ] 엔진 로그에 A/B 점수 병기
- [ ] 통계탭 학습 현황 (A/B 비교·가중치 차트·이력) 조회 가능
- [ ] 통계탭 종목별 성과 (승률·적합도) 조회 가능

---

## 8. 우선순위 요약

```
P1 ATR × 학습 통합       ← 버그 수정. 지금 당장 학습 결과가 무시되고 있음
P2 포지션 사이징 동적화  ← P1과 동시 진행 (ATR 이미 계산됨, 금액만 조정)
P3 경험 데이터 + 학습 영속화  ← P1·P2 완료 후 (인프라)
P4 학습 전용 Cron+API   ← P3 완료 후
P5 종목 적합성 스코어링  ← P4 완료 후 (데이터 필요)
P6 학습 현황 대시보드    ← P4 완료 후 (UI)
```

**기대 효과 (시간대별)**

| 시점 | 효과 | 근거 |
|------|------|------|
| 즉시 (P1·P2 완료) | 손익비 개선, 손실 규모 안정화 | ATR 충돌 해소 + 변동성 비례 사이징 |
| 3개월 후 (P4 완료) | 승률 +5~10%p | 실전 가중치 적용 시작 |
| 6개월 후 (P5 완료) | 손실 종목 자동 필터링 | 전략 부적합 종목 제거 |
| 1년 후 | 수익률 15~25% 개선 추정 | 데이터 200건+ 확보 |
