# NEXIO — 플랫폼 개요

[coverage: high -- 10 sources]

## Purpose

NEXIO는 한국 주식 시장을 대상으로 한 AI 기반 자동매매 시스템이다. 매매 결과를 경험 데이터로 축적하고, 이를 바탕으로 지속적으로 전략을 개선하는 자가학습 구조를 갖는다.

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16.2.1 (App Router) |
| 런타임 | React 19.2.4 |
| 데이터베이스 | Supabase (PostgreSQL) |
| 상태 관리 | Zustand 5.x |
| 스타일 | Tailwind CSS 4.x |
| 언어 | TypeScript 5.x |
| 배포 | Vercel (Hobby 플랜) |

## 프로젝트 식별 정보

- **패키지명**: nexio-autotrade
- **현재 버전**: v7.1 신뢰 시스템 완료 / 다음: v6.2 섹터 분산 제한 (project-plan.md 기준)
- **Supabase 프로젝트 ID**: bcxjyxfflcgmyltnxben
- **배포 URL**: https://nexio.vercel.app
- **GitHub 계정**: watchers0930

## 주요 기능 영역

1. **자동매매 엔진** — Cron 기반 하루 4회 실행, 신호 분석 후 자동 주문
2. **신호 시스템** — 다중 기술 지표 분석으로 매수 신호 도출
3. **적응형 학습 엔진** — 실전 매매 결과를 학습하여 전략 파라미터 자동 최적화
4. **포지션 관리** — 포지션 보유, 청산(손절/익절/트레일링) 관리
5. **통계 대시보드** — 성과 분석, 학습 현황, 종목별 성과 시각화
6. **관심종목 / 워치리스트** — 매매 대상 종목 관리
7. **수동 매수** — 관리자 UI에서 직접 매수 실행
8. **KIS 연결 Health Check** — 60초 폴링으로 KIS 연결 상태 실시간 감지 및 이상 시 텔레그램 알림
9. **운영 에러 알림** — KIS API 오류, 엔진 런타임 에러 발생 시 텔레그램 즉시 알림

## v7.1 신뢰 시스템 완성 계획 요약 (docs/01-plan/features/nexio.plan.md)

| 우선순위 | 항목 | 중요도 | 예상 공수 |
|---------|------|--------|---------|
| P0 | 환경변수 누락 자동 감지 (`config-validator.ts` 신규) | 매우 높음 | 0.5d |
| P0 | balance / price API POST 전환 (appSecret URL 노출 제거) | 매우 높음 | 0.5d |
| P1 | 엔진 자가복구 (중복 실행 방지 + 고립 정리 + 지수 백오프 재시도) | 높음 | 1d |
| P2 | 핵심 경로 E2E 테스트 (`tests/core.spec.ts`, Playwright) | 보통 | 1d |

## 주의 사항 (Gotchas)

- AGENTS.md 지시사항: "이 프로젝트는 학습 데이터의 Next.js와 다르다 — 코드 작성 전 `node_modules/next/dist/docs/` 가이드를 반드시 읽을 것"
- Vercel Hobby 플랜 Cron 슬롯은 **최대 2개** — 추가 Cron 생성 불가
- KIS(한국투자증권) API 의존성이 있으며, API 호출 장애 시 매매 불가
- `notify.ts`는 서버 전용 — 클라이언트 코드에서 직접 import 불가
- `GET /api/kis/balance`와 `GET /api/kis/price`는 v7.1에서 **POST**로 전환됨 — 자격증명을 Request Body로 수신

## v6.0 미구현 기능 순차 구현 로드맵 (docs/plan-v6.md)

v5.9 기준 미구현 9개 기능의 우선순위별 구현 순서:

