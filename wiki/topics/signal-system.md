# Signal System — 매매 신호 시스템

[coverage: high -- 7 sources]

## Purpose

NEXIO의 신호 시스템은 10종의 기술 지표를 가중치 점수제로 합산하고, 시장·투자자·장 초반 스냅샷 보정 점수를 더해 종목별 매수·매도 강도를 수치화한다. 점수에 따라 즉시 지정가 주문(strong), 사용자 승인 대기(weak), 무시(none) 세 가지 경로로 분기한다. 기본 가중치(`analyzeSignal`)와 학습 가중치(`analyzeSignalWithWeights`) 두 경로를 병렬 실행해 A/B 비교 데이터를 누적한다.

---

## Architecture

```
캔들 데이터 (최소 26일)
        │
        ▼
analyzeSignal / analyzeSignalWithWeights   ← src/lib/kis/indicators.ts
                                              (계산 함수: src/lib/kis/indicators-calc.ts)
        │  SignalResult { strength, side, totalScore, ... }
        │
        ├─ strong (≥70점) ─────────────────▶ 즉시 지정가 매수
        │
        ├─ weak  (40–69점) ────────────────▶ pending_signals 저장
        │                                        │
        │                  사용자 신호탭에서 승인 ▼
        │                        POST /api/kis/order
        │
        └─ none  (<40점) ──────────────────▶ 무시

보정 점수 (보너스/페널티):
  getMarketTrend()   ← src/lib/engine/market.ts   (시장 지수)
  getInvestorTrend() ← src/lib/engine/market.ts   (기관/외국인)
  market_snapshots   ← DB 09:00 스냅샷             (장 초반 갭)

종목 사전 필터:
  applyStockFilter()      ← src/lib/engine/filters.ts  (4개 조건)
  hasDangerousDisclosure() ← src/lib/engine/filters.ts (DART 공시)
```

---

## 10종 기술 지표

| 지표 | `raw` 필드 | 매수 조건 | 매도 조건 |
|------|-----------|----------|----------|
| RSI (14일) | `raw.rsi` | ≤ 30 (과매도) | ≥ 70 (과매수) |
| MACD 히스토그램 | `raw.macd` / `raw.macdCrossover` | crossover = `"golden"` | crossover = `"dead"` |
| 이동평균 크로스 | `raw.macdCrossover` (`golden`/`dead`/`none`) | MA5 > MA20 또는 골든크로스 | MA5 < MA20 |
| 볼린저 밴드 위치 | `raw.bbPosition` (`below`/`middle`/`above`) | `"below"` (하단 이탈) | `"above"` (상단 돌파) |
| 거래량 비율 | `raw.volumeRatio` | ≥ 200% (스파이크) | ≥ 200% (공통 조건) |
| ADX (14일) | `raw.adx` | > 25 → 추세장 판정 | 레짐 분류에만 사용 |
| 캔들 패턴 | `indicators.find(i => i.name === "캔들패턴")` | bullish 패턴 감지 | bearish 패턴 감지 |
| StochRSI | `raw.stochRsiK`, `raw.stochRsiD` | K < 20 AND D < 20 → +8pts | K > 80 AND D > 80 → +8pts |
| OBV (On Balance Volume) | `raw.obvSlope` | slope > 0 → +5pts | slope < 0 → −5pts |
| 이격도 (Disparity) | `raw.disparity` | < −5% → +7pts (과도 하락 반등) | > +10% → −7pts (과열) |

> **주의**: `bbPosition` 값은 코드 기준 `"below"` / `"above"` 를 사용한다. 설계서에 등장하는 `"lower"` / `"upper"` 표기와 다르다.

> **신규 3종 (StochRSI, OBV, 이격도) 점수 반영 방식**: 기본 가중치 테이블(최대 100점)을 거치지 않고 보너스/페널티로 `buyTotal` / `sellTotal`에 직접 가산된다. 최대 가능 기본 점수는 기존 100점에서 최대 ~120점(+20 보너스)으로 늘어났다.

### 캔들 패턴 목록 (src/lib/candle-patterns.ts)

총 12가지 패턴을 감지한다. 최근 3개 캔들 기준으로 계산한다.

