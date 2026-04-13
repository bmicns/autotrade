# NEXIO — AI 컨텍스트 요약

> 이 파일은 AI 에이전트가 NEXIO 프로젝트를 빠르게 파악하기 위한 압축 요약본이다.
> 상세 내용은 `wiki/INDEX.md` → 각 토픽 파일 참조.

---

## 프로젝트 한 줄 요약

NEXIO는 한국 주식 자동매매 시스템으로, Next.js + Supabase 기반이며 실전 매매 결과를 학습하여 전략을 자동 최적화한다 (v5.9.0).

## 현재 상태 (2026-04-12 기준)

- **버전**: v5.9.0
- **배포**: https://nexio.vercel.app
- **최근 완료**: 적응형 학습 엔진 (P1~P6, GAP 97%)
- **미완료**: ABCompareCard UI (낮은 우선순위, v5.9.1 예정)

## 절대 하면 안 되는 것

1. `npx vercel` 직접 실행 — 반드시 `deploy nexio` 스크립트 사용
2. `runLearning()` 엔진에서 직접 호출 — `loadLatestLearning()` 사용
3. Vercel Cron 3번째 슬롯 추가 — Hobby 플랜 2개 한도
4. `vercel.json` Cron 수정 — 기존 observer에 조건 병합으로 처리
5. 소스 파일 수정 시 `node_modules/next/dist/docs/` 미확인

## 핵심 아키텍처 결정

| 결정 | 이유 |
|------|------|
| ATR 배수를 학습 대상으로 통합 | 학습 리스크값 vs ATR 충돌 해소 |
| 학습 Cron → observer 병합 | Hobby 플랜 Cron 2개 한도 |
| learning_snapshots 영속화 | 엔진 실행마다 DB 풀스캔 재계산 방지 |
| 신뢰도 medium 이상만 takeProfitRatio 적용 | 작은 샘플 과적합 방지 |
| 최소 1주 포지션 보장 | 고변동성 종목 포지션 미실행 방지 |

## 중요 Gotchas

- `bb_position` 코드 값은 `below`/`above` (설계서의 `lower`/`upper`와 다름)
- `atr_value = 0` 레코드는 학습에서 제외 (0 나누기 방지)
- 학습 스냅샷 만료(7일) 시 폴백: 가장 최신 활성 스냅샷 사용
- 배포 후 실거래 데이터 < 50건 → 대부분 none/low 신뢰도 상태
- STEP 1 for 루프에서 `stopLoss`는 반드시 `const`로 선언 (스코프 버그 방지)

## 학습 피드백 루프

```
매매 실행 → trade_memory 저장 → 주 1회 학습 (UTC 월요일, observer Cron)
→ learning_snapshots 저장 → 엔진이 로딩 → 다음 매매에 적용
```

## 주요 파일 (빠른 접근)

```
src/lib/learning.ts              — 학습 핵심 (learnWeights, learnAtrMultipliers, ...)
src/lib/kis/indicators.ts        — ATR 계산, calcDynamicRisk, calcPositionSize
src/app/api/engine/route.ts      — 엔진 (Cron 4회, STEP 0/1)
src/app/api/observer/route.ts    — 시장 감시 + 학습 트리거
src/app/api/learn/route.ts       — 학습 API
src/components/stats/learning-section.tsx  — 학습 현황 UI
```

## 다음 작업 (우선순위순)

1. ABCompareCard 구현 — base_score vs learned_score 비교 (v5.9.1)
2. WeightBarChart ranging 탭 전환 UI (v5.10.0)
3. 설계서 학습 요일 현행화 (토요일 → 월요일)
4. 실거래 데이터 50건 이상 누적 후 신뢰도 상향 확인
