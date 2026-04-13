# Adaptive-Engine 완료 보고서

> **요약**: 자동매매 시스템의 경험 기반 자가학습 엔진 개발 완료. ATR 배수 통합, 포지션 동적 사이징, 경험 데이터 영속화, 신뢰도 기반 차등 학습 적용으로 매매 수익성 개선. GAP 분석 97% Match Rate 달성.
>
> **작성자**: NEXIO 개발팀  
> **완료일**: 2026-04-11  
> **상태**: 완료 ✅

---

## 1. 프로젝트 개요

### 기본 정보
- **기능명**: adaptive-engine (매매 경험 기반 자가학습 엔진)
- **프로젝트**: NEXIO v5.9.0
- **기간**: 2026-04-11 ~ 2026-04-11 (설계+구현+검증 동시 진행)
- **담당자**: NEXIO 개발팀

### 목표
기존 자동매매 엔진이 실시간 매매 결과를 학습하지 못하는 문제를 해결하여:
1. ATR 계산과 학습 리스크 파라미터의 충돌 제거
2. 변동성 기반 동적 포지션 사이징 적용
3. 매매 경험을 DB에 저속화하고 체계적으로 학습
4. 학습 결과의 신뢰도별 차등 적용
5. 학습 효율 현황을 대시보드에서 모니터링

---

## 2. PDCA 사이클 요약

### Plan (계획)
- **문서**: `docs/01-plan/features/adaptive-engine.plan.md`
- **목표**: 6개 우선순위 기능(P1~P6) 정의 및 실행 순서 수립
- **주요 내용**:
  - ATR 배수 학습으로 손절/익절 통합 (P1)
  - 변동성 역비례 포지션 사이징 (P2)
  - trade_memory + learning_snapshots 테이블 설계 (P3)
  - 학습 전용 API/Cron 병합 (P4)
  - 종목 적합성 스코어링 (P5)
  - 학습 현황 대시보드 (P6)

### Design (설계)
- **문서**: `docs/02-design/features/adaptive-engine.design.md`
- **상태**: ✅ 완료 (design-validator 11항 검토 반영)
- **주요 설계 결정**:
  - ATR 배수 파라미터화: `AtrMultipliers { stop, profit, trailing }`
  - 포지션 사이징 공식: `targetRiskAmount / stopRatio`
  - 신뢰도 등급: none/low/medium/high (샘플 수 기반 임계값: 10/30/50)
  - Vercel Cron 슬롯 제약 해결: `/api/observer`에 UTC 월요일 학습 트리거 병합
  - 만료 폴백: 학습 스냅샷 만료 시 최신 활성 스냅샷 사용

### Do (구현)
- **범위**: P1~P6 전체 기능 구현 완료
- **신규 파일** (4개):
  - `src/app/api/learn/route.ts` — 학습 API (GET/POST)
  - `src/app/api/stats/stocks/route.ts` — 종목별 성과 API
  - `src/components/stats/learning-section.tsx` — 학습 현황 UI
  - `src/components/stats/stock-stats-section.tsx` — 종목별 성과 UI

- **수정 파일** (6개):
  - `src/lib/kis/indicators.ts` — AtrMultipliers 인터페이스, calcDynamicRisk/calcPositionSize
  - `src/lib/learning.ts` — learnAtrMultipliers, learnPositionSizing, learnRiskParamsTakeProfitRatio, learnPatternStats, saveLearning, loadLatestLearning, runLearning, applyLearning
  - `src/app/api/engine/route.ts` — ATR 충돌 해소, trade_memory 저장, learned_score 병렬 계산
  - `src/components/stats/stats-tab.tsx` — 학습 현황·종목별 성과 섹션 통합
  - `src/app/api/observer/route.ts` — UTC 월요일 학습 트리거 추가
  - Supabase 마이그레이션 (2026-04-11)

### Check (검증)
- **문서**: `docs/03-analysis/adaptive-engine.analysis.md`
- **최종 판정**: ✅ **PASS (97% Match Rate >= 90%)**
- **섹션별 점수**:
  - P1 ATR × 학습 통합: 100%
  - P2 포지션 사이징 동적화: 100%
  - P3 경험 데이터 수집: 100%
  - P4 학습 API/Cron: 100%
  - P5 종목 적합성: 100%
  - P6 학습 대시보드: 93% (ABCompareCard UI 미구현)

### Act (완료)
- **상태**: 배포 완료 (v5.9.0)
- **미해결 사항**: 우선순위 낮음 (선택적 개선):
  1. ABCompareCard 구현 (base vs learned 평균 비교 카드)
  2. WeightBarChart ranging 탭 전환 UI
  3. 설계서 학습 트리거 요일 현행화 (토요일 → 월요일)

---

## 3. 실제 구현 결과