| 유형 | 패턴명 (영문) | 한글명 | 신뢰도 | 점수 기여 |
|------|-------------|--------|--------|---------|
| 반전 상승 | Hammer | 망치형 | 2 | +10 |
| 반전 상승 | Bullish Engulfing | 상승 장악형 | 3 | +15 |
| 반전 상승 | Morning Star | 모닝스타 | 3 | +15 |
| 반전 상승 | Piercing | 관통형 | 2 | +10 |
| 반전 하락 | Hanging Man | 교수형 | 2 | −10 |
| 반전 하락 | Bearish Engulfing | 하락 장악형 | 3 | −15 |
| 반전 하락 | Evening Star | 이브닝스타 | 3 | −15 |
| 반전 하락 | Dark Cloud Cover | 먹구름형 | 2 | −10 |
| 중립 | Doji | 도지 | 1 | 0 |
| 중립 | Long-legged Doji | 십자도지 | 2 | 0 |
| 중립 | Spinning Top | 팽이형 | 1 | 0 |
| 강세 확인 | Bullish Marubozu | 양봉 마루보주 | 2 | +8 |
| 약세 확인 | Bearish Marubozu | 음봉 마루보주 | 2 | −8 |

`patternBuyScore(patterns)` — bullish 패턴 점수 합산 (양수만 누적).  
`patternSellScore(patterns)` — bearish 패턴 점수 합산 (음수만 누적).

---

## SignalRaw 필드 참조

`analyzeSignal` 반환값의 `raw` 객체에 포함되는 주요 필드 목록이다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `raw.rsi` | `number` | RSI 14일 값 |
| `raw.macd` | `number` | MACD 히스토그램 값 |
| `raw.macdCrossover` | `"golden" \| "dead" \| "none"` | 이동평균 크로스 상태 |
| `raw.bbPosition` | `"below" \| "middle" \| "above"` | 볼린저 밴드 위치 |
| `raw.volumeRatio` | `number` | 거래량 비율 (%) |
| `raw.adx` | `number` | ADX 14일 값 |
| `raw.stochRsiK` | `number` | StochRSI K 값 (0–100) |
| `raw.stochRsiD` | `number` | StochRSI D 값 (0–100) |
| `raw.obvSlope` | `number` | OBV 기울기 (양수=상승, 음수=하락) |
| `raw.disparity` | `number` | 이격도 (%) — 현재가 대비 이동평균 편차 |

---

## 레짐(Regime) 분류

ADX 값으로 시장 성격을 판단하고 지표별 가중치를 동적으로 조정한다.

```typescript
const regime: "trending" | "ranging" = adx > 25 ? "trending" : "ranging";
```

| 레짐 | ADX 조건 | 가중치 특성 |
|------|---------|-----------|
| `"trending"` (추세장) | ADX > 25 | MACD(26), MA(22), 거래량(21) 비중 높음 |
| `"ranging"` (횡보장) | ADX ≤ 25 | RSI(21), 볼린저(21), 거래량(17) 비중 높음 |

### 기본 가중치 테이블

| 지표 | trending | ranging |
|------|---------|---------|
| RSI | 8 | 21 |
| MACD | 26 | 13 |
| 이동평균 | 22 | 13 |
| 볼린저 밴드 | 8 | 21 |
| 거래량 | 21 | 17 |
| 캔들 패턴 | 15 | 15 |
| **합계** | **100** | **100** |

---

## 신호 강도 임계값

```
adjustedScore ≥ 70  →  "strong"  →  즉시 지정가 매수
adjustedScore 40–69 →  "weak"    →  pending_signals INSERT (status='pending')
adjustedScore < 40  →  "none"    →  무시
```

지표 개수 조건도 병행 적용된다.

```typescript
// 강한 신호: 점수 ≥ 70 OR 지표 4개 이상 hit
// 약한 신호: 점수 ≥ 40 OR 지표 2개 이상 hit
if (buyTotal >= 70 || buyCount >= 4) { strength = "strong"; side = "buy"; }
else if (buyTotal >= 40 || buyCount >= 2) { strength = "weak"; side = "buy"; }
```

---

## 보정 점수 3종

기술 지표 점수에 아래 보정값을 더해 최종 `adjustedScore`를 산출한다.

### 1. 시장 모멘텀 보정 — `getMarketTrend()` (src/lib/engine/market.ts)

KOSPI(`"0001"`) + KOSDAQ(`"1001"`) 전일 대비 등락률 평균을 기반으로 계산한다.

