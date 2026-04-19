# Deployment — 배포 구성

[coverage: high -- 4 sources]

## Purpose

NEXIO는 Vercel Hobby 플랜에서 운영된다. Next.js App Router + Vercel Cron + GitHub Actions를 조합하여 서버리스 자동매매 환경을 구성한다. Hobby 플랜의 Cron 빈도 제한(하루 1회)을 GitHub Actions로 우회하여 트레이딩 엔진을 평일 하루 4회 실행하는 것이 핵심 아키텍처 결정이다.

## Architecture

```
GitHub Actions (엔진 트리거, 하루 4회 + 일일 리포트 1회)
        │
        ▼  GET /api/engine  (Bearer CRON_SECRET)
        ▼  GET /api/daily-report  (Bearer CRON_SECRET)
Vercel Serverless Functions
        │
        ├── /api/engine         ← 매매 신호 분석 + 포지션 청산
        ├── /api/observer       ← 시장 감시 + 월요일 학습 트리거
        ├── /api/engine-control ← 엔진 제어 (비상정지 / max_positions)
        └── /api/daily-report   ← 일일 매매 결과 텔레그램 전송
                │
                ▼
        Supabase (DB / 상태 영속화)
```

각 Cron 실행은 독립된 서버리스 함수 인스턴스로 기동된다. 인스턴스 간 상태 공유 불가 — 모든 상태는 Supabase DB에 영속화한다.

## 배포 정보

| 항목 | 값 |
|------|-----|
| 플랫폼 | Vercel Hobby 플랜 |
| URL | https://nexio.vercel.app |
| GitHub 계정 | watchers0930 |
| 현재 버전 | v5.14.0 |
| 배포 명령 | `deploy nexio` |

## Trading Engine — GitHub Actions Cron

### 도입 배경

Vercel Hobby 플랜 Cron 제약:
- 최대 2개 슬롯
- 슬롯당 실행 빈도: **하루 최대 1회**

트레이딩 엔진(`/api/engine`)은 평일 하루 4회 실행이 필요하다 (장 시작·중반·오후 세션 커버). Vercel Cron으로는 구조적으로 불가능하므로 GitHub Actions 무료 티어(분당 제한 없음)로 이관했다.

### 워크플로 파일

`.github/workflows/engine-cron.yml`

```yaml
on:
  schedule:
    - cron: "30 0 * * 1-5"  # KST 09:30
    - cron: "0 2 * * 1-5"   # KST 11:00
    - cron: "0 4 * * 1-5"   # KST 13:00
    - cron: "30 5 * * 1-5"  # KST 14:30
    - cron: "30 6 * * 1-5"  # KST 15:30 — 엔진 마지막 실행 or 일일 리포트
  workflow_dispatch:
jobs:
  trigger-engine:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Trigger NEXIO engine or daily report
        run: |
          HOUR=$(date -u +%H)
          MIN=$(date -u +%M)
          if [ "$HOUR" = "06" ] && [ "$MIN" -ge "25" ] && [ "$MIN" -le "35" ]; then
            curl -X GET https://nexio.vercel.app/api/daily-report \
              -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
          else
            curl -X GET https://nexio.vercel.app/api/engine \
              -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
          fi
```

### 실행 스케줄 (평일 월~금)

| UTC 스케줄 | KST 시각 | 설명 |
|------------|----------|------|
| `30 0 * * 1-5` | 09:30 | 장 시작 직후 첫 신호 분석 |
| `0 2 * * 1-5` | 11:00 | 오전 중반 |
| `0 4 * * 1-5` | 13:00 | 오후 장 초반 |
| `30 5 * * 1-5` | 14:30 | 장 마감 전 마지막 실행 |
| `30 6 * * 1-5` | 15:30 | HOUR/MIN 조건 분기 — KST 15:xx이면 `/api/daily-report`, 그 외엔 `/api/engine` |