| 버전 | 기능 | 우선순위 | 상태 |
|------|------|---------|------|
| v5.9.1 | engine/route.ts 500줄 분리 | 긴급 | 완료 |
| v5.10.0 | 실시간 매매 알림 (텔레그램) | 높음 | 완료 |
| v5.11.0 | 일일 매매 리포트 (텔레그램) | 높음 | 완료 |
| v5.12.0 | 비상 정지 스위치 (DB 플래그) | 높음 | 완료 |
| v5.13.0 | 최대 포지션 수 제한 | 높음 | 완료 |
| v6.0.0 | 백테스트 UI, 엔진 로그 뷰어, 장 종료 자동 정산 | 중간 | - |
| v6.1.0 | ABCompareCard, 섹터별 분산 제한 | 낮음 | 섹터 분산 설계 완료 |

## v6.2 섹터별 분산 제한 설계 요약 (docs/02-design/features/sector-limit.design.md)

동일 업종 종목 집중 리스크를 방지하는 필터. 설계 완료, 구현 예정.

- **섹터 소스**: KIS `getPrice()` 응답의 `bstp_kor_isnm` (업종명)
- **DB 변경**: `positions.sector TEXT` 컬럼 추가, `app_config.max_per_sector = 2`
- **체크 시점**: STEP 2/3 강한 신호 매수 직전 (`applyStockFilter()` 다음)
- **N+1 방지**: STEP 시작 시 `getSectorCounts()`로 1회 조회 후 Map 캐싱

## v5.2.1 신호 임계값 동적 설정 계획 (docs/01-plan/features/signal-thresholds.plan.md)

하드코딩된 RSI·점수 임계값 4종을 `app_config`로 이관하고 자동 최적화 기능 추가. 계획 작성 완료, 구현 예정.

## 클라이언트 훅 (v7.1 신규)

### useKISBalance (`src/hooks/useKISBalance.ts`)

KIS 잔고 조회 훅. `kisConfig`를 `POST /api/kis/balance` Request Body로 전송 — URL 파라미터 노출 없음.

- `kisConfig.appKey` + `accountNo` 준비 시 자동 조회 (`useEffect`)
- 반환값: `{ data: KISBalanceData | null, loading, error, refetch }`
- 에러 상태: 400(필수 파라미터 누락), 401(토큰 만료), 500(KIS 오류) 개별 처리

### useKISPrice (`src/hooks/useKISPrice.ts`)

KIS 현재가 조회 훅. 자격증명을 POST Body로 전송.

- `fetchPrice(code)` — 단일 종목 조회
- `fetchPrices(codes)` — `Promise.allSettled`로 복수 종목 병렬 조회 (개별 실패 허용)
- 반환값: `{ prices: Map<string, KISPriceOutput>, loading, fetchPrice, fetchPrices }`

## /settings 전용 페이지 (v7.1 신규)

`src/app/settings/page.tsx` — `/settings` URL로 접근 가능한 독립 라우트.

- Playwright E2E TC-03 대응: `page.goto("/settings")` 후 KIS 설정 폼 존재 확인용
- `SettingsTab` 컴포넌트를 렌더링하는 컴포지션 역할 (41줄, 500줄 원칙 준수)
- `hydrate()` 호출 + `setTab("settings")` 초기화

## Sources

- `package.json`
- `README.md`
- `AGENTS.md`
- `docs/04-report/features/adaptive-engine.report.md`
- `docs/01-plan/features/nexio.plan.md` (v7.1 신뢰 시스템 완성 계획)
- `docs/02-design/features/nexio.design.md` (v7.1 설계서)
- `docs/03-analysis/nexio.analysis.md` (v7.1 GAP 분석 — 구현 97% 일치)
- `docs/project-plan.md` (로드맵)
- `docs/plan-v6.md` (v6.0 미구현 기능 순차 구현 계획)
- `docs/02-design/features/sector-limit.design.md` (v6.2 섹터 분산 제한 설계)
- `docs/01-plan/features/signal-thresholds.plan.md` (v5.2.1 신호 임계값 동적 설정 계획)
- `src/hooks/useKISBalance.ts` (v7.1 신규 — POST 방식 잔고 조회 훅)
- `src/hooks/useKISPrice.ts` (v7.1 신규 — POST 방식 현재가 조회 훅)
- `src/app/settings/page.tsx` (v7.1 신규 — /settings 전용 라우트)
