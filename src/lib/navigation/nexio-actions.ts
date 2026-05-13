export type SectionAction = {
  path: string;
  anchor?: string;
  label?: string;
  hint?: string;
  detail?: string;
  location?: string;
  buttonLabel?: string;
};

export type PreflightLikeCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  blocksTrading?: boolean;
};

export function resolveAlertAction(alert: string): SectionAction {
  if (alert.includes("리컨실") || alert.includes("손익 대사")) {
    return { label: "설정 이동", path: "/settings", anchor: "reconcile-section" };
  }
  if (alert.includes("stale 대기 주문") || alert.includes("lifecycle") || alert.includes("수동 intent")) {
    return { label: "타임라인 보기", path: "/stats", anchor: "order-timeline-section" };
  }
  if (alert.includes("주문 실패") || alert.includes("주문 계좌 오류") || alert.includes("엔진 오류") || alert.includes("최근 정지")) {
    return { label: "로그 보기", path: "/stats", anchor: "engine-log-section" };
  }
  if (alert.includes("수동매도 실패")) {
    return { label: "로그 보기", path: "/stats", anchor: "direct-order-section" };
  }
  return { label: "프리플라이트", path: "/settings", anchor: "preflight-section" };
}

export function resolveSummaryAction(label: string): SectionAction | null {
  if (label === "오픈 포지션") return { path: "/settings", anchor: "reconcile-section", hint: "리컨실 확인" };
  if (label === "대기 주문") return { path: "/stats", anchor: "order-timeline-section", hint: "타임라인 보기" };
  if (label === "stale 주문") return { path: "/settings", anchor: "preflight-section", hint: "프리플라이트 확인" };
  if (label === "대기 신호") return { path: "/settings", anchor: "preflight-section", hint: "신호 점검" };
  if (label === "최근 부분체결") return { path: "/stats", anchor: "order-timeline-section", hint: "부분체결 보기" };
  if (label === "최근 lifecycle 경고") return { path: "/stats", anchor: "order-timeline-section", hint: "lifecycle 보기" };
  if (label === "최근 수동주문") return { path: "/stats", anchor: "direct-order-section", hint: "수동주문 보기" };
  if (label === "최근 주문실패") return { path: "/stats", anchor: "engine-log-section", hint: "실패 로그 보기" };
  return null;
}

export function summarizePreflightAction(check: PreflightLikeCheck): SectionAction {
  const fallback = { detail: check.detail, location: "프리플라이트 상세", anchor: "preflight-section", path: "/settings" } as const;
  if (check.key === "broker_reconcile") {
    return check.blocksTrading
      ? { detail: "포지션 리컨실을 실행하고 불일치가 0건인지 다시 확인", location: "설정 > 포지션 리컨실", anchor: "reconcile-section", path: "/settings" }
      : { detail: "브로커-DB 정합성 정상", location: "설정 > 포지션 리컨실", anchor: "reconcile-section", path: "/settings" };
  }
  if (check.key === "pending_orders") {
    return check.blocksTrading
      ? { detail: "미체결 주문과 stale 주문을 정리하고 잔량 취소 여부를 확인", location: "통계 > 주문 타임라인", anchor: "order-timeline-section", path: "/stats" }
      : { detail: "주문 타임라인에서 체결 또는 잔량 취소 진행 상황 확인", location: "통계 > 주문 타임라인", anchor: "order-timeline-section", path: "/stats" };
  }
  if (check.key === "manual_intent_flow") {
    return { detail: "수동 intent 타임라인에서 거절·실패·진행 중 항목의 사유를 확인", location: "통계 > 주문 타임라인", anchor: "order-timeline-section", path: "/stats" };
  }
  if (check.key === "recent_order_failures") {
    return check.status === "fail"
      ? { detail: "계좌·프로필 설정과 주문 인증 상태를 먼저 확인", location: "설정 > KIS 계좌 설정", anchor: "kis-config-section", path: "/settings" }
      : { detail: "engine-log에서 최근 주문 실패 원인과 재시도 가능 여부를 확인", location: "통계 > 엔진 로그", anchor: "engine-log-section", path: "/stats" };
  }
  if (check.key === "stale_signals") {
    return { detail: "pending_signals에서 오래된 승인/처리중 신호를 정리", location: "홈 > 대기 신호 / API pending-signals", path: "/" };
  }
  if (check.key === "engine_health") {
    return check.status === "fail"
      ? { detail: "최근 엔진 오류와 마지막 실행 시각을 확인하고 원인 해결 후 재점검", location: "통계 > 엔진 로그", anchor: "engine-log-section", path: "/stats" }
      : { detail: "마지막 실행 지연 원인을 확인하고 엔진 재실행 여부 판단", location: "설정 > 엔진 제어", anchor: "engine-control-section", path: "/settings" };
  }
  if (check.key === "kis_health") {
    return { detail: "KIS 연결과 토큰 재발급 가능 여부를 확인", location: "설정 > KIS 계좌 설정", anchor: "kis-config-section", path: "/settings" };
  }
  if (check.key === "kis_order_auth") {
    return { detail: "주문 계좌번호, 프로필, 인증 상태를 확인", location: "설정 > KIS 계좌 설정", anchor: "kis-config-section", path: "/settings" };
  }
  if (check.key === "watchlist") {
    return { detail: "감시 대상 종목을 최소 1개 이상 활성화", location: "홈 > 관심종목", path: "/" };
  }
  if (check.key === "rehearsal") {
    return { detail: "리허설 체크리스트 미완료 항목을 먼저 수행", location: "설정 > 리허설 추적", anchor: "rehearsal-section", path: "/settings" };
  }
  if (check.key === "recent_order_lifecycle") {
    return { detail: "주문 타임라인에서 부분체결·timeout·stale 정리 흐름을 검토", location: "통계 > 주문 타임라인", anchor: "order-timeline-section", path: "/stats" };
  }
  return fallback;
}

export function resolvePreflightCheckAction(check: PreflightLikeCheck): SectionAction {
  const action = summarizePreflightAction(check);
  return {
    ...action,
    buttonLabel: action.anchor ? "바로 이동" : "위치 안내",
  };
}

export function resolveStatCardAction(label: string): SectionAction | null {
  if (label === "선캐치" || label === "재진입" || label === "부분청산" || label === "대기등록" || label === "쿨다운" || label === "장마감스킵" || label === "뉴스쿨다운" || label === "뉴스차단") {
    return { path: "/stats", anchor: "runs-list-section", hint: "실행 로그 보기" };
  }
  if (label === "보유 악재" || label === "진입 차단") {
    return { path: "/stats", anchor: label === "보유 악재" ? "holding-risk-section" : "blocked-news-section", hint: label === "보유 악재" ? "악재 로그 보기" : "차단 로그 보기" };
  }
  if (label === "전송" || label === "종목수" || label === "메모전송" || label === "메모경고" || label === "실패") {
    return { path: "/stats", anchor: "holding-news-alert-section", hint: "전송 로그 보기" };
  }
  if (label === "국내 매수" || label === "국내 매도" || label === "미국 매수" || label === "미국 매도") {
    return { path: "/stats", anchor: "direct-order-log-section", hint: "체결 로그 보기" };
  }
  return null;
}