| 평균 등락률 | 보너스 | 레이블 예시 |
|-----------|--------|-----------|
| ≥ +1.0% | **+15점** | 시장 강세 |
| ≥ +0.3% | +8점 | 시장 상승 |
| ≤ −0.3% | −10점 | 시장 하락 |
| ≤ −1.0% | **−20점** | 시장 급락 |

> 실제 코드에서 임계값은 설계 사양(+1%/+0.5%)과 일부 다르다. 현재 구현은 +1.0%/+0.3%, −0.3%/−1.0% 기준이다.

반환 타입: `MarketTrend { kospiRate, kosdaqRate, bonus, label }`

### 2. 투자자 매매동향 보정 — `getInvestorTrend()` (src/lib/engine/market.ts)

최근 5영업일 범위에서 최근 3일 기관·외국인 순매수를 합산한다. 단위는 백만원 → 억원 변환(`/ 100`).

| 조건 | 보너스 |
|------|--------|
| 기관 + 외국인 동반 순매수 | **+25점** |
| 기관 순매수만 | +15점 |
| 외국인 순매수만 | +10점 |
| 기관 + 외국인 동반 순매도 | **−25점** |
| 기관 순매도만 | −15점 |
| 외국인 순매도만 | −10점 |

반환 타입: `InvestorTrend { orgn, frgn, bonus, label }`

### 3. 장 초반 스냅샷 보정 — `market_snapshots` 테이블

09:00 스냅샷 데이터를 기반으로 당일 갭과 초반 거래량을 평가한다.

| 조건 | 보너스 |
|------|--------|
| 갭 > +1% AND 거래량 > 50,000 | +15점 |
| 갭 > +0.5% | +8점 |
| 갭 < −1% | −10점 |
| 갭 < −2% | −20점 |

---

## Pending Signals 흐름 (weak 신호 처리)

```
엔진 실행
  │
  ├─ weak signal 감지
  │       │
  │       ▼
  │  pending_signals INSERT
  │  { status: 'pending', source: 'watchlist'|'surge' }
  │
사용자 신호탭 (UI)
  │
  ├─ "매수 승인" 클릭
  │       │
  │       ▼
  │  signal-tab.tsx → POST /api/kis/order
  │  (stockCode, side, quantity만 전달 — 인증정보는 DB에서 조회)
  │       │
  │       ├─ 성공 → PATCH /api/pending-signals { status: 'expired' }
  │       └─ 실패 → POST /api/pending-signals { action: 'approved' }
  │                 (엔진 다음 주기에 STEP 1.5에서 재시도)
  │
  └─ "거부" 클릭
          │
          ▼
  POST /api/pending-signals { action: 'rejected' }
  → resolved_at 기록, 상태 'rejected'
```

### pending_signals 테이블 스키마

```sql
pending_signals (
  id             uuid PRIMARY KEY,
  stock_code     text NOT NULL,
  stock_name     text,
  signal_score   numeric,
  signal_comment text,
  signal_data    jsonb,   -- { indicators, raw, matchCount, bonuses }
  source         text,    -- 'watchlist' | 'surge'
  status         text,    -- 'pending' | 'approved' | 'rejected' | 'expired'
  created_at     timestamptz DEFAULT now(),
  resolved_at    timestamptz
)
```

### 상태 전이

```
pending  →  approved   (사용자 승인, 주문 실패 시 엔진 재시도 대기)
pending  →  rejected   (사용자 거부, resolved_at 기록)
approved →  expired    (주문 성공 또는 엔진 STEP 1.5 처리 완료)
pending  →  expired    (즉시매수 성공, UI에서 직접 PATCH)
```

---

## API Endpoints

### GET /api/pending-signals

`status = 'pending'` 신호 목록을 최신순으로 반환한다.

### POST /api/pending-signals

```json
{ "id": "<uuid>", "action": "approved" | "rejected" }
```

- `rejected`: `resolved_at` 즉시 기록
- `approved`: 상태만 변경 (엔진 재시도를 위해 `resolved_at` 없음)

### PATCH /api/pending-signals

```json
{ "id": "<uuid>", "status": "expired" }
```

즉시 매수 성공 후 UI에서 호출. `resolved_at`을 현재 시각으로 기록한다.

---

## usePendingSignals 훅 (src/hooks/usePendingSignals.ts)

신호탭 컴포넌트에서 사용하는 클라이언트 훅.