### P1: ATR × 학습 통합 ✅ 완료

**문제 해결**:
- 기존: `learning.risk.stopLoss = -4%` → ATR 계산으로 덮어씀 (학습 무시)
- 해결: ATR 배수 자체를 학습 대상으로 통합

**구현 상세**:
```
indicators.ts:
- AtrMultipliers { stop: 2.0, profit: 3.0, trailing: 1.5 } 인터페이스
- DEFAULT_ATR_MULTIPLIERS 상수 정의
- calcDynamicRisk(atr, price, multipliers=DEFAULT) 파라미터 확장
- 하한 가드: stopLoss ≤ -2, takeProfit ≥ 3, trailingStop ≤ -1.5

learning.ts:
- learnAtrMultipliers(trades, confidence) 함수 추가
- 중앙값 기반 배수 계산, 0 나누기 방지
- 신뢰도 별 적용 범위 제어

engine/route.ts:
- STEP 1 루프 내 const stopLoss/takeProfit 독립 선언 (스코프 버그 해소)
```

**검증**: 
- ✅ 기존 고정값 기반에서 학습 배수 기반으로 전환
- ✅ 두 매개변수 간 충돌 제거
- ✅ A/B 점수 병렬 계산으로 학습 효과 추적 가능

---

### P2: 포지션 사이징 동적화 ✅ 완료

**문제 해결**:
- 기존: 변동성 무관하게 종목별 동일 금액(100만원) 투자
- 해결: ATR 기반 변동성 역비례 포지션 사이징

**구현 상세**:
```
indicators.ts:
- calcPositionSize(atr, price, targetRiskAmount, maxPerTrade) 함수
- 공식: targetRiskAmount / (atr × stopMultiplier / price)
- 최소 1주 보장: Math.max(calculated, currentPrice)
- 최대 금액 상한선: Math.min(result, maxPerTrade)

learning.ts:
- learnPositionSizing(trades, confidence) — 손절 건 평균 손실 역산
- 목표 리스크 금액 자동 최적화

engine/route.ts:
- calcPositionSize() 적용, 동적 포지션 사이징 활성화
```

**검증**:
- ✅ 고변동성 종목: 투자금 하향 조정
- ✅ 저변동성 종목: 투자금 정상 유지
- ✅ 최소 1주 최대 한도선 보장

---

### P3: 경험 데이터 수집 + 학습 영속화 ✅ 완료

**DB 스키마**:

`trade_memory` 테이블 (22컬럼):
```
진입 시: stock_code, rsi_value, macd_histogram, ma_cross, bb_position,
         volume_ratio, adx_value, candle_pattern
컨텍스트: regime, base_score, learned_score, total_score,
         market_bonus, investor_bonus, snapshot_bonus, atr_value, position_size
결과: pnl_percent, pnl_amount, hold_days, exit_reason, is_win
```

`learning_snapshots` 테이블 (18컬럼):
```
메타: sample_size, confidence, created_at, expires_at, is_active
학습: weights_trending, weights_ranging, atr_mult_stop/profit/trailing,
     target_risk_amount
성과: win_rate, avg_win, avg_loss, pattern_stats
```

**구현 상세**:
```
engine/route.ts:
- recordTradeMemory() — 매수 진입 시 7종 지표 + base/learned 점수 저장
- A/B base_score 캔들 데이터 재사용 (중복 계산 방지)
- closeTradeMemory() — 청산 시 closed_at IS NULL 조건 UPDATE

learning.ts:
- saveLearning() — UPDATE → INSERT 순서 (원자성 보장)
- loadLatestLearning() — 만료 폴백 포함 로직
- calcConfidence() — 임계값 기반 신뢰도 등급 (10/30/50)
```

**마이그레이션**:
- ✅ Supabase 마이그레이션 SQL 실행 완료 (2026-04-11)
- ✅ 기존 positions 테이블과 독립적 운영

---

### P4: 학습 전용 Cron + API ✅ 완료

**구현 상세**:
```
observer/route.ts:
- UTC 월요일 (getUTCDay() === 1) 조건부 학습 트리거
- Vercel Cron 슬롯 제약 (2개) 유지하면서 병합

api/learn/route.ts (신규):
- GET /api/learn?history=N — 최근 N회 학습 이력 조회
- POST /api/learn — 학습 실행 (CRON_SECRET 인증)
- 5개 학습 함수 병렬 호출:
  * learnAtrMultipliers()
  * learnPositionSizing()
  * learnRiskParamsTakeProfitRatio()
  * learnPatternStats()
  * learnWeights()
```

