# Nexio Next Session

이 파일은 다음 작업 때 `이어서 하자`만 받아도 바로 붙을 수 있게 현재 상태를 정리한 메모다.

## 호칭 / 응대

- 사용자 호칭은 반드시 `대장님`
- `당신` 표현 금지
- 최대한 정중한 말투 유지

## 현재 전략 / 엔진 상태

- 고정 `익절` 규칙은 제거됨
- 수익 구간 청산은 `트레일링 스탑` 중심
- 트레일링 발생 시:
  - 1차: `50% 부분청산`
  - 2차: `잔량 전량청산`
- `partial_tp` 상태에서는 재진입 허용
- `비수익 포지션`만 `maxHoldDays` 초과 시 기간청산
- 전략 배분은 `관심종목 20 / 급등주 40 / 기관추종 40`
- 주문 기준은 `총자산 기준`
- 관심종목 첫 진입은 배분 한도 전체 사용 가능
- 재진입은 `50%` 규모 유지

## 최근 큰 수정

### 라우트 / UI

- `/stats` 라우트 복구
- 모바일/데스크탑에서 통계 진입을 실제 `/stats` 이동으로 통일
- 통계 페이지 로딩 중 크래시 방어 추가
- UI에 남아 있던 `익절` 표기는 제거하거나 `레거시 청산`으로 치환

### 엔진 / 포지션

- 고정 익절 로직 제거
- 트레일링 부분청산 + 재진입 구조로 변경
- 승인매수 경로(`runStep15`)를 자동매수와 같은 재진입/포지션 제한 규칙으로 정리
- 재진입 체결 시 `phase`만 바꾸지 않고:
  - `entry_qty`
  - `entry_price`
  - `partial_exit_price`
  - `partial_exit_qty`
  를 같이 정리하도록 수정
- 수동매도는 `entry_qty`가 아니라 실제 잔량 기준으로 검사하도록 수정
- `closePosition`의 블렌드 손익을 `trade_memory`와 수동매도에도 같이 사용하도록 정리

### 설정 동기화

- `tradeSettings`를 로컬 저장소만 믿지 않고 서버 `app_config` 기준으로 동기화
- `/api/engine-control` 응답에 아래 필드 포함되도록 확장:
  - `stop_loss`
  - `trailing_stop`
  - `partial_exit_ratio`
  - `max_trades_per_day`
  - `daily_loss_limit`
  - `max_hold_days`
  - `morning_start`
  - `morning_end`
  - `afternoon_start`
  - `afternoon_end`

### 정리 작업

- 현재 엔진에서 안 쓰는 익절 관련 데드코드 대거 제거
- 현재 청산 사유와 레거시 청산 사유 분리
- `ATR profit` 계열 잔존 로직 제거

## 최근 점검 결과

구조상 중요한 불일치는 아래 4건을 수정 완료함.

1. 승인매수 경로가 `partial_tp` 재진입을 막거나 `maxPositions`를 초과할 수 있던 문제
2. 재진입 체결 후 포지션 수량/평단/부분청산 기록이 DB에 반영되지 않던 문제
3. 부분청산 뒤 재진입 시 최종 PnL이 왜곡될 수 있던 문제
4. UI `tradeSettings`와 엔진 실사용 값이 장기적으로 어긋날 수 있던 문제

## 검증 상태

최근 확인 결과:

- `./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters` 통과
- `npm run test:unit` 통과
- `npm run build` 통과

## 아직 남은 방향

지금부터는 대수술보다 `운영 전 마무리`와 `운영 중 미세조정` 단계다.

- 운영 전 전체 기준 문서는 `docs/operations/pre-live-checklist.md`
- 다음 작업에서 누락 방지용 기준은 반드시 이 문서를 먼저 확인
- 전략 개선보다 운영 안정성 / 정합성 / 주문 안전성 / 장애 복구 우선

### 실운용 전 선행 우선순위

1. 백테스트-실전 정합성 개선
2. 운영 대시보드 강화
3. 알림 체계 정교화
4. 장중 리스크 킬스위치
5. 보안 / 관리자 액션 보호 점검
6. 설정 변경 이력
7. 전략별 성과 분리
8. 재진입 제한 규칙 설계

### 실운용 중 병행

1. 체결 로그 기반 미세조정
2. 재진입 과열 여부 확인
3. 트레일링 민감도 조정
4. 예수금/주문가능금액 실데이터 보정

## 다음 세션에서 바로 시작하기 좋은 작업

대장님이 `이어서 하자`만 말씀하시면 아래 순서로 진행하면 된다.

1. `git status --short`로 현재 워크트리 확인
2. `DEVELOPMENT_RULES.md` 먼저 열어서 절대규칙 확인
3. `docs/operations/pre-live-checklist.md` 먼저 열어서 남은 항목 확인
4. `./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters`
5. `npm run test:unit`
6. 대장님이 별도 지정이 없으면 아래 우선순위대로 진행

기본 다음 작업 우선순위:

1. 운영 대시보드 / 가시성 점검
2. 킬스위치 / 보안 점검
3. 백테스트-실전 정합성 개선

## 다음 세션용 한 줄 문구 예시

- `autotrade 이어서 하자`
- `autotrade 이어서 하자. 운영 대시보드부터`
- `autotrade 이어서 하자. 배포까지`
