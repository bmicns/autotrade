# NEXIO 운영 안정성 및 코드 구조 개선 계획 (v6.1)

## 1. 개요
NEXIO 서비스의 운영 안정성을 근본적으로 강화하고, 비대해진 컴포넌트의 책임을 분산하여 유지보수 효율을 높이는 것을 목표로 합니다. 특히 오류 발생 시의 무음 처리를 제거하여 운영 가시성을 확보하고, KIS 연결 상태를 실시간으로 관리합니다.

## 2. 사용자 스토리
- **운영자:** "엔진이나 KIS API에서 문제가 발생했을 때, 앱이 그냥 멈춰있는 게 아니라 텔레그램으로 즉시 알림을 받고 싶다."
- **운영자:** "KIS 연결이 끊겼는지 여부를 화면에서 바로 확인하고 싶고, 필요하다면 자동으로 복구되었으면 좋겠다."
- **개발자:** "컴포넌트에 fetch 로직이 섞여 있어 복잡하다. 데이터 통신은 전용 훅(Hook)으로 분리하여 관리하고 싶다."
- **개발자:** "신호 승인 화면과 전략 설정 화면의 역할이 명확히 구분되어 가독성이 좋아졌으면 좋겠다."

## 3. 상세 기능 요구사항

### 3.1. 에러 핸들링 및 텔레그램 알림 강화
- **무음 처리(Silent Catch) 제거:** 
    - `src/lib/store.ts`의 `fetchKISData`, `src/lib/kis/api.ts` 등에서 `catch { /* ignore */ }`로 처리된 치명적 오류 블록을 전수 조사하여 제거.
- **즉시 알림 시스템:** 
    - KIS 토큰 만료, 잘못된 API Key, 잔고 조회 실패, 엔진 런타임 에러 등 운영에 치명적인 오류 발생 시 `src/lib/engine/notify.ts`의 `sendEngineErrorAlert`를 호출하여 텔레그램으로 알림.
- **오류 컨텍스트 포함:** 
    - 단순히 "에러 발생"이 아닌, 구체적인 HTTP 상태 코드 및 KIS 반환 메시지를 포함하여 알림 전송.

### 3.2. KIS 연결 상태 자동 감지 및 관리
- **연결 상태(Health Check) 강화:**
    - `useAppStore`의 `kisConnected` 상태를 단순히 데이터 로드 여부가 아닌, 실제 통신 성공 여부에 기반하여 업데이트.
- **자동 감지 로직:**
    - 주기적인(예: 1분 단위) 잔고 또는 토큰 유효성 체크를 통해 연결 상태를 실시간 반영.
    - API 요청 실패 시 즉시 `kisConnected`를 `false`로 전환하고 사용자에게 UI 피드백 제공.

### 3.3. 컴포넌트 직접 Fetch 로직의 Hook 추출 (Refactoring)
- **대상 및 계획:**
    - `src/hooks`에 데이터 통신 전용 커스텀 훅 생성.
    - `useStockSearch`: 종목 검색 (`api/stock-search`) 로직 추출.
    - `useThresholdsOptimize`: 전략 임계치 최적화 (`api/optimize-thresholds`) 로직 추출.
    - `useNews`: 홈 화면 뉴스 (`api/news`) 로직 추출.
    - `usePositions`: 현재 포지션 (`api/positions`) 로직 추출.
    - `usePortfolioSnapshot`: 포트폴리오 스냅샷 (`api/portfolio-snapshot`) 로직 추출.
- **효과:** 컴포넌트 코드량 감소 및 비즈니스 로직과 UI 렌더링의 분리.

### 3.4. Signal-Tab / Strategy-Tab 구조 개선
- **SignalTab (신호승인):**
    - 역할: 대기 중인 신호의 검토 및 승인/거절에 집중.
    - "관심종목(Watchlist)" 관리 기능을 전략 탭이나 별도의 영역으로 이동 검토하여 '승인'이라는 목적에 충실하게 변경.
- **StrategyTab (전략설정):**
    - 역할: 매매 전략 기준 수립 및 최적화.
    - 방대한 설정을 `SignalThresholdSection`, `TradeSettingSection`, `HistorySection` 등으로 컴포넌트화하여 모듈성 확보.
- **UI 일관성:** 탭 이동 시 데이터 로딩 상태 처리 및 전역 상태(Zustand)와의 연동 최적화.

## 4. 기술 요구사항
- **Framework:** Next.js (App Router)
- **State Management:** Zustand
- **Notification:** Telegram Bot API
- **API:** KIS (Korea Investment & Securities) Developers API
- **Language:** TypeScript

## 5. 우선순위
1. **P0:** 에러 무음 처리 제거 및 텔레그램 알림 (운영 안정성 직결)
2. **P0:** KIS 연결 상태 자동 감지 (운영 가시성)
3. **P1:** 컴포넌트 직접 fetch 훅 추출 (코드 품질)
4. **P2:** Signal/Strategy 탭 구조 개선 (사용자 경험)

## 6. 향후 일정
- 1단계: KIS/엔진 에러 핸들링 전수 조사 및 알림 통합
- 2단계: 커스텀 훅 추출 및 컴포넌트 리팩토링
- 3단계: 탭 UI/UX 개선 및 최종 검증