```typescript
const {
  signals,       // PendingSignal[]
  filterLogs,    // FilterLog[]
  dartCodes,     // Set<string>  — DART 필터 탈락 종목 코드
  fetchSignals,  // GET /api/pending-signals
  fetchEngineLog,// GET /api/engine-log → filterLogs + dartCodes
  approveSignal, // POST { id, action: "approved" }
  rejectSignal,  // POST { id, action: "rejected" }
  expireSignal,  // PATCH { id, status: "expired" }
} = usePendingSignals();
```

`fetchEngineLog()`는 `engine_runs` 테이블의 `actions` 배열에서 `type = "dart_filtered"` 항목을 파싱해 `dartCodes` Set을 구성한다.

---

## 종목 필터 시스템

신호 분석 전에 종목을 사전 필터링한다. 탈락 이유는 `engine_runs.actions`에 `type = "filtered_out"` 또는 `type = "dart_filtered"`로 기록된다.

### applyStockFilter(priceData, listingDate)

4개 조건을 동시에 검사하며, 하나라도 미충족 시 탈락이다.

| 조건 | 기준 | 비고 |
|------|------|------|
| 시가총액 | ≥ 500억 (`hts_avls`, 억원 단위) | 0이면 통과 (데이터 없음) |
| 시장경고 | `mrkt_warn_cls_code = "00"` | 01=투자주의, 02=투자경고, 03=투자위험 |
| 정리매매 | `sltr_yn ≠ "Y"` | Y이면 탈락 |
| 상장 기간 | 상장일로부터 365일 이상 | 조회 실패 시 통과 |

### hasDangerousDisclosure(code)

DART Open API(`opendart.fss.or.kr`)에서 최근 30일 공시를 조회한다.

```typescript
const DANGER_KEYWORDS = [
  "유상증자", "전환사채", "신주인수권",
  "감사의견 거절", "감사의견 한정",
  "영업정지", "상장폐지", "횡령", "배임", "불성실공시",
];
```

`DART_API_KEY` 환경변수가 없으면 `{ danger: false }`를 반환해 필터를 통과시킨다.

---

## 급등주 스캔 — scanSurgeStocks()

`getMarketTrend()` 실행 흐름에서 함께 호출된다. KOSPI(`"J"`) + KOSDAQ(`"Q"`) 전 종목을 대상으로 한다.

- **등락률 상위**: 상위 20종목 중 전일 대비 +3% 이상인 종목 수집
- **거래량 상위**: 상위 15종목 전부 수집
- 두 목록을 `Set`으로 중복 제거 후 반환
- 보유 종목 및 관심 종목은 별도 로직에서 제외 후 신호 분석 진행

---

## analyzeSignalWithWeights — 학습 가중치 적용

```typescript
analyzeSignalWithWeights(candles, customWeights?)
// customWeights: { trending: Record<string, number>, ranging: Record<string, number> }
```

1. 내부적으로 `analyzeSignal(candles)` 를 먼저 실행한다.
2. `customWeights`가 없거나 캔들 26일 미만이면 기본 결과를 그대로 반환한다.
3. 레짐(`trending`/`ranging`)에 맞는 가중치 맵으로 각 지표의 `weight`, `score`를 재계산한다.
4. 매도 조건은 `raw` 값으로 직접 재판정한다 (`sellConditions` 맵).
5. 재계산된 `buyTotal` / `sellTotal`로 `strength`, `side`, `totalScore`를 갱신해 반환한다.

엔진은 두 함수 결과를 모두 `trade_memory`에 저장해 성과 비교에 활용한다.

---

## Key Decisions

**1. 가중치 기반 점수제 선택 이유**  
단순 다수결(지표 개수)은 지표 품질 차이를 무시한다. 추세장에서 MACD가 RSI보다 신뢰도가 높은 점을 반영하기 위해 레짐별 차등 가중치를 도입했다. 다수결 조건(4개/2개 hit)은 보조 기준으로만 병행한다.

**2. bbPosition 값 불일치**  
초기 설계서는 `lower`/`upper`로 명시했으나 구현 시 `below`/`above`로 확정됐다. 이후 설계서는 업데이트되지 않아 코드와 문서 간 불일치가 남아 있다. 코드 기준이 정확하다.

**3. weak 신호를 즉시 주문하지 않는 이유**  
40–69점 구간은 신호 강도가 애매해 오판 위험이 있다. 사용자가 맥락(뉴스, 기업 이슈)을 확인한 뒤 승인할 수 있도록 대기 상태로 저장하고 UI에서 판단을 위임한다.