`workflow_dispatch` 설정으로 GitHub UI에서 수동 실행도 가능하다.

### GitHub Repo Secret 설정 필수

`CRON_SECRET`을 GitHub 리포지토리 Settings → Secrets and variables → Actions에 등록해야 한다. 미등록 시 워크플로가 401을 반환하고 엔진이 전혀 실행되지 않는다.

## Signal System — Vercel Cron (Observer)

엔진 이관 후 `vercel.json`에는 `/api/observer`만 남는다.

```json
{ "crons": [{ "path": "/api/observer", "schedule": "0 0 * * 1-5" }] }
```

`/api/observer`는 매일 평일 UTC 00:00(KST 09:00)에 실행되며 시장 감시 역할을 담당한다.

## Adaptive Learning Engine — Observer 병합

v5.9.0 적응형 학습 엔진 추가 시, Cron 슬롯이 이미 소진된 상태였으므로 별도 학습 Cron 대신 `/api/observer`에 UTC 월요일 조건 분기로 병합했다.

```typescript
// observer/route.ts
if (new Date().getUTCDay() === 1) {
  await runLearning();
}
```

- 학습 실행 주기: **매주 월요일 KST 09:00**
- `vercel.json` 변경 없음 — 기존 슬롯 재활용

## Order Management — /api/engine 인증

`/api/engine`은 두 단계 인증을 거친다.

1. `CRON_SECRET` 환경변수 존재 확인 → 미설정 시 **500** 반환
2. `Authorization: Bearer {CRON_SECRET}` 헤더 일치 확인 → 불일치 시 **401** 반환

GitHub Actions `secrets.CRON_SECRET`과 Vercel 환경변수 `CRON_SECRET`이 **동일한 값**이어야 한다.

## Position Sizing — 서버리스 제약

Vercel 서버리스 함수 환경 특성:

- **ML 모델 실행 불가** — 메모리·실행시간 제약으로 런타임 내 모델 로드 불가
- **실시간 강화학습 불가** — 주 1회 배치 학습으로 대체
- **상태 비저장(Stateless)** — 각 Cron 실행은 독립 인스턴스. 이전 실행 결과는 DB에서만 참조 가능
- **포지션·신호·학습 데이터** 전부 Supabase에 영속화

## Data & Database

모든 상태는 Supabase에 저장된다. 서버리스 환경에서 인스턴스 간 공유가 불가능하기 때문이다.

- KIS API 인증 정보(`kis_config` 테이블) — UI 및 수동 실행용으로도 DB에 이중 저장
- 포지션, 신호, 학습 가중치 등 모든 런타임 상태 → DB 경유

## API Endpoints

| 엔드포인트 | 트리거 | 인증 | 역할 |
|-----------|--------|------|------|
| `GET /api/engine` | GitHub Actions (하루 4회) | `Authorization: Bearer CRON_SECRET` | 신호 분석 + 포지션 청산 |
| `GET /api/observer` | Vercel Cron (평일 UTC 00:00) | Vercel 내부 | 시장 감시 + 월요일 학습 |
| `GET /api/engine-control` | 수동 / 관리 UI | 없음 ⚠️ | `app_config`에서 `engine_enabled`, `max_positions` 조회 |
| `POST /api/engine-control` | 수동 / 관리 UI | 없음 ⚠️ (Critical — 수정 예정) | `engine_enabled`(비상정지), `max_positions`(1~20) 변경 |
| `GET /api/daily-report` | GitHub Actions (평일 KST 15:30) | `Authorization: Bearer CRON_SECRET` | 일일 매매 결과를 텔레그램으로 전송 |

## 환경 변수

