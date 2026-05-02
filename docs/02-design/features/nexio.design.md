# NEXIO 운영 안정성 및 코드 구조 개선 설계서 (v6.1)

> 기반 기획서: `docs/01-plan/features/nexio.plan.md`
> 작성일: 2026-05-02

---

## 1. 아키텍처 및 컴포넌트 구조

### 1.1 변경 원칙

| 원칙 | 적용 방향 |
|------|---------|
| 서버/클라이언트 경계 | `notify.ts`(서버 전용) → API route에서만 호출. 클라이언트 store에서 직접 호출 금지 |
| 훅 추출 | 컴포넌트 내 직접 fetch → `src/hooks/` 전담 훅으로 이동 |
| 단일 책임 | SignalTab = 승인/거절 전용, StrategyTab = 전략 설정 전용 |

### 1.2 파일 분리 계획

#### 신규 생성

```
src/hooks/useStockSearch.ts            — 종목 검색 (debounce 포함)
src/hooks/useThresholdsOptimize.ts     — 신호 임계치 자동 최적화
src/hooks/usePositions.ts              — open 포지션 목록 조회
src/hooks/usePortfolioSnapshot.ts      — 포트폴리오 스냅샷 조회
src/hooks/useNews.ts                   — 뉴스 피드 조회
src/app/api/kis/health/route.ts        — KIS 연결 상태 Health Check
src/components/signal/watchlist-section.tsx  — 관심종목 UI (SignalTab에서 분리)
```

#### 수정 대상

```
src/lib/engine/notify.ts               — KIS 에러 알림 함수 2개 추가
src/lib/engine/types.ts                — KISHealthStatus, KISApiErrorContext 타입 추가
src/app/api/kis/token/route.ts         — 토큰 실패 시 sendKISApiErrorAlert 호출
src/app/api/kis/balance/route.ts       — 잔고 실패 시 sendKISApiErrorAlert 호출
src/lib/store.ts                       — kisConnected 폴링 상태 추가, startHealthPolling 구현
src/components/signal/signal-tab.tsx   — 관심종목 탭 제거, useStockSearch 적용
src/components/strategy/strategy-tab.tsx — handleOptimize → useThresholdsOptimize 적용, WatchlistSection 삽입
```

### 1.3 모듈 의존성 다이어그램 (변경 후)

```
[클라이언트]
  store.ts (Zustand)
    ├── fetchKISData()  →  /api/kis/token, /api/kis/balance
    ├── startHealthPolling()  →  /api/kis/health  (60초 주기)
    └── fetchPendingCount()  →  /api/pending-signals

  hooks/useStockSearch.ts        →  /api/stock-search (debounce 300ms)
  hooks/useThresholdsOptimize.ts →  /api/optimize-thresholds
  hooks/usePositions.ts          →  /api/positions
  hooks/usePortfolioSnapshot.ts  →  /api/portfolio-snapshot
  hooks/useNews.ts               →  /api/news

[서버]
  notify.ts (서버 전용)
    ├── sendEngineErrorAlert()        ← /api/engine/route.ts
    ├── sendKISApiErrorAlert()        ← /api/kis/token, /api/kis/balance  ← (신규)
    └── sendKISConnectionAlert()      ← /api/kis/health                   ← (신규)

  /api/kis/health/route.ts
    └── kis/api.ts → getBalance() → KIS API
    └── 상태 변화 시 sendKISConnectionAlert() 호출
```

### 1.4 컴포넌트 구조 변경

#### SignalTab (변경 전 → 후)

```
변경 전: SignalTab
  ├── tab: "signals" | "watchlist"
  ├── 신호 대기 (PendingSignalList, ManualBuyForm)
  └── 관심종목 (검색 input + 목록)  ← 직접 fetch /api/stock-search

변경 후: SignalTab
  └── 신호 대기 (PendingSignalList, ManualBuyForm)  ← 전용화
       (관심종목 탭 제거)
```

#### StrategyTab (변경 전 → 후)

