# 주식 자동매매 시스템 (AutoTrade)

한국투자증권 KIS Open API 기반 주식 자동매매 시스템

## 프로젝트 구조

```
autotrade/
├── server/
│   ├── src/
│   │   ├── strategies/           # 시그널 분석 전략 (6개)
│   │   │   ├── rsi.js            # RSI (상대강도지수)
│   │   │   ├── macd.js           # MACD
│   │   │   ├── bollinger.js      # 볼린저 밴드
│   │   │   ├── moving-avg.js     # 이동평균선
│   │   │   ├── volume.js         # 거래량 분석
│   │   │   └── momentum.js       # 모멘텀 연속 전략 ★
│   │   ├── services/
│   │   │   ├── kis-api.js        # KIS API 연동
│   │   │   ├── signal.js         # 종합 시그널 엔진
│   │   │   ├── trader.js         # 자동매매 실행 엔진
│   │   │   ├── stock-universe.js # 전체 종목 스캔 ★
│   │   │   └── position-manager.js # 포지션 관리 (익절/손절) ★
│   │   ├── routes/api.js         # REST API
│   │   ├── db/store.js           # JSON 파일 저장소 ★
│   │   └── utils/
│   │       ├── logger.js
│   │       └── rate-limiter.js   # API 호출 속도 제한 ★
│   ├── data/                     # 영속 데이터 (JSON)
│   ├── .env.example
│   └── index.js                  # Express + WebSocket + 크론
├── client/                       # Vite + React 모바일 UI ★
│   ├── src/
│   │   ├── components/           # 대시보드, 모멘텀, 시그널, 매매이력, 잔고
│   │   └── lib/                  # API 클라이언트, WebSocket 훅
│   └── public/manifest.json      # PWA
└── README.md
```

## 매매 전략

### 기존 5개 지표 (다수결)
| 시그널 강도 | 조건 | 동작 |
|---|---|---|
| 강한 매수 | 3개+ 지표 매수 일치 | 자동 매수 |
| 약한 매수 | 2개 지표 매수 일치 | 사용자 승인 후 매수 |
| 강한 매도 | 3개+ 지표 매도 일치 | 자동 매도 |
| 약한 매도 | 2개 지표 매도 일치 | 사용자 승인 후 매도 |

### 모멘텀 연속 전략 (신규)
- 전일 양봉 + 상승추세 + 거래량 증가 + 3일 연속 상승 + 진입범위 체크
- 5개 조건 중 4개+ → 강한 매수, 3개 → 보통 매수
- **5% 익절 / 3% 손절** 자동 실행
- 최대 동시 포지션: 5개

### 크론 스케줄
- `08:50` 전체 종목 프리필터 (KOSPI + KOSDAQ 거래량 상위)
- `09:05` 모멘텀 매수 스캔 (장 시작 직후 1회)
- `3분마다` 포지션 모니터링 (익절/손절)
- `5분마다` 기존 시그널 스캔

## 설치 & 실행

```bash
# 서버
cd server && npm install
cp .env.example .env   # KIS API 키 입력
npm run dev

# 클라이언트 (별도 터미널)
cd client && npm install
npm run dev
```

모바일: `http://[맥북IP]:3007` 접속 → 홈 화면에 추가 (PWA)

## TODO

- [x] 백엔드 서버 코드 (6개 전략)
- [x] 모바일 반응형 UI
- [x] 전체 종목 스캔 (KOSPI + KOSDAQ)
- [x] 모멘텀 연속 전략 + 포지션 관리
- [x] WebSocket 실시간 업데이트
- [x] KIS API 연동 + 토큰 발급 확인
- [ ] 모의투자 실전 테스트
