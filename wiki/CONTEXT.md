# NEXIO — AI 컨텍스트 요약

> 이 파일은 AI 에이전트가 NEXIO 프로젝트를 빠르게 파악하기 위한 압축 요약본이다.
> 상세 내용은 `wiki/INDEX.md` → 각 토픽 파일 참조.

---

## 프로젝트 한 줄 요약

NEXIO는 한국 주식 자동매매 시스템으로, Next.js + Supabase 기반 운영 엔진에 더해 `engine-v2` 실험선을 분리해 검증 중인 트레이딩 플랫폼이다.

## 현재 상태 (2026-05-11 기준)

- **운영선**: `src/lib/engine/*` + `/api/engine` 기반 v7.1 신뢰 시스템이 동작 중
- **실험선**: `src/lib/engine-v2/*` + `/engine-v2` 시나리오 UI가 로컬 검증 단계
- **운영 안전장치**: `preflight`, 브로커-DB 정합성 점검, PnL audit, rehearsal checklist, order timeline 리스크 요약 추가
- **수동 운용 도구**: manual buy/sell, bulk approve/buy, positions reconcile, holding risk alert 경로 추가
- **환경 분리 원칙**: `dev / paper / prod` 3계층으로 분리, 다음 단계는 `engine-v2`의 `paper` 승격 준비
- **검증 상태**: 2026-05-11 로컬에서 `npm run test:unit`, `npm run lint`, `npm run build`, `npm run check:engine` 통과
- **배포**: https://nexio.vercel.app

## 절대 하면 안 되는 것

1. `npx vercel` 직접 실행 — 반드시 `deploy nexio` 스크립트 사용
2. `runLearning()` 엔진에서 직접 호출 — `loadLatestLearning()` 사용
3. Vercel Cron에 엔진 크론 재추가 — GitHub Actions `.github/workflows/engine-cron.yml` 이 담당
4. `/api/kis/order`에 credentials 클라이언트 파라미터 추가 — 서버가 kis_config DB에서 직접 조회
5. 소스 파일 수정 시 `node_modules/next/dist/docs/` 미확인
6. `notify.ts` 클라이언트 코드에서 직접 import — 서버 전용 모듈 (API route에서만 호출)
7. `sendKISApiErrorAlert` 호출 시 `appKey`/`appSecret`/`token` 포함 — 절대 금지
8. v7.1 이후 `/api/kis/balance`, `/api/kis/price`에 GET 요청 — POST + Request Body로만 호출
9. `validateRequiredEnv()` 응답의 `missing` 배열에 실제 환경변수 값 포함 — 키 이름만 허용
10. `engine-v2` 실험선을 운영 엔진 import 체인이나 실주문 경로에 직접 연결하지 않기

## 핵심 아키텍처 결정

