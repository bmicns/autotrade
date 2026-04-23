# NEXIO 자동매매 앱 차세대 고도화 계획서

> **Summary**: NEXIO v5.x 기반 자동매매 엔진의 13개 고도화 항목 전체 계획 — 즉시/중기/장기 3단계 로드맵
>
> **Project**: NEXIO (autotrade)
> **Version**: v5.2.1 → 목표 v6.0.0
> **Author**: Product Manager
> **Date**: 2026-04-20
> **Status**: Draft

---

## 관련 문서

- 소스: `/Users/watchers/Desktop/autotrade/src/`
- 배포: https://nexio.vercel.app
- 크론: GitHub Actions (평일 09:30 / 11:00 / 13:00 / 14:30 KST, 무료 플랜 고정)

---

## 제약 조건 (전 항목 공통)

| 제약 | 내용 |
|------|------|
| API | KIS 모의투자 API (실거래소 동일 스펙, Rate Limit 주의) |
| 크론 스케줄 | 평일 4회 고정 — 변경 불가 |
| 플랫폼 | Vercel (서버리스, 실행 시간 제한 60초/함수) |
| DB | Supabase (PostgreSQL + RLS) |
| 인프라 비용 | 무료 플랜 유지 |

---

## 5대 개발 원칙 준수 방안

| 원칙 | 적용 방안 |
|------|----------|
| 500줄 제한 | 각 항목 구현 시 파일이 400줄 초과하면 즉시 모듈 분리. 예: steps.ts → steps-scan.ts / steps-hold.ts 분리 패턴 유지 |
| 단일 책임 | UI(components/) / 엔진 로직(lib/engine/) / DB(lib/engine/db.ts) / 알림(lib/engine/notify.ts) 역할 혼재 금지 |
| 서버 검증 | 모든 API route에서 입력값 Zod 스키마 검증. 크론 엔진 호출 시 secret 헤더 검증 |
| 성능 | batchFetch 패턴 유지(배치 3개, 200ms 딜레이). N+1 금지. Supabase select 필요 컬럼만 지정 |
| 폴더 구조 | lib/engine/(비즈니스로직), components/(UI), hooks/(상태), app/api/(라우트), types/(타입) 엄수 |

---

## Phase 1 — 즉시 구현 (1~2일, v5.3.0 목표)

---

### [항목 1] Sparkline 실데이터 연동

**우선순위**: ★★★

**목적**
홈 탭 보유종목 카드의 스파크라인이 현재 `[price*0.98, price*0.99, price*1.0]` 더미 데이터로 렌더링됨.
실제 10일 종가를 보여줘 사용자가 가격 흐름을 즉각 파악할 수 있도록 한다. 매수 평균단가 기준선을 오버레이해 수익/손실 구간을 시각화한다.

**현재 문제**
- `src/components/ui/sparkline.tsx`: SVG 렌더러는 완성됐으나 데이터 주입부가 더미값
- `src/app/api/kis/daily-price/route.ts` 존재 확인됨 — 프론트에서 미활용

**구현 방법**

1. `src/hooks/useSparklineData.ts` 신규 생성
   - 보유종목 코드 배열을 받아 `GET /api/kis/daily-price?code=` 병렬 호출
   - 결과를 `Map<code, number[]>` 형태로 반환 (SWR/React Query 없이 `useState + useEffect`)
   - 캐시: sessionStorage 키 `sparkline_{code}_{date}` — 같은 날 재요청 방지

2. `src/components/ui/sparkline.tsx` 수정
   - `avgPrice?: number` prop 추가
   - avgPrice가 있으면 Y축 기준선(점선) 렌더링: `<line>` 엘리먼트로 수평선 표시

3. `src/components/home/home-tab.tsx` 수정
   - `useSparklineData(holdingCodes)` 호출
   - 각 보유종목 카드에 실데이터 + avgPrice 전달

**영향 파일**
- 신규: `src/hooks/useSparklineData.ts`
- 수정: `src/components/ui/sparkline.tsx`, `src/components/home/home-tab.tsx`

**예상 소요**: 0.5일

**성능 고려사항**
- 종목별 API 1회 호출 → batchFetch 패턴으로 3개씩 묶음
- 응답 10개 캔들 데이터 → 이미 `/api/kis/daily-price` 구현됨, 재사용

---