```
변경 전: StrategyTab
  ├── 신호 기준 (SignalEditSheet)
  ├── 자동 최적화 (handleOptimize 직접 fetch)
  ├── StrategyAllocationSection
  ├── 매매 설정 (TradeEditSheet)
  ├── 분석 지표
  └── StrategyRunSection

변경 후: StrategyTab
  ├── 신호 기준 (SignalEditSheet)
  ├── 자동 최적화 (useThresholdsOptimize 훅)
  ├── StrategyAllocationSection
  ├── 매매 설정 (TradeEditSheet)
  ├── 분석 지표
  ├── StrategyRunSection
  └── WatchlistSection  ← (신규 추가)
```

---

## 2. 데이터 모델

### 2.1 신규 타입 (`src/lib/engine/types.ts`에 추가)

```typescript
// KIS 연결 상태 (Health Check 응답 + store 상태)
export interface KISHealthStatus {
  connected: boolean;
  lastChecked: string;      // ISO 8601 (KST)
  latencyMs: number;
  errorCode?: string;       // KIS API error_code (예: "EGW00123")
  errorMessage?: string;    // KIS API error_description
}

// Telegram 알림 컨텍스트 (비밀키 포함 금지)
export interface KISApiErrorContext {
  operation: "token" | "balance" | "order" | "price";
  httpStatus?: number;      // HTTP 응답 코드
  kisCode?: string;         // KIS error_code
  kisMessage?: string;      // KIS error_description (200자 이하로 잘라서 전송)
  timestamp: string;        // ISO 8601
}
```

### 2.2 store.ts 상태 추가 필드

```typescript
// 기존 kisLoading, kisConnected 유지
kisHealthLastChecked: string | null;  // 마지막 헬스체크 시각 (ISO 8601)
kisLatencyMs: number | null;          // 마지막 응답 지연 (ms)
startHealthPolling: () => void;       // 폴링 시작 (60초 간격)
stopHealthPolling: () => void;        // 폴링 중단 (cleanup)
```

**폴링 동작 규칙:**
- `hydrate()` 호출 시 KIS 설정이 있으면 자동 시작
- `setInterval` 핸들 store 내부에 보관, `stopHealthPolling()`에서 `clearInterval`
- 폴링 결과로 `kisConnected`, `kisHealthLastChecked`, `kisLatencyMs` 갱신

### 2.3 notify.ts 신규 함수 시그니처

```typescript
// 추가 (KIS API 에러 발생 시 — 서버 API route에서만 호출)
export async function sendKISApiErrorAlert(ctx: KISApiErrorContext): Promise<void>

// 추가 (연결 상태 변화 시 — /api/kis/health에서만 호출)
export async function sendKISConnectionAlert(
  type: "disconnected" | "reconnected"
): Promise<void>
```

---

## 3. API 스펙

### 3.1 신규 엔드포인트

---

#### `GET /api/kis/health`

**설명:** KIS 연결 상태를 확인하는 경량 Health Check. 토큰 유효성 + 잔고 조회 가능 여부를 검증한다.
**인증:** 필요 (미들웨어 세션 검증)
**Query Params:** 없음
**Request Body:** 없음

**Response — 200 (연결 정상):**
```json
{
  "connected": true,
  "lastChecked": "2026-05-02T10:30:00.000+09:00",
  "latencyMs": 142
}
```

**Response — 200 (연결 불가):**
```json
{
  "connected": false,
  "lastChecked": "2026-05-02T10:30:00.000+09:00",
  "latencyMs": 0,
  "errorCode": "EGW00123",
  "errorMessage": "접근토큰 발급 오류"
}
```

**Response — 400 (KIS 설정 없음):**
```json
{ "error": "KIS 설정이 없습니다" }
```

**Response — 500 (서버 내부 오류):**
```json
{ "error": "헬스체크 실패" }
```

**내부 동작 순서:**
1. DB에서 kis_config 조회 (설정 없으면 400 반환)
2. 저장된 토큰으로 KIS 잔고 경량 조회 (1건만)
3. 성공: `{ connected: true, latencyMs }` 반환
4. 실패: `{ connected: false, errorCode, errorMessage }` 반환
5. 직전 상태가 `connected: true`였고 이번에 실패한 경우 → `sendKISConnectionAlert("disconnected")` 호출
6. 직전 상태가 `connected: false`였고 이번에 성공한 경우 → `sendKISConnectionAlert("reconnected")` 호출
   - 직전 상태 판단: DB의 `kis_health_status` 컬럼 또는 인메모리 캐시 (단순화를 위해 인메모리)

