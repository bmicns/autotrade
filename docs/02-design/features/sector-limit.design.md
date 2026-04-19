# sector-limit — 섹터별 분산 제한 설계 문서

> 작성일: 2026-04-17
> 버전 목표: v6.2.0
> 목적: 동일 업종(섹터) 종목이 포트폴리오에 집중되는 리스크 방지

---

## 1. 문제 정의

현재 엔진은 `maxPositions`(최대 동시 보유 종목 수)만 제한하고, 업종 분산은 고려하지 않는다.

- 반도체 관련 종목 5개가 동시에 편입되면 업황 하락 시 일괄 손실
- watchlist가 특정 섹터에 편중된 경우 자동으로 분산되지 않음

---

## 2. 설계 방향

### 핵심 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 섹터 데이터 소스 | `getPrice()` 응답의 `bstp_kor_isnm` (업종명) | 이미 매수 시 getPrice 호출 중, 추가 API 불필요 |
| 섹터 저장 위치 | `positions.sector` 컬럼 신규 추가 | 실시간 재조회 없이 open 포지션 집계 가능 |
| 그룹핑 방식 | `bstp_kor_isnm` 값 그대로 사용 | WICS 매핑은 유지보수 부담, 업종명 자체로 충분 |
| 기본 제한값 | 섹터당 최대 2종목 (`max_sector_per_group = 2`) | `app_config` 테이블로 동적 변경 가능 |
| 체크 시점 | 강한 신호 매수 직전 (STEP 2, STEP 3, STEP 1.5) | 기존 `applyStockFilter()` 흐름에 추가 |

---

## 3. DB 변경

### 3-1. positions 테이블 컬럼 추가

```sql
ALTER TABLE positions ADD COLUMN sector TEXT;
```

기존 open 포지션은 `sector = NULL`로 유지. NULL은 체크에서 제외 (하위 호환).

### 3-2. app_config 항목 추가

```sql
INSERT INTO app_config (key, value) VALUES ('max_per_sector', '2')
ON CONFLICT (key) DO NOTHING;
```

`app_config` 테이블 기존 구조(key TEXT, value JSONB)에 추가.

---

## 4. 코드 변경

### 4-1. src/lib/engine/db.ts — openPosition() 수정

```typescript
export async function openPosition(
  code: string,
  name: string | null,
  price: number,
  qty: number,
  signal: SignalResult,
  phase: "initial" | "full",
  sector?: string            // ← 추가
) {
  await supabase.from("positions").insert({
    ...기존 필드,
    sector: sector ?? null,  // ← 추가
  });
}
```

### 4-2. src/lib/engine/db.ts — getSectorCounts() 신규 추가

```typescript
// open 포지션의 섹터별 건수 반환
export async function getSectorCounts(): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("positions")
    .select("sector")
    .eq("status", "open")
    .not("sector", "is", null);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const s = row.sector as string;
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return map;
}
```

### 4-3. src/lib/engine/filters.ts — applySectorFilter() 신규 추가

섹터 체크 로직은 기존 `applyStockFilter()`와 같은 파일에 분리 배치한다 (필터 로직 단일 책임).

```typescript
export function applySectorFilter(
  sector: string | null,
  sectorCounts: Map<string, number>,
  maxPerSector: number
): FilterResult {
  if (!sector || maxPerSector <= 0) return { passed: true, reason: "" };
  const count = sectorCounts.get(sector) ?? 0;
  if (count >= maxPerSector) {
    return { passed: false, reason: `섹터 제한 (${sector} ${count}/${maxPerSector})` };
  }
  return { passed: true, reason: "" };
}
```

### 4-4. src/lib/engine/steps.ts — 호출부만 삽입

`steps.ts`는 현재 470줄. 로직은 `filters.ts`로 분리하고 호출부만 삽입한다 (줄 수 최소화).

```typescript
// STEP 시작 시 1회 조회 캐싱 (N+1 방지)
const sectorCounts = await getSectorCounts();

// 매수 직전 (기존 applyStockFilter 바로 다음)
const sector = (priceData as Record<string, string>).bstp_kor_isnm || null;
const sectorFilter = applySectorFilter(sector, sectorCounts, ctx.maxPerSector);
if (!sectorFilter.passed) {
  actions.push({ type: "skip", code, name, detail: sectorFilter.reason });
  continue;
}
```

### 4-4. src/lib/engine/types.ts — StepContext 수정

```typescript
export interface StepContext {
  // ... 기존 필드 ...
  maxPerSector: number;  // ← 추가 (기본 2, 0이면 비활성)
}
```

### 4-5. src/app/api/engine/route.ts — app_config 로딩

```typescript
// 기존 max_positions 로딩과 동일 패턴
const maxPerSectorRow = appConfig.find((r) => r.key === "max_per_sector");
const maxPerSector = Number(maxPerSectorRow?.value ?? 2);
```

---

## 5. 실행 흐름 (변경 후)

```
STEP 2/3 시작
  │
  ├─ getSectorCounts() — 1회 조회, Map 캐싱
  │
  └─ 종목 루프
       ├─ 신호 분석
       ├─ 강한 신호?
       │    ├─ getPrice() — priceData 획득 (bstp_kor_isnm 포함)
       │    ├─ applyStockFilter() — 기존 필터 (시총·경고·정리매매·상장일)
       │    ├─ [신규] 섹터 체크 — sectorCounts.get(sector) >= maxPerSector → skip
       │    └─ limitBuyOrder() → openPosition(... , sector) — sector 저장
       └─ 다음 종목
```

---

## 6. STEP 1.5 (approved 신호 매수) 처리

STEP 1.5는 `pending_signals`에 이미 저장된 신호를 실행한다. 저장 시점에는 섹터 정보가 없으므로:

- **매수 실행 시** `getPrice()`를 호출해 `bstp_kor_isnm` 획득 후 섹터 체크 적용
- 현재 코드에서 이미 `getPrice()` 호출 중 (line 207 기준) → 동일 패턴 적용

---

## 7. 설정 UI (settings 탭)

`app_config`에 `max_per_sector` 키를 추가하면 설정 탭 UI에서 기존 엔진 제어 패턴 그대로 변경 가능.

기존 `engine-control` Server Action에 `max_per_sector` 항목 추가 여부는 구현 단계에서 결정.

---

## 8. 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| `bstp_kor_isnm` 응답 없음 (null/빈값) | `sector = null` → 섹터 체크 스킵, 매수 진행 |
| 기존 open 포지션 sector = NULL | 섹터 카운트에서 제외 (하위 호환) |
| `maxPerSector = 0` | 섹터 체크 비활성 (전체 허용) |
| 급등주 STEP 3 | STEP 2와 동일 패턴 적용 |

---

## 9. 파일 변경 요약

| 파일 | 변경 내용 | 예상 줄 수 |
|------|-----------|-----------|
| Supabase SQL | `positions.sector TEXT` 컬럼 추가, `app_config` 초기값 INSERT | — |
| `src/lib/engine/types.ts` | `StepContext.maxPerSector` 추가 | 73줄 → 74줄 |
| `src/lib/engine/db.ts` | `openPosition()` sector 파라미터, `getSectorCounts()` 신규 | 133줄 → 155줄 |
| `src/lib/engine/filters.ts` | `applySectorFilter()` 신규 추가 | 97줄 → 120줄 |
| `src/lib/engine/steps.ts` | 호출부만 삽입 (로직은 filters.ts로 분리) | 470줄 → ~485줄 ✅ |
| `src/app/api/engine/route.ts` | `max_per_sector` app_config 로딩, StepContext 전달 | 155줄 → 162줄 |