### [항목 2] 세션 시간 DB 검증 (크론 커버리지 경고)

**우선순위**: ★★★

**목적**
전략 탭에서 사용자가 매수/매도 시간대를 설정할 때, 현재 크론 스케줄(09:30/11:00/13:00/14:30)과 교차되지 않으면 해당 전략이 실제로 실행될 수 없음. 사용자에게 실시간 경고 UI를 제공한다.

**현재 문제**
- 전략 파라미터 저장 시 크론 실행 시각과의 교차 여부 검증 없음
- 사용자가 "11:30~12:30 매수" 설정 → 크론이 없어 실제 실행 불가하지만 오류 없이 저장됨

**구현 방법**

1. `src/lib/cron-coverage.ts` 신규 생성
   ```
   CRON_TIMES = ["09:30", "11:00", "13:00", "14:30"]
   function checkSessionCoverage(startHHMM: string, endHHMM: string): {
     covered: boolean;
     matchedSlots: string[];
     warning?: string;
   }
   ```
   - 세션 범위 내에 크론 시각이 1개 이상 포함되면 covered = true

2. `src/components/strategy/strategy-tab.tsx` 수정
   - 시간 입력 onChange 시 `checkSessionCoverage` 즉시 호출 (클라이언트 검증)
   - covered = false 시: 노란색 경고 배너 표시 "이 시간대에는 크론이 실행되지 않아 전략이 동작하지 않을 수 있습니다"
   - 저장 버튼은 비활성화하지 않음 — 경고만 표시 (사용자 선택 존중)

3. `src/app/api/kis/config/route.ts` PUT 핸들러에 서버 측 검증 추가
   - 동일 로직으로 서버에서 재검증
   - covered = false → 응답에 `warning` 필드 포함 (400 에러 아님)

**영향 파일**
- 신규: `src/lib/cron-coverage.ts`
- 수정: `src/components/strategy/strategy-tab.tsx`, `src/app/api/kis/config/route.ts`

**예상 소요**: 0.5일

---

### [항목 3] 텔레그램 알림 실연결

**우선순위**: ★★★