---

### 3.2 기존 엔드포인트 — 변경 사항

---

#### `POST /api/kis/token` ← 알림 추가

**설명:** KIS OAuth2 토큰 발급
**인증:** 필요
**Request Body:**
```json
{ "appKey": "...", "appSecret": "..." }
```

**Response — 200 (성공):**
```json
{ "token": "..." }
```

**Response — 400 (파라미터 누락):**
```json
{ "error": "appKey, appSecret이 필요합니다" }
```

**Response — 401/403 (KIS 인증 실패):**
```json
{
  "error": "토큰 발급 실패",
  "kisCode": "EGW00123",
  "kisMessage": "접근토큰 발급 오류"
}
```

**Response — 500 (서버 오류):**
```json
{ "error": "서버 내부 오류" }
```

**변경 내용:**
KIS가 401/403을 반환하거나 네트워크 에러 발생 시 `sendKISApiErrorAlert({ operation: "token", httpStatus, kisCode, kisMessage })` 호출 추가.
appKey/appSecret은 알림 메시지에 포함하지 않음.

---

#### `GET /api/kis/balance` ← 알림 추가

**설명:** KIS 잔고 조회
**인증:** 필요
**Query Params:** 없음
**Request Body:** 없음

**Response — 200 (성공):**
```json
{
  "holdings": [
    { "code": "005930", "name": "삼성전자", "market": "KOSPI",
      "quantity": 10, "avgPrice": 72000, "currentPrice": 75000, "pnlRate": 4.17 }
  ],
  "totalEval": 10750000,
  "totalPnl": 30000,
  "totalPnlRate": 0.28,
  "cashBalance": 5000000
}
```

**Response — 401 (토큰 만료):**
```json
{ "error": "토큰이 만료되었습니다", "kisCode": "EGW00201" }
```

**Response — 500 (KIS 오류 / 서버 오류):**
```json
{ "error": "잔고 조회 실패", "kisCode": "...", "kisMessage": "..." }
```

**변경 내용:**
KIS API 호출 실패 시 (네트워크 오류, 401, 500 등) `sendKISApiErrorAlert({ operation: "balance", httpStatus, kisCode, kisMessage })` 호출 추가.

---

### 3.3 기존 엔드포인트 — 문서화 (구현 변경 없음)

---

#### `GET /api/stock-search`

**설명:** 종목명 또는 종목코드로 종목 검색
**인증:** 필요
**Query Params:** `q` (string, 필수, 최소 1자)

**Response — 200:**
```json
[
  { "code": "005930", "name": "삼성전자", "market": "KOSPI" },
  { "code": "000660", "name": "SK하이닉스", "market": "KOSPI" }
]
```

**Response — 400:**
```json
{ "error": "검색어가 필요합니다" }
```

---

#### `GET /api/optimize-thresholds`

**설명:** trade_memory 기반 신호 임계치 자동 최적화 계산
**인증:** 필요
**Query Params:** 없음

**Response — 200 (성공):**
```json
{
  "sampleSize": 25,
  "recommended": { "rsiBuy": 32, "rsiSell": 68, "strongScore": 72, "weakScore": 52 },
  "current":     { "rsiBuy": 30, "rsiSell": 70, "strongScore": 70, "weakScore": 50 }
}
```

**Response — 200 (데이터 부족, sampleSize < 5):**
```json
{ "sampleSize": 3, "recommended": null, "current": { ... } }
```

**Response — 500:**
```json
{ "error": "최적화 실패" }
```

---

#### `GET /api/positions`

**설명:** 현재 open 포지션 목록 (DB 기준)
**인증:** 필요
**Query Params:** 없음

**Response — 200:**
```json
[
  { "id": "uuid", "code": "005930", "name": "삼성전자",
    "qty": 10, "avgPrice": 72000, "status": "open",
    "openedAt": "2026-05-01T09:35:00Z" }
]
```

---

#### `GET /api/portfolio-snapshot`

**설명:** 일별 포트폴리오 누적 손익 스냅샷
**인증:** 필요
**Query Params:** 없음 (최근 30일 기본)

**Response — 200:**
```json
[
  { "date": "2026-05-02", "totalEval": 10750000,
    "totalPnl": 150000, "pnlRate": 1.42 }
]
```

---

#### `GET /api/news`