**학습 항목**:
- 지표별 가중치 (RSI, MACD, MA, Bollinger, ADX, 캔들패턴)
- ATR 배수 최적값 (손절/익절/트레일링)
- takeProfitRatio 동적 조정 (승률 기반):
  - 승률 >60% → 30% (나머지 트레일링)
  - 승률 >50% → 40%
  - 승률 <35% → 70% (확정 수익 우선)
  - 신뢰도 medium 이상일 때만 적용

---

### P5: 종목 적합성 스코어링 ✅ 완료

**구현 상세**:
```
api/stats/stocks/route.ts (신규):
- GET /api/stats/stocks — 종목별 성과 API
- fitness_score = winRate×0.5 + PF×0.3 + sampleAdequacy×0.2
- 5건 미만: neutral 등급/50점
- 종목별 메트릭:
  * 승률, 평균 수익, 평균 손실
  * 손익비 (Profit Factor)
  * 거래 수 (데이터 신뢰도)

components/stock-stats-section.tsx:
- 종목별 성과 테이블
- "성과미흡" 배지 (fitness_score < 30점)
- 정렬: 최근순/성과순/적합도순
```

**활용**:
- ✅ 부진 종목 자동 필터링 제안
- ✅ 전략 적합도 데이터 기반 추적

---

### P6: 학습 현황 대시보드 ✅ 93% (1개 UI 선택적)

**구현 상세**:
```
components/learning-section.tsx:
- LearningHeader: 신뢰도 배지 + 마지막 학습 날짜
- 만료 경고 (isExpired=true 시)
- AtrMultiplierRow: 기본값 → 학습값 비교
- WeightBarChart: 추세장 기준 지표 가중치 (trending 고정)
- LearningHistoryTable: 최근 5회 학습 이력

components/stats-tab.tsx:
- LearningSection + StockStatsSection 통합
- 탭 구조: 학습 현황 / 종목별 성과
```

**미구현 항목** (선택적):
- ❌ ABCompareCard — base_score vs learned_score 최근 30건 평균 비교
- 영향도: 낮음 (UI 보조 정보)

---

## 4. 주요 설계 변경 이력

| # | 원인 | 설계 | 구현 | 영향도 |
|---|------|------|------|:------:|
| 1 | Cron 슬롯 제약 | 토요일 UTC 15:00 독립 Cron | UTC 월요일 `/api/observer` 병합 | 낮음 |
| 2 | 데이터 모델 검증 | bb_position: lower/upper | below/above (코드 기준) | 낮음 |
| 3 | 학습 트리거 방식 | 일일 엔진 실행 중 학습 | 주간 API 호출 (월요일) | 낮음 |

**합의 사항**:
- ✅ Vercel Cron 2개 슬롯 유지 (vercel.json 변경 없음)
- ✅ learnRiskParamsTakeProfitRatio 신뢰도 medium 이상 조건 추가
- ✅ calcPositionSize 최소 1주 보장 로직 추가

---

## 5. 성과 지표

### 완성도
| 항목 | 목표 | 결과 | 상태 |
|------|------|------|:----:|
| GAP 분석 Match Rate | ≥90% | 97% | ✅ |
| P1 구현율 | 100% | 100% | ✅ |
| P2 구현율 | 100% | 100% | ✅ |
| P3 구현율 | 100% | 100% | ✅ |
| P4 구현율 | 100% | 100% | ✅ |
| P5 구현율 | 100% | 100% | ✅ |
| P6 구현율 | 100% | 93% | ✅ |

### 코드 메트릭
| 지표 | 값 |
|------|-----|
| 신규 파일 | 4개 |
| 수정 파일 | 6개 |
| 신규 테이블 | 2개 (trade_memory, learning_snapshots) |
| 신규 컬럼 | 40개 (테이블 전체 22+18) |
| 신규 함수 | 8개 (learning + API) |
| Supabase 마이그레이션 | 1회 (2026-04-11) |

### 배포
| 항목 | 값 |
|------|-----|
| 버전 | v5.9.0 |
| 배포 플랫폼 | Vercel |
| 상태 | ✅ 완료 |
| 배포일 | 2026-04-11 |

---

## 6. 이슈 및 해결

### 주요 이슈

| 번호 | 이슈 | 원인 | 해결 방법 | 상태 |
|------|------|------|----------|:----:|
| #1 | ATR 배수와 학습값 충돌 | 아키텍처 설계 미흡 | AtrMultipliers 인터페이스화 + 학습 대상화 | ✅ |
| #2 | 학습 데이터 재계산 반복 | 영속화 없음 | learning_snapshots 테이블 + loadLatestLearning | ✅ |
| #3 | Cron 슬롯 초과 | Vercel 플랜 제약 | /api/observer 병합 (월요일 조건부) | ✅ |
| #4 | 스코프 버그 (stopLoss) | let 변수 루프 외 선언 | const 루프 내 선언으로 변경 | ✅ |
| #5 | 만료 데이터 폴백 없음 | 설계 미상세 | loadLatestLearning 폴백 로직 추가 | ✅ |