**목적**
`src/lib/engine/notify.ts`의 `sendTradeAlert` / `sendDailyReport` / `sendMarketCloseAlert` 함수가 이미 완성됨.
환경변수 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`를 Vercel 환경변수에 등록하고, 엔진 호출 지점과 일일 리포트 크론에서 실제 호출을 검증한다.

**현재 문제**
- `notify.ts` 코드는 완성됐으나 Vercel 환경변수 미등록 상태 추정
- `src/app/api/daily-report/route.ts`: `sendDailyReport` 호출 여부 미확인
- 오류 알림(`sendErrorAlert`) 함수가 없음 — 엔진 크론 실패 시 무음

**구현 방법**

1. `src/lib/engine/notify.ts` 수정
   - `sendErrorAlert(context: string, error: string): Promise<void>` 함수 추가
   - 엔진 크론 route(`/api/engine/route.ts`)의 catch 블록에서 호출

2. Vercel 환경변수 등록 체크리스트 (문서화)
   - `TELEGRAM_BOT_TOKEN` — 봇 토큰
   - `TELEGRAM_CHAT_ID` — 수신 채팅 ID

3. `src/app/api/daily-report/route.ts` 확인 후
   - `sendDailyReport` 호출 누락 시 추가
   - 리포트 데이터 집계 로직과 연결

4. `src/app/api/engine/route.ts` 수정
   - try/catch 최상위에서 `sendErrorAlert` 호출 추가

**영향 파일**
- 수정: `src/lib/engine/notify.ts`, `src/app/api/engine/route.ts`, `src/app/api/daily-report/route.ts`

**예상 소요**: 0.5일

---

## Phase 2 — 중기 구현 (1주, v5.5.0 목표)

---

### [항목 4] 체결 확인 루프 (pending_orders 테이블)

**우선순위**: ★★★

**목적**
현재 지정가 매수 주문 후 실제 체결 여부를 확인하지 않음. 미체결 주문이 쌓여도 positions 테이블에 이미 기록되어 있어 포지션 불일치 발생. 주문번호 기반 체결 조회 → 미체결 N분 경과 시 자동 취소 루프를 구현한다.

**현재 문제**
- `limitBuyOrder` 성공 시 즉시 `openPosition` 호출 → 실제 체결 전 포지션 등록
- STEP 0의 `cancelOpenBuyOrders`는 KIS 미체결 목록을 조회해 취소하지만, DB와 동기화 없음
- 미체결 취소 후 positions 테이블에 잔류 레코드 문제 발생 가능

**구현 방법**

1. Supabase 테이블 추가: `pending_orders`
   ```sql
   CREATE TABLE pending_orders (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     stock_code text NOT NULL,
     stock_name text,
     ord_no text NOT NULL,          -- KIS 주문번호
     limit_price integer NOT NULL,
     qty integer NOT NULL,
     signal_score integer,
     created_at timestamptz DEFAULT now(),
     expires_at timestamptz NOT NULL, -- 생성 후 N분
     status text DEFAULT 'pending'   -- pending / filled / cancelled
   );
   ```

2. `src/lib/engine/db.ts` 수정
   - `insertPendingOrder(...)` — 주문 후 즉시 저장
   - `resolvePendingOrder(ordNo, status)` — 체결/취소 처리
   - `getExpiredPendingOrders()` — expires_at 초과 조회

3. `src/lib/engine/steps.ts` STEP 0 수정
   - 미체결 KIS 주문목록 조회 후 `pending_orders`와 대조
   - DB에 있으나 KIS에 없으면 → 체결 완료로 처리 (positions 확정)
   - expires_at 초과 시 KIS 취소 주문 + `resolvePendingOrder(..., 'cancelled')` + positions 롤백

4. `src/lib/engine/steps.ts` STEP 1.5 수정
   - 승인 매수 후 `openPosition` 즉시 호출 → `insertPendingOrder` 로 교체
   - positions 등록은 체결 확인 후로 이연

**영향 파일**
- Supabase 마이그레이션: `pending_orders` 테이블
- 수정: `src/lib/engine/db.ts`, `src/lib/engine/steps.ts`

**예상 소요**: 2일

**주의**: steps.ts 현재 줄 수 확인 필요. 400줄 초과 시 steps-pending.ts 분리 우선 보고.

---

### [항목 5] 학습 콜드 스타트 (10건부터 부분 활성화)

**우선순위**: ★★

**목적**
현재 trade_memory 50건 이상이어야 학습 결과 적용. 초기 운영 기간(10~49건)에는 학습이 전혀 작동하지 않아 기본값만 사용. 10건부터 신뢰도 low/가중치 50% 반영으로 점진적 학습을 활성화한다.

**현재 문제**
- `src/lib/learning-engine.ts`: `confidence` 계산 시 50건 미만 → "none" 반환
- "none"이면 AppliedLearning이 기본값만 사용 → 학습 효과 없음

**구현 방법**

1. `src/lib/learning-engine.ts` 수정
   - 신뢰도 구간 재정의:
     ```
     10~29건: confidence = "low",   가중치 혼합 50% (학습:기본 = 1:1)
     30~49건: confidence = "medium", 가중치 혼합 75%
     50건+:   confidence = "high",   학습 가중치 100%
     ```
   - `blendWeights(learned, base, ratio)` 헬퍼 함수 추가

2. `src/lib/learning.ts` 수정
   - `AppliedLearning` 빌드 시 confidence 별 blendWeights 적용
   - UI에 "학습 신뢰도: 낮음 (10건 기반)" 표시용 필드 추가

3. `src/components/stats/learning-section.tsx` 수정
   - 신뢰도 배지 표시: low(주황) / medium(노랑) / high(초록)

**영향 파일**
- 수정: `src/lib/learning-engine.ts`, `src/lib/learning.ts`, `src/components/stats/learning-section.tsx`

**예상 소요**: 1일

---

### [항목 6] 시장 급락 매수 중단

**우선순위**: ★★★

**목적**
KOSPI -2% 이하 급락 시 신규 매수를 전면 중단하고, 손절 기준을 강화해 추가 손실을 방지한다.

**현재 문제**
- `src/lib/engine/market.ts`: KOSPI -1% 이하 bonus = -20, -0.3% 이하 bonus = -10
- 점수 패널티만 있고 매수 실행 자체를 차단하는 로직 없음
- avgRate <= -1.0 기준 → -2% 급락과 구분 안 됨

**구현 방법**

1. `src/lib/engine/market.ts` 수정
   - `MarketTrend` 타입에 `crashed: boolean` 필드 추가
   - KOSPI 단독 (kosdaqRate 아님) -2% 이하 시 `crashed = true`
   - 이유: KOSPI는 시장 전체 대표 지수, KOSDAQ 급락만으로는 과민 반응 방지

2. `src/lib/engine/types.ts` 수정
   - `MarketTrend` 인터페이스에 `crashed: boolean` 추가

3. `src/lib/engine/steps.ts` STEP 2 (스캔/매수) 수정
   - `ctx.marketTrend.crashed === true` 시 STEP 2 스킵
   - actions에 `{ type: "market_crash_halt", detail: "KOSPI -2% 이하 급락 — 신규 매수 전면 중단" }` 기록

4. STEP 1 손절 강화
   - `crashed === true` 시 `holdStopLoss`를 설정값보다 1.5x 타이트하게 적용
   - 예: 설정 -5% → 급락 시 -3.3% 적용

**영향 파일**
- 수정: `src/lib/engine/market.ts`, `src/lib/engine/types.ts`, `src/lib/engine/steps.ts`

**예상 소요**: 0.5일

---

### [항목 7] 2단계 익절 전략

**우선순위**: ★★

**목적**
현재 `takeProfitRatio`% 도달 시 설정 비율만큼 단일 매도. 2단계로 분할해 1차 50% 매도(이익 확보) + 2차 나머지 30% 매도(추가 상승 참여)로 수익 극대화.

**현재 문제**
- `src/lib/engine/steps.ts` STEP 1: `risk.action === "take_profit"` 시 `takeProfitRatio`% 매도 1회
- 잔여 포지션에 대한 2차 목표가 없음

**구현 방법**

1. `src/lib/engine/types.ts` 수정
   - `EngineConfig`에 추가:
     ```typescript
     takeProfit2Ratio?: number;  // 2차 익절 목표 (기본 takeProfitRatio * 1.5)
     takeProfit2SellPct?: number; // 2차 매도 비율 (기본 30%)
     ```

2. `src/lib/engine/steps.ts` STEP 1 수정
   - 1차 익절 도달: 보유량의 50% 매도 → `openPosition` 잔여 qty 업데이트
   - 2차 익절가 등록: positions 테이블에 `take_profit_2_price` 컬럼 기록
   - 다음 크론 STEP 1에서 2차 익절가 도달 여부 체크 → 30% 추가 매도

3. Supabase positions 테이블
   - `take_profit_2_price` 컬럼 추가 (nullable)
   - `phase` 컬럼 기존 "initial"/"full" → "tp1_pending" 상태 추가

4. UI: `src/components/settings/engine-control-section.tsx` 또는 `strategy-tab.tsx`
   - 2차 익절 목표가 / 2차 매도 비율 설정 항목 추가

**영향 파일**
- Supabase 마이그레이션: `positions.take_profit_2_price`, `positions.phase` 수정
- 수정: `src/lib/engine/types.ts`, `src/lib/engine/steps.ts`
- 수정(UI): `src/components/settings/engine-control-section.tsx`

**예상 소요**: 1.5일

---

### [항목 8] 승인 대기 신호 자동 만료 + 자동 승인

**우선순위**: ★★

**목적**
`pending_signals` 테이블의 대기 신호가 2시간 이상 방치 시 자동 폐기. 약한 신호(score 낮음)가 이후 크론에서 강한 신호로 재감지되면 자동 승인 처리.

**현재 문제**
- pending_signals에 대기 신호가 무한 누적 가능
- 수동 승인 없이는 모든 신호가 만료 → 자동화 수준 낮음
- 약한 신호가 후속 크론에서 강해져도 기존 pending을 재평가하지 않음

**구현 방법**

1. `src/lib/engine/steps.ts` STEP 0에 만료 처리 추가
   ```typescript
   await supabase.from("pending_signals")
     .update({ status: "expired", resolved_at: now })
     .eq("status", "pending")
     .lt("created_at", twoHoursAgo);
   ```

2. STEP 2 스캔 완료 후 신호 강화 감지
   - 기존 pending_signal과 동일 종목이 이번 스캔에서 strongScore 이상으로 재등장 시
   - 기존 pending_signal을 "approved"로 자동 업데이트
   - actions에 `{ type: "auto_approved", detail: "재감지 강한신호 자동승인" }` 기록

3. `src/app/api/pending-signals/route.ts`
   - GET 응답에 `created_at` 기준 만료 임박(90분 이상) 신호 강조 필드 추가

**영향 파일**
- 수정: `src/lib/engine/steps.ts`, `src/app/api/pending-signals/route.ts`

**예상 소요**: 0.5일

---

## Phase 3 — 장기 구현 (2~4주, v6.0.0 목표)

---

### [항목 9] 최적화 고도화 (복합 스코어 그리드 서치)

**우선순위**: ★★

**목적**
현재 optimize-thresholds는 단순 승률 기준 그리드 서치. 승률 + 평균수익률 + 샤프지수를 가중 복합 스코어로 평가해 더 안정적인 파라미터 조합을 선택한다. weakScore / trailingStop / takeProfitRatio도 최적화 범위에 포함.

**현재 문제**
- `src/app/api/optimize-thresholds/route.ts`: 승률만 기준
- weakScore, trailingStop, takeProfitRatio는 최적화 대상 외
- 샤프지수 계산 로직 없음

**구현 방법**

1. `src/lib/optimization.ts` 신규 생성
   ```typescript
   function calcSharpe(pnls: number[], riskFreeRate = 0): number
   function compositeScore(winRate, avgReturn, sharpe): number {
     return winRate * 0.4 + avgReturn * 0.35 + sharpe * 0.25
   }
   ```

2. `src/app/api/optimize-thresholds/route.ts` 수정
   - 그리드 탐색 파라미터 확장:
     ```
     rsiBuy: [25, 28, 30, 32, 35]
     strongScore: [60, 65, 70, 75]
     weakScore: [35, 40, 45]
     trailingStop: [-2, -2.5, -3, -3.5]
     takeProfitRatio: [40, 50, 60, 70]
     ```
   - 각 조합 → trade_memory 대상 시뮬레이션 → compositeScore 계산
   - 최고 점수 조합 반환

3. Vercel 함수 실행시간 60초 제한 주의
   - 그리드 탐색 조합 수 = 5×4×3×4×4 = 960개
   - 조합당 DB 쿼리 1회 (집계) → 약 10~15초 예상
   - 초과 시: 파라미터 범위 축소 또는 Background Job(Supabase Edge Function) 이전 검토

**영향 파일**
- 신규: `src/lib/optimization.ts`
- 수정: `src/app/api/optimize-thresholds/route.ts`

**예상 소요**: 3일

---

### [항목 10] 국면별 파라미터 세트 분리

**우선순위**: ★★

**목적**
trending/ranging 국면에서 가중치만 달리 적용하는 현재 구조를 rsiBuy / strongScore까지 국면별로 독립 설정할 수 있도록 확장. 국면에 따라 완전히 다른 매수 기준을 적용한다.

**현재 문제**
- `EngineConfig.rsiBuy`, `strongScore`는 국면 무관 단일값
- trending(추세장)에서는 RSI 과매도 조건 완화가 유리하나 현재 적용 불가

**구현 방법**

1. `src/lib/engine/types.ts` 수정
   ```typescript
   export interface RegimeParams {
     rsiBuy: number;
     strongScore: number;
     weakScore: number;
     takeProfitRatio: number;
   }
   export interface EngineConfig {
     ...
     regimeParams?: {
       trending: RegimeParams;
       ranging: RegimeParams;
     }
   }
   ```

2. `src/lib/engine/steps.ts` STEP 2 수정
   - `marketRegime` ('trending'|'ranging') 감지 후 `regimeParams[regime]` 적용
   - 기존 단일값은 fallback으로 유지

3. `src/components/strategy/strategy-tab.tsx` 수정
   - 국면별 파라미터 설정 UI 추가 (탭 또는 아코디언 형태)

4. `src/app/api/kis/config/route.ts`
   - `regimeParams` 저장/조회 처리

**영향 파일**
- 수정: `src/lib/engine/types.ts`, `src/lib/engine/steps.ts`
- 수정(UI): `src/components/strategy/strategy-tab.tsx`
- 수정(API): `src/app/api/kis/config/route.ts`

**예상 소요**: 2일

---

### [항목 11] 추가 지표 (스토캐스틱 RSI, OBV, 이격도)

**우선순위**: ★

**목적**
현재 RSI / MACD / 이동평균 / 볼린저 / 거래량 / 캔들패턴 6개 지표에 스토캐스틱 RSI, OBV(On Balance Volume), 이격도(MA20 괴리율) 3개를 추가해 신호 다양성과 정확도를 높인다.

**현재 문제**
- `src/lib/kis/indicators.ts`: 6개 지표만 존재
- 스토캐스틱 RSI — 단기 과매수/과매도 포착에 RSI보다 민감
- OBV — 거래량 기반 매집/분산 감지
- 이격도 — MA20 대비 현재가 괴리 → 단기 되돌림 예측

**구현 방법**

1. `src/lib/kis/indicators.ts` 수정
   ```typescript
   // 스토캐스틱 RSI
   function calcStochasticRSI(rsiSeries: number[], period = 14): { k: number; d: number }

   // OBV
   function calcOBV(candles: Candle[]): number  // 누적 OBV, 전일 대비 증감

   // 이격도
   function calcMA20Deviation(candles: Candle[]): number  // ((현재가 - MA20) / MA20) * 100
   ```

2. 신호 평가 함수 업데이트
   - 스토캐스틱 RSI k < 20 → 매수 신호 (+점수)
   - OBV 상승 추세 → +점수
   - 이격도 -5% 이하 → 과매도, +점수

3. `src/lib/learning-engine.ts` 수정
   - `INDICATOR_NAMES`에 3개 추가
   - BASE_WEIGHTS trending/ranging에 초기 가중치 배분

4. `src/components/stats/stock-stats-section.tsx`
   - 신규 지표 값 표시 추가

**영향 파일**
- 수정: `src/lib/kis/indicators.ts`, `src/lib/learning-engine.ts`
- 수정(UI): `src/components/stats/stock-stats-section.tsx`

**예상 소요**: 3일

**주의**: indicators.ts 줄 수 증가 예상 → 400줄 초과 시 indicators-extended.ts 분리 필요

---

### [항목 12] 포트폴리오 스냅샷 (일별 수익률 그래프, MDD)

**우선순위**: ★★

**목적**
매일 장 마감 후 총 평가금액을 Supabase에 저장하고, 주간/월간 수익률 추이 그래프와 MDD(최대 낙폭)를 자동 계산해 대시보드에 표시한다.

**현재 문제**
- 일별 총 평가금액 저장 로직 없음
- MDD 계산 없음
- 포트폴리오 탭(`portfolio-tab.tsx`)에 과거 수익률 그래프 없음

**구현 방법**

1. Supabase 테이블 추가: `portfolio_snapshots`
   ```sql
   CREATE TABLE portfolio_snapshots (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     snapshot_date date NOT NULL UNIQUE,
     total_eval_amount bigint NOT NULL,   -- 총 평가금액 (원)
     cash_amount bigint,                   -- 예수금
     realized_pnl_cumulative bigint,       -- 누적 실현손익
     open_positions integer,
     created_at timestamptz DEFAULT now()
   );
   ```

2. `src/app/api/market-close/route.ts` 수정
   - 장 마감 크론(15:30 또는 수동) 실행 시 KIS 잔고 조회 → `portfolio_snapshots` insert

3. `src/lib/portfolio.ts` 신규 생성
   ```typescript
   function calcMDD(snapshots: Snapshot[]): number  // 최고점 대비 최대 낙폭 %
   function calcPeriodReturn(snapshots: Snapshot[], days: number): number
   ```

4. `src/components/portfolio/portfolio-tab.tsx` 수정
   - 주간/월간 수익률 라인 차트 추가 (Sparkline 컴포넌트 재활용 또는 확장)
   - MDD 배지 표시

5. `src/app/api/stats/route.ts` 수정
   - portfolio_snapshots 조회 엔드포인트 추가

**영향 파일**
- Supabase 마이그레이션: `portfolio_snapshots` 테이블
- 신규: `src/lib/portfolio.ts`
- 수정: `src/app/api/market-close/route.ts`, `src/components/portfolio/portfolio-tab.tsx`

**예상 소요**: 2일

---

### [항목 13] 백테스트 실질화 (실현손익 vs 지표 분석)

**우선순위**: ★

**목적**
현재 `src/lib/backtest.ts`는 과거 가격 데이터 기반 단순 시뮬레이션. trade_memory의 실제 거래 결과와 지표 조합을 연결해 "어떤 파라미터 설정에서 실제로 수익이 났는가"를 분석하고, 파라미터 변경 전 시뮬레이션 기능을 추가한다.

**현재 문제**
- `src/lib/backtest.ts`: 가격 데이터만 사용, trade_memory와 연결 없음
- 파라미터 변경 전 "이 설정으로 과거 거래에서 어떤 결과였을까?" 검증 불가

**구현 방법**

1. `src/lib/backtest.ts` 전면 개편
   - `runBacktest(config: Partial<EngineConfig>, tradeMemoryRows: TradeMemory[]): BacktestResult`
   - trade_memory의 각 거래에 대해 새 config로 손절/익절 조건 재적용
   - 실현손익 재계산, 승률, MDD, 샤프지수 반환

2. `src/app/api/backtest/route.ts` 수정
   - POST body로 테스트할 config 파라미터 수신
   - trade_memory 조회 → `runBacktest` 실행 → 결과 반환

3. `src/components/stats/backtest-section.tsx` 수정
   - 파라미터 입력 폼 추가 (stopLoss, takeProfit, rsiBuy, strongScore)
   - "시뮬레이션 실행" 버튼 → 결과 비교 테이블 표시
   - 현재 설정 vs 시뮬레이션 설정 수익률 비교

**영향 파일**
- 수정: `src/lib/backtest.ts`, `src/app/api/backtest/route.ts`, `src/components/stats/backtest-section.tsx`

**예상 소요**: 4일

---

## 전체 로드맵 요약

| 단계 | 항목 | 우선순위 | 소요 | 버전 목표 |
|------|------|---------|------|----------|
| Phase 1 | 1. Sparkline 실데이터 | ★★★ | 0.5일 | v5.3.0 |
| Phase 1 | 2. 세션 시간 DB 검증 | ★★★ | 0.5일 | v5.3.0 |
| Phase 1 | 3. 텔레그램 알림 실연결 | ★★★ | 0.5일 | v5.3.0 |
| Phase 2 | 4. 체결 확인 루프 | ★★★ | 2일 | v5.5.0 |
| Phase 2 | 5. 학습 콜드 스타트 | ★★ | 1일 | v5.5.0 |
| Phase 2 | 6. 시장 급락 매수 중단 | ★★★ | 0.5일 | v5.5.0 |
| Phase 2 | 7. 2단계 익절 | ★★ | 1.5일 | v5.5.0 |
| Phase 2 | 8. 신호 자동 만료/승인 | ★★ | 0.5일 | v5.5.0 |
| Phase 3 | 9. 최적화 고도화 | ★★ | 3일 | v6.0.0 |
| Phase 3 | 10. 국면별 파라미터 세트 | ★★ | 2일 | v6.0.0 |
| Phase 3 | 11. 추가 지표 3종 | ★ | 3일 | v6.0.0 |
| Phase 3 | 12. 포트폴리오 스냅샷 | ★★ | 2일 | v6.0.0 |
| Phase 3 | 13. 백테스트 실질화 | ★ | 4일 | v6.0.0 |

**총 예상 소요**: Phase 1 (1.5일) + Phase 2 (5.5일) + Phase 3 (14일) = 약 21일

---

## DB 마이그레이션 목록

| 순서 | 테이블 | 변경 내용 | 항목 |
|------|--------|----------|------|
| 1 | `pending_orders` | 신규 생성 | #4 |
| 2 | `positions` | `take_profit_2_price` 컬럼 추가 | #7 |
| 3 | `positions` | `phase` ENUM 확장 | #7 |
| 4 | `portfolio_snapshots` | 신규 생성 | #12 |

---

## 리스크 및 완화 방안

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| Vercel 함수 60초 제한 초과 | 최적화(#9) 그리드 서치 타임아웃 | 파라미터 범위 축소 또는 Supabase Edge Function 이전 |
| KIS API Rate Limit | 지표 추가(#11) 시 캔들 요청 증가 | batchFetch 딜레이 유지, 종목 수 상한 조정 |
| steps.ts 줄 수 증가 | 500줄 원칙 위반 | 항목 4/6/7 구현 전 파일 줄 수 먼저 확인, 초과 시 즉시 분리 |
| pending_orders와 positions 불일치 | 항목 4 구현 중 데이터 정합성 위험 | 기존 positions 테이블 롤백 없이 마이그레이션. pending → confirmed 전환 트랜잭션 처리 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-20 | Initial draft — 13개 고도화 항목 전체 계획 | Product Manager |