| 결정 | 이유 |
|------|------|
| GitHub Actions 4회/일 엔진 크론 | Vercel Hobby Cron 하루 1회 한도 우회 |
| lib/engine/* 모듈 분리 | engine/route.ts 1,136줄 → 515줄로 단일책임 준수 |
| batchFetch 배치 병렬화 | STEP 2/3 N+1 순차 KIS 호출 제거 (10종목 기준 8s → 2.8s) |
| /api/kis/order DB credential 조회 | 클라이언트에 appKey/appSecret 노출 금지 |
| ATR 배수를 학습 대상으로 통합 | 학습 리스크값 vs ATR 충돌 해소 |
| learning.ts + learning-engine.ts 분리 | 공개 API / 내부 구현 단일책임 |
| learning_snapshots 영속화 | 엔진 실행마다 재계산 방지 |
| balance/price API POST 전환 (v7.1) | appSecret이 URL 쿼리 → Nginx/Vercel 로그에 노출되는 취약점 제거 |
| engine_lock app_config 활용 (v7.1) | 별도 스키마 마이그레이션 없이 기존 key-value 패턴으로 중복 실행 방지 |
| config-validator.ts 분리 (v7.1) | 엔진 진입부에서 환경변수 검증 단일 지점 집중 — 단일 책임 원칙 |
| withRetry 재시도 래퍼 분리 (v7.1) | 재시도 로직 독립 유틸화, KIS 토큰 발급에만 선택적 적용 |
| constants.ts 매직 넘버 중앙화 (v7.1) | END_OF_DAY_TIME·투자자보정·장초 임계값 등 하드코딩 수치를 단일 파일로 통합 |
| market-calendar.ts 분리 (v7.1) | KST 시간 계산·공휴일 로직을 엔진 흐름에서 분리 — 독립 테스트 가능 |
| intraday.ts VWAP/POC 분리 (v7.1) | 장중 지표 계산 독립 모듈화 — 아직 메인 루프 미통합, 실험 단계 |
| strategies.ts 전략 배분 분리 (v7.1) | watchlist 40% / surge 25% / institutional 35% 배분 비율 선언적 관리 |

## 중요 Gotchas

- `bb_position` 코드 값은 `below`/`above` (설계서의 `lower`/`upper`와 다름)
- `CRON_SECRET` 환경변수 미설정 시 `/api/engine` GET이 500 반환 (이전에는 선택)
- `atr_value = 0` 레코드는 학습에서 제외 (0 나누기 방지)
- `closePosition()` FIFO — 같은 종목 복수 open 포지션 있으면 가장 오래된 것만 처리
- `batchFetch` 는 `Promise.allSettled` 사용 — 개별 KIS 호출 실패해도 엔진 계속 진행
- KIS Health Check 폴링(`/api/kis/health`)은 60초 간격 — `stopHealthPolling()` cleanup 필수
- `sendKISApiErrorAlert` 알림에 KIS 자격증명 절대 포함 금지 (kisCode, kisMessage만 허용)
- v7.1: `engine_lock` 5분 TTL — Vercel 함수 타임아웃 시 자동 만료되므로 다음 실행에서 정상 진입 가능
- v7.1: `withRetry`는 `issueKisToken`에만 적용 — 모든 API에 적용 시 실행 시간 초과 위험
- v7.1: `validateRequiredEnv()` 응답 `missing`에는 변수명만 포함 — 실제 값 절대 노출 금지
- `preflight.readiness.autoTradingReady=true` 여야 자동매매 허용, `livePromotionReady=true` 전에는 실전 승격 보류
- `engine-v2`는 로컬 비교/드릴다운/리포트 export까지 완료됐지만, 아직 `paper` 전용 시크릿/DB/알림 분리가 선행되어야 함

## 엔진 실행 구조

```
GitHub Actions (09:30/11:00/13:00/14:30 KST)
  → GET /api/engine (Authorization: Bearer CRON_SECRET)
  [v7.1 진입부 안전장치]
  → validateRequiredEnv()              ← 신규: 누락 시 Telegram + 500
  → engine_lock 확인/획득              ← 신규: 5분 TTL 중복 방지
  → cleanupStalePendingOrders()        ← 신규: 30분 초과 레코드 정리
  → withRetry(issueKisToken, {max:3})  ← 기존 2회→3회 지수 백오프
  [기존 엔진 로직]
  → STEP 0: cancelOpenBuyOrders + getMarketTrend (병렬)
  → STEP 1: 보유종목 손절/익절 평가
  → STEP 1.5: approved 신호 limitBuyOrder
  → STEP 2: watchlist 배치 신호 분석 (batchFetch)
  → STEP 3: 급등주 스캔 + 배치 신호 분석 (batchFetch)
  → logEngineRun()
  [finally] engine_lock = null         ← 신규: 정상/오류 모두 락 해제
```

## 학습 피드백 루프

```
매매 실행 → trade_memory 저장 → 주 1회 학습 (UTC 월요일, Vercel Cron /api/observer)
→ learning_snapshots 저장 → 엔진이 loadLatestLearning() → 다음 매매에 적용
```

## 주요 파일 (빠른 접근)

```
src/lib/learning.ts                   — 학습 공개 API (runLearning, loadLatestLearning, applyLearning)
src/lib/learning-engine.ts            — 학습 내부 구현 (learnWeights, learnAtrMultipliers 등)
src/lib/kis/indicators.ts             — 기술 지표, ATR, calcDynamicRisk, calcPositionSize
src/lib/engine/kis.ts                 — KIS API 호출 (limitBuyOrder, cancelOpenBuyOrders 등)
src/lib/engine/filters.ts             — 종목 필터 (DART, 시가총액, 상장일) + v6.2 섹터 필터 예정
src/lib/config-validator.ts           — 필수 환경변수 검증 [v7.1 신규]
src/lib/engine/retry.ts               — 지수 백오프 재시도 래퍼 [v7.1 신규]
src/lib/engine/constants.ts           — 엔진 상수 중앙화 [v7.1 신규]
src/lib/engine/intraday.ts            — VWAP/POC 장중 지표 [v7.1 신규, 미통합]
src/lib/engine/strategies.ts          — 전략 배분 비율 [v7.1 신규]
src/lib/engine/market-calendar.ts     — KST 시간/공휴일 판단 [v7.1 신규]
src/lib/engine/utils.ts               — batchFetch, getOpeningBonus [v7.1 분리]
src/app/api/engine/route.ts           — 엔진 오케스트레이션 (STEP 0~3)
src/app/api/kis/balance/route.ts      — KIS 잔고 프록시 [v7.1 GET→POST 전환]
src/app/api/kis/price/route.ts        — KIS 현재가 프록시 [v7.1 GET→POST 전환]
src/lib/kis/client.ts                 — 클라이언트→API Route 어댑터 [v7.1 POST 방식으로 변경]
src/app/api/observer/route.ts         — 시장 감시 + 학습 트리거
src/app/api/preflight/route.ts        — 운영 전 점검 결과 + readiness 집계
src/app/api/positions/reconcile/route.ts — 브로커-DB 정합성 수동 복구
src/app/api/pnl-audit/route.ts        — closed position vs trade_memory 손익 정합성 감사
src/app/api/rehearsal-checklist/route.ts — 리허설 체크리스트 + 이벤트 기반 증빙 요약
src/app/engine-v2/page.tsx            — 실험선 시나리오 워크스페이스
src/lib/engine-v2/*                   — 다중 자산군 실험 러너 / adapter / preset / report
.github/workflows/engine-cron.yml     — GitHub Actions 크론 정의
tests/core.spec.ts                    — Playwright E2E 핵심 경로 테스트 [v7.1 신규]
```

## 다음 작업 (2026-05-11 기준)

**운영선**
1. `preflight` 차단 규칙과 실제 엔진 차단 규칙이 완전히 일치하는지 교차 검증
2. `positions reconcile` 및 `broker-sync` 자동복구 정책을 실계좌/모의계좌 기준으로 더 단단히 정리
3. 수동 주문, 부분체결, stale pending order, PnL audit 경로를 실제 운영 로그와 함께 리허설

**실험선**
4. `engine-v2`를 `dev` 실험선에서 `paper` 검증선으로 승격할 시크릿/DB/알림 분리
5. `engine-v2`의 국내 실데이터, 해외 mock/provider 경계를 유지한 채 preset/report 흐름 검증

**문서 / 운영**
6. `docs/operations/paper-promotion-checklist.md` 기준으로 승격 출력물 남기기
7. `docs/operations/pre-live-checklist.md` 기준으로 실운용 전 fail/warn 기준 확정
