# NEXIO — 플랫폼 개요

[coverage: high -- 5 sources]

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
- **현재 버전**: v5.9.0
- **Supabase 프로젝트 ID**: bcxjyxfflcgmyltnxben
- **배포 URL**: https://nexio.vercel.app
- **GitHub 계정**: watchers0930

## 주요 기능 영역

1. **자동매매 엔진** — Cron 기반 하루 4회 실행, 신호 분석 후 자동 주문
2. **신호 시스템** — 다중 기술 지표 분석으로 매수 신호 도출
3. **적응형 학습 엔진 (v5.9.0 신규)** — 실전 매매 결과를 학습하여 전략 파라미터 자동 최적화
4. **포지션 관리** — 포지션 보유, 청산(손절/익절/트레일링) 관리
5. **통계 대시보드** — 성과 분석, 학습 현황, 종목별 성과 시각화
6. **관심종목 / 워치리스트** — 매매 대상 종목 관리
7. **수동 매수** — 관리자 UI에서 직접 매수 실행

## 주의 사항 (Gotchas)

- AGENTS.md 지시사항: "이 프로젝트는 학습 데이터의 Next.js와 다르다 — 코드 작성 전 `node_modules/next/dist/docs/` 가이드를 반드시 읽을 것"
- Vercel Hobby 플랜 Cron 슬롯은 **최대 2개** — 추가 Cron 생성 불가
- KIS(한국투자증권) API 의존성이 있으며, API 호출 장애 시 매매 불가

## Sources

- `package.json`
- `README.md`
- `AGENTS.md`
- `docs/04-report/features/adaptive-engine.report.md`
- MEMORY.md (NEXIO 섹션)