**설명:** 주요 경제/시장 뉴스 피드
**인증:** 필요
**Query Params:** 없음

**Response — 200:**
```json
[
  { "title": "...", "url": "...", "source": "...",
    "publishedAt": "2026-05-02T09:00:00Z" }
]
```

---

## 4. 구현 순서

### Phase 1 — P0: 에러 핸들링 (백엔드 우선)

**목적:** 운영 중 치명적 에러가 무음으로 사라지는 문제 제거

1. **`src/lib/engine/types.ts`**
   `KISHealthStatus`, `KISApiErrorContext` 타입 추가

2. **`src/lib/engine/notify.ts`**
   `sendKISApiErrorAlert(ctx: KISApiErrorContext)` 추가
   `sendKISConnectionAlert(type: "disconnected" | "reconnected")` 추가

3. **`src/app/api/kis/token/route.ts`**
   KIS 401/403 응답 또는 네트워크 에러 발생 시 `sendKISApiErrorAlert` 호출
   kisCode, kisMessage만 포함 — appKey/appSecret 절대 포함 금지

4. **`src/app/api/kis/balance/route.ts`**
   잔고 조회 실패 시 `sendKISApiErrorAlert` 호출

---

### Phase 2 — P0: KIS Health Check (백엔드)

**목적:** `kisConnected` 상태를 실시간으로 반영

5. **`src/app/api/kis/health/route.ts`** 신규 생성
   - DB에서 kis_config 조회 → KIS 잔고 경량 호출 → `KISHealthStatus` 반환
   - 상태 변화 감지 → `sendKISConnectionAlert` 호출

6. **`src/lib/store.ts`**
   - `kisHealthLastChecked`, `kisLatencyMs` 상태 필드 추가
   - `startHealthPolling()`: `setInterval(60_000)` 로 `/api/kis/health` 호출, 결과로 `kisConnected` 갱신
   - `stopHealthPolling()`: `clearInterval` 정리
   - `hydrate()` 내 KIS 설정 있을 때 `startHealthPolling()` 자동 호출

---

### Phase 3 — P1: 커스텀 훅 추출 (프론트엔드)

**목적:** 컴포넌트에서 fetch 로직 분리

7. **`src/hooks/useStockSearch.ts`**
   - `signal-tab.tsx`의 debounce 검색 로직 추출
   - `query: string` 입력 → `results`, `searching` 반환

8. **`src/hooks/useThresholdsOptimize.ts`**
   - `strategy-tab.tsx`의 `handleOptimize` 로직 추출
   - `optimize()` 함수, `optimizing`, `optimizeResult`, `optimizeError` 반환

9. **`src/hooks/usePositions.ts`**
   - `/api/positions` 호출 → `positions`, `loading`, `fetchPositions` 반환

10. **`src/hooks/usePortfolioSnapshot.ts`**
    - `/api/portfolio-snapshot` 호출 → `snapshots`, `loading` 반환

11. **`src/hooks/useNews.ts`**
    - `/api/news` 호출 → `news`, `loading` 반환

---

### Phase 4 — P2: 컴포넌트 구조 개선 (UI)

**목적:** SignalTab 역할 순수화, 관심종목 이동

12. **`src/components/signal/watchlist-section.tsx`** 신규 생성
    - `signal-tab.tsx`에서 관심종목 탭 UI 분리 추출
    - `useStockSearch`, `useWatchlist` 훅 사용
    - 독립 섹션으로 동작 (탭 없음)

13. **`src/components/signal/signal-tab.tsx`** 수정
    - 관심종목 탭 (tab 상태, watchlist 섹션 전체) 제거
    - 직접 fetch 제거 (useStockSearch는 watchlist-section으로 이동)
    - 신호 승인/거절에만 집중

14. **`src/components/strategy/strategy-tab.tsx`** 수정
    - `handleOptimize` → `useThresholdsOptimize` 훅으로 교체
    - 하단에 `<WatchlistSection />` 추가

---

## 5. 절대규칙 준수 체크리스트

---

### ① 페이지 500줄 제한

