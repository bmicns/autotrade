export type AlertPriority = "P1" | "P2" | "P3";

const PRIORITY_RULES: Array<{ priority: AlertPriority; matchers: string[] }> = [
  { priority: "P1", matchers: ["계좌 오류", "정합성 불일치", "섹터 과집중", "반복진입 초과", "엔진 오류", "최근 정지"] },
  { priority: "P2", matchers: ["stale", "lifecycle 경고", "주문 실패", "손익 대사 불일치", "수동 intent 차단"] },
];

export function resolveAlertPriority(alert: string): AlertPriority {
  for (const rule of PRIORITY_RULES) {
    if (rule.matchers.some((matcher) => alert.includes(matcher))) {
      return rule.priority;
    }
  }
  return "P3";
}

export function summarizeOperationalAlerts(alerts: string[]): {
  priority: AlertPriority | null;
  headline: string | null;
} {
  if (alerts.length === 0) {
    return { priority: null, headline: null };
  }

  const sorted = [...alerts].sort((a, b) => {
    const pa = resolveAlertPriority(a);
    const pb = resolveAlertPriority(b);
    const score = { P1: 0, P2: 1, P3: 2 } as const;
    return score[pa] - score[pb];
  });
  const headline = sorted[0] ?? null;
  return {
    priority: headline ? resolveAlertPriority(headline) : null,
    headline,
  };
}