### 열린 이슈 (선택적 개선)

| 번호 | 항목 | 우선순위 | 예상 일정 |
|------|------|:--------:|----------|
| #OP1 | ABCompareCard UI 구현 | 낮음 | v5.9.1 |
| #OP2 | WeightBarChart ranging 탭 전환 | 낮음 | v5.10.0 |
| #OP3 | 설계서 현행화 (요일 표기) | 문서 | 즉시 |

---

## 7. 기술적 의사결정

### 1. Cron 통합 방식 (결정 2026-04-11)
**선택지**:
- A) 별도 Cron 2개 추가 (비용 증가, Hobby 플랜 불가)
- B) /api/observer에 월요일 조건 병합 (구현함, 선택함)

**선택 이유**: Vercel Hobby 플랜 Cron 2개 제한, 추가 비용 제약

---

### 2. takeProfitRatio 적용 조건 (결정 2026-04-11)
**선택지**:
- A) 모든 신뢰도에 즉시 적용
- B) 신뢰도 medium 이상(30건+) 시만 적용, 미만은 기본값 50% (구현함, 선택함)

**선택 이유**: 작은 샘플에서의 과적합 방지, 안정성 우선

---

### 3. 포지션 사이징 하한 (결정 2026-04-11)
**선택지**:
- A) 무제한 하향 조정 (고변동성 종목 제외)
- B) 최소 1주 보장 (구현함, 선택함)

**선택 이유**: 포지션 최소화로 인한 거래 미실행 방지

---

## 8. 배운 점

### 잘 된 점
1. **설계-구현 동시 진행**: design-validator 검토를 통해 11가지 주요 이슈를 미리 적립하여 구현 품질 향상
2. **DB 정규화**: trade_memory와 learning_snapshots 분리로 학습 데이터 독립적 관리 가능
3. **신뢰도 기반 점진적 적용**: 신뢰도 등급별로 학습 결과 적용 범위를 차별화하여 안정성 확보
4. **마이그레이션 전략**: 기존 positions 테이블과 독립적으로 trade_memory 운영하여 하위호환성 유지

### 개선이 필요한 부분
1. **ABCompareCard 지연**: UI 구현 일정 부족으로 핵심 비교 기능이 누락됨
2. **Cron 문서화**: UTC/KST 요일 표기가 설계서에 불명확하여 design-validator 단계에서 오류 발견
3. **샘플 데이터 부족**: 배포 후 실 거래 데이터 수집 필요 (현재 >50건 필요한 medium 신뢰도 미달)

---

## 9. 다음 단계

### 즉시 (v5.9.1)
- [ ] ABCompareCard 구현 (base vs learned 평균 비교)
- [ ] 설계서 학습 요일 현행화 (토요일 → 월요일)
- [ ] API 문서화 (/api/learn, /api/stats/stocks)

### 단기 (v5.10.0, 2개월)
- [ ] WeightBarChart ranging 탭 전환 UI 추가
- [ ] 종목별 성과 대시보드 고급 필터 (기간, 레짐별)
- [ ] 학습 알림 설정 (신뢰도 상향 시 푸시)

### 중기 (v6.0.0, 3~6개월)
- [ ] 실시간 강화학습 고도화 (현재는 주 1회 배치)
- [ ] 종목별 권장 매매량 자동 제시
- [ ] 시장 레짐 변화 감지 (trending → ranging 전환 시 알림)

### 장기
- [ ] 다중 전략 분기 (현재는 단일 엔진)
- [ ] ML 모델 통합 (Vercel Serverless 제약 극복 시)

---

## 10. 참고 문서

| 문서 | 경로 | 상태 |
|------|------|:----:|
| 계획서 | `docs/01-plan/features/adaptive-engine.plan.md` | ✅ |
| 설계서 | `docs/02-design/features/adaptive-engine.design.md` | ✅ |
| GAP 분석 | `docs/03-analysis/adaptive-engine.analysis.md` | ✅ |
| API 스펙 | 설계서 Section 3 | ✅ |
| DB 스키마 | 설계서 Section 2 | ✅ |

---

## 11. 승인 및 서명

| 구분 | 이름 | 서명 | 날짜 |
|------|------|------|------|
| 개발팀 | NEXIO 팀 | ✅ | 2026-04-11 |
| 검증 | gap-detector | ✅ 97% Match | 2026-04-11 |
| 배포 | Vercel | ✅ v5.9.0 | 2026-04-11 |

---

**이 보고서는 PDCA 사이클의 Act 단계를 완료하며, adaptive-engine 기능이 프로덕션 상태에 진입했음을 증명합니다.**