| 파일 | 현재 | 변경 후 예상 | 판정 |
|------|------|------------|------|
| `signal-tab.tsx` | 166줄 | ~100줄 (관심종목 제거) | ✅ |
| `strategy-tab.tsx` | 263줄 | ~290줄 (WatchlistSection 추가) | ✅ |
| `watchlist-section.tsx` | 신규 | ~80줄 | ✅ |
| `notify.ts` | 129줄 | ~175줄 (함수 2개 추가) | ✅ |
| `/api/kis/health/route.ts` | 신규 | ~60줄 | ✅ |
| `useStockSearch.ts` | 신규 | ~40줄 | ✅ |
| `useThresholdsOptimize.ts` | 신규 | ~35줄 | ✅ |
| `store.ts` | 419줄 | ~450줄 (폴링 추가) | ✅ |

---

### ② 단일 책임

| 파일 | 책임 |
|------|------|
| `notify.ts` | Telegram 알림 전송 전담 |
| `useStockSearch` | 종목 검색 로직 전담 |
| `useThresholdsOptimize` | 임계치 최적화 로직 전담 |
| `watchlist-section.tsx` | 관심종목 UI 전담 |
| `signal-tab.tsx` | 신호 승인/거절 UI만 |
| `/api/kis/health` | KIS 연결 상태 확인 전담 |

---

### ③ 서버 검증·보안

- `/api/kis/health`: middleware 세션 검증 적용 (기존 패턴 동일)
- `sendKISApiErrorAlert` 호출 시 `appKey`/`appSecret`/`token` 절대 포함 금지
  - 포함 가능: `operation`, `httpStatus`, `kisCode`, `kisMessage` (200자 이하)
- KIS 연결 상태 변화 알림: 접속 정보 없이 상태 변화 사실만 전송
- 모든 신규 API route는 서버 세션 기반 인증 필수

---

### ④ 성능 (중복 호출 방지)

- `/api/kis/health` 폴링: 60초 주기로 최소화. `setInterval` 핸들 관리로 중복 인터벌 방지
- `useStockSearch`: debounce 300ms 유지 (기존 동작 그대로)
- `useThresholdsOptimize`: 사용자 명시적 액션 기반 호출 — 자동 폴링 없음 (적절)
- `stopHealthPolling()` 반드시 cleanup에서 호출 — 페이지 이탈 후 불필요한 요청 방지
- `fetchKISData` + `startHealthPolling` 중복 방지: 헬스체크는 상태 확인용, fetchKISData는 초기 데이터 로드용으로 역할 구분

---

### ⑤ 폴더 구조

| 파일 유형 | 위치 | 준수 |
|---------|------|------|
| 새 커스텀 훅 | `src/hooks/` | ✅ |
| 새 컴포넌트 (signal 전용) | `src/components/signal/` | ✅ |
| 새 API route | `src/app/api/kis/health/route.ts` | ✅ |
| 서버 알림 함수 | `src/lib/engine/notify.ts` (기존 파일 확장) | ✅ |
| 신규 타입 | `src/lib/engine/types.ts` (기존 파일 확장) | ✅ |
| 서버 액션 없음 | 신규 액션 불필요 (훅 + API route 패턴 유지) | ✅ |

---

## 부록: 현재 코드베이스 Silent Catch 위치 (P0 조사 대상)

구현 시작 전 전수 확인 필요한 위치:

| 파일 | 라인 | 내용 | 처리 방향 |
|------|------|------|---------|
| `src/lib/store.ts` | ~294 | 잔고 재시도 실패 | 클라이언트 UI 표시 (Telegram 불필요) |
| `src/lib/store.ts` | ~373 | 캔들 조회 실패 | 무음 유지 (비치명적) |
| `src/lib/store.ts` | ~378~382 | 전체 fetchKISData 실패 | kisConnected=false 처리로 대체 |
| `src/lib/store.ts` | ~406 | KIS 설정 로드 실패 | localStorage 폴백 (무음 적절) |
| `src/lib/store.ts` | ~243 | fetchPendingCount 실패 | 무음 유지 (비치명적) |
| `src/app/api/kis/token` | - | KIS 호출 실패 | **sendKISApiErrorAlert 추가** |
| `src/app/api/kis/balance` | - | KIS 호출 실패 | **sendKISApiErrorAlert 추가** |

> **원칙**: 서버 API route에서 KIS 통신 실패 → Telegram 알림. 클라이언트 store의 silent catch는 UI 경험 보호 목적이므로 유지.
