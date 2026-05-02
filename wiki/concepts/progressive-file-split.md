---
concept: 점진적 파일 분리 (Progressive File Split)
last_compiled: 2026-05-02
topics_connected: [trading-engine, deployment, platform-overview]
status: active
---

# 점진적 파일 분리 (Progressive File Split)

## Pattern

NEXIO 코드베이스에서 반복적으로 등장하는 패턴이다. 단일 파일이 기능 추가로 500줄 한계에 근접하거나 초과하면, 그 자리에서 역할 단위로 분리한다. 분리는 한 번으로 끝나지 않고 새 파일도 다시 성장하면 재분리된다. "지금 당장 완벽한 구조"보다 "현재 제약 조건에서 최선"을 택하는 실용적 접근이다.

## Instances

- **2026-04-17** in [[../topics/trading-engine]]: `src/app/api/engine/route.ts`가 524줄로 500줄 원칙을 위반. 오케스트레이터(169줄)와 `steps.ts`(466줄)로 1차 분리. `batchFetch`, `getOpeningBonus`, 각 Step 함수가 `steps.ts`로 이동.

- **2026-04-20** in [[../topics/trading-engine]]: `steps.ts`(466줄)가 다시 한계에 근접. STEP 0/1/1.5(주문 관리·청산 감시)와 STEP 2/3(종목 탐색·신호 분석) 두 책임으로 재분리 → `steps.ts`(356줄) + `steps-scan.ts`(295줄).

- **2026-05-02 (v7.1)** in [[../topics/trading-engine]]: 매직 넘버·시간 계산·전략 배분·장중 지표가 각각 독립 모듈로 분리. `constants.ts`, `market-calendar.ts`, `strategies.ts`, `intraday.ts`, `utils.ts`, `retry.ts` 생성. 파일은 작아졌지만 파일 수가 늘었다.

- **2026-04-17** in [[../topics/deployment]]: Vercel Cron 슬롯 제약으로 별도 학습 Cron을 만들 수 없어 `observer`에 UTC 월요일 조건 분기로 병합. 이후 일일 리포트도 `15:30` 슬롯에 HOUR/MIN 분기로 병합. "파일을 만들 수 없으면 조건 분기로 대응"하는 인프라 수준의 동일 패턴.

## What This Means

분리 사이클이 반복될수록 파일은 작아지지만 import 의존성이 늘어난다. 현재 엔진 코어는 14개 이상의 파일로 구성되어 있으며, 각 파일은 명확한 단일 책임을 갖는다. 이 패턴의 장점은 수정 시 영향 범위가 명확하고, 테스트 작성이 쉬우며, 코드 리뷰 범위가 작다는 것이다.

주의할 점: 분리가 잘 된 모듈(`retry.ts`, `constants.ts`)은 독립적이지만, 오케스트레이터(`route.ts`)는 여전히 많은 모듈을 조합해야 한다. 조합 로직이 복잡해지면 오케스트레이터 자체가 다시 500줄에 근접할 수 있다. 현재 `route.ts`는 169줄로 안정적이지만, v7.1 진입부 확장(validateRequiredEnv, engine_lock, cleanupStalePendingOrders 추가)으로 줄 수가 증가 중이다.

## Sources

- [[../topics/trading-engine]]
- [[../topics/deployment]]
- [[../topics/platform-overview]]