**4. approved → expired 이중 경로**  
UI에서 직접 매수(PATCH → expired)와 엔진 자동 재시도(approved → 엔진 처리 → expired) 두 경로를 분리해 실패 복구를 보장한다.

---

## Gotchas

- **데이터 최소 요건**: `analyzeSignal`은 캔들 26개 미만이면 즉시 `strength: "none"`을 반환한다. 신규 상장 종목이나 데이터 부족 상황에서 필터가 통과돼도 신호가 생성되지 않는다.
- **ADX 기본값**: 캔들이 28개(period × 2) 미만이면 ADX를 25로 고정한다. 결과적으로 레짐이 `"ranging"`으로 기본 설정된다.
- **거래량 스파이크 조건**: 매수와 매도 모두 동일한 `volumeRatio ≥ 200%` 조건을 사용한다. 거래량 급증 자체는 방향 중립이며, 다른 지표와 조합해서만 방향이 결정된다.
- **DART 키 없으면 전통과**: `DART_API_KEY`가 설정되지 않은 환경(테스트, 개발)에서는 공시 필터가 비활성화돼 위험 공시 종목도 통과한다.
- **투자자 동향 단위 변환**: KIS API 응답의 `orgn_ntby_tr_pbmn` / `frgn_ntby_tr_pbmn`은 백만원 단위다. `/ 100`으로 억원 변환한다.
- **시장 모멘텀 보정 임계값**: 설계 사양(+1%/+0.5%)과 실제 코드(+1.0%/+0.3%)가 다르다. 코드 기준이 우선이다.

---

## 신호 임계값 동적 설정 계획 (v5.2.1, docs/01-plan/features/signal-thresholds.plan.md)

현재 RSI 매수/매도 기준 및 신호 강도 점수 임계값이 `indicators.ts`에 하드코딩되어 있다. 계획서는 이를 `app_config` 테이블로 이관하여 런타임 변경과 자동 최적화를 지원한다.

**관리 대상 임계값 4종**:

| 키 | 기본값 | 설명 |
|----|--------|------|
| `rsi_buy` | 30 | RSI 매수 기준 (이하 시 매수 신호) |
| `rsi_sell` | 70 | RSI 매도 기준 (이상 시 매도 신호) |
| `strong_score` | 70 | 즉시 매수(strong) 임계 점수 |
| `weak_score` | 40 | 승인 대기(weak) 임계 점수 |

**자동 최적화 API** (`POST /api/optimize-thresholds`):
- `trade_memory` 닫힌 매매 30건 이상 필요 (미달 시 422 반환)
- 그리드 서치: RSI 매수 20~40 (스텝 5), RSI 매도 60~80, 강한 신호 60~80, 약한 신호 30~50 — 최대 625 조합
- 제약 조건: `weak_score < strong_score`
- 반환: `{ recommended, winRate, sampleSize, searchCount }`

**설정 변경 API** (`PATCH /api/app-config`):
- `{ key, value }` 형식. `value` 범위 0~100 정수 서버 검증
- `weak_score >= strong_score` 역전 차단

**폴백 원칙**: 엔진이 `app_config` 조회 실패 시 기존 하드코딩 기본값으로 fallback. 매매 중단 없음.

---

## Sources

- `src/lib/kis/indicators.ts` — `analyzeSignal`, `analyzeSignalWithWeights`, `calcATR`, `calcDynamicRisk`, `calcPositionSize`, `checkRisk` (계산 함수는 `indicators-calc.ts`에서 import)
- `src/lib/kis/indicators-calc.ts` — 지표 계산 순수 함수 모음 (StochRSI, OBV, 이격도 등)
- `src/lib/engine/market.ts` — `getMarketTrend`, `getInvestorTrend`, `scanSurgeStocks`
- `src/lib/engine/filters.ts` — `applyStockFilter`, `hasDangerousDisclosure`
- `src/lib/candle-patterns.ts` — `detectPatterns`, `patternBuyScore`, `patternSellScore`
- `src/hooks/usePendingSignals.ts` — `usePendingSignals`
- `src/app/api/pending-signals/route.ts` — GET / POST / PATCH 엔드포인트
- `docs/01-plan/features/signal-thresholds.plan.md` (임계값 동적 설정 및 자동 최적화 계획)