| 변수명 | 용도 | 등록 위치 |
|--------|------|----------|
| `CRON_SECRET` | `/api/engine`, `/api/daily-report` GET 인증 | Vercel 환경변수 + GitHub Actions Secret |
| `KIS_APP_KEY` | KIS API 인증 | Vercel 환경변수 |
| `KIS_APP_SECRET` | KIS API 인증 | Vercel 환경변수 |
| `KIS_ACCOUNT_NO` | KIS 계좌번호 | Vercel 환경변수 |
| `DART_API_KEY` | DART 공시 필터 API | Vercel 환경변수 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 연결 | Vercel 환경변수 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 연결 | Vercel 환경변수 |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 인증 (일일 리포트 전송) | Vercel 환경변수 |
| `TELEGRAM_CHAT_ID` | 텔레그램 수신 채팅 ID (`7224554519`) | Vercel 환경변수 |

KIS 인증 정보는 Vercel 환경변수 외에도 Supabase `kis_config` 테이블에 이중 저장된다 (UI/수동 실행용).

## 배포 절차

```bash
deploy nexio
```

- 스크립트: `~/scripts/deploy.sh`
- `npx vercel` 직접 실행 금지
- 배포 후 커스텀 도메인 alias 자동 갱신 처리 포함

## Key Decisions

**GitHub Actions로 엔진 이관 (2026-04-17)**

Vercel Hobby Cron의 "슬롯당 하루 1회" 제약이 트레이딩 엔진의 요구사항(평일 4회)과 충돌. GitHub Actions 무료 티어는 빈도 제한이 없어 이관을 결정했다. 엔진 인증은 `CRON_SECRET` Bearer 토큰으로 보호.

**학습 Cron을 Observer에 병합**

Cron 슬롯이 2개로 고정된 상태에서 적응형 학습 엔진 추가 시 슬롯 추가가 불가능했다. UTC 월요일 조건 분기(`getUTCDay() === 1`)로 `/api/observer`에 병합하여 `vercel.json` 변경 없이 해결.

**일일 리포트 Cron을 기존 15:30 슬롯에 병합 (2026-04-17)**

Hobby 플랜 Cron 슬롯 한도로 인해 별도 슬롯 추가가 불가능했다. `engine-cron.yml`의 `30 6 * * 1-5`(KST 15:30) 슬롯에 HOUR/MIN 조건 분기를 추가하여, KST 15:xx 실행 시에는 `/api/daily-report`를 호출하고 그 외에는 `/api/engine`을 호출하도록 병합. `vercel.json` 변경 없이 해결.

## Gotchas

- **Hobby 플랜 Cron 슬롯 2개 한도** — 절대 초과 불가. 신규 정기 실행 기능은 기존 Cron에 조건 분기로 병합해야 한다
- **`CRON_SECRET` 이중 등록 필수** — Vercel 환경변수와 GitHub Actions Secret 양쪽에 동일한 값으로 등록하지 않으면 엔진이 401로 실패한다
- **GitHub Actions Cron은 UTC 기준** — KST 변환 오류 주의. 현재 스케줄은 UTC+9 기준으로 검증되어 있다
- **학습 실행은 월요일 Observer에 종속** — 수동 실행이 필요한 경우 `GET /api/observer`를 월요일에 직접 호출하거나, GitHub Actions `workflow_dispatch`로 `/api/engine`을 수동 트리거한다
- **POST /api/engine-control 인증 미설정** — 현재 인증이 없어 누구나 엔진 비상정지 및 max_positions 변경 가능. Critical 코드 리뷰 지적 사항, 수정 예정
- **POST /api/engine 인증 미설정** — Critical 코드 리뷰 지적 사항, 수정 예정
- **배포 후 alias 갱신 확인 필수**

## Sources

- `.github/workflows/engine-cron.yml` (GitHub Actions 스케줄 및 인증 구현)
- `vercel.json` (Vercel Cron 현행 구성 — observer만 남음)
- `docs/01-plan/features/adaptive-engine.plan.md` (Section 3: P4 결정 사항)
- `docs/04-report/features/adaptive-engine.report.md` (Section 5: 배포, Section 7: 기술적 의사결정 #1)
