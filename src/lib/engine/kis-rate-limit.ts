const KIS_RATE_LIMIT_CODES = new Set(["EGW00201"]);

export function shouldRetryRateLimit(message: string): boolean {
  return [...KIS_RATE_LIMIT_CODES].some((code) => message.includes(code)) || message.includes("초당 거래건수를 초과");
}

export function shouldRetryKisRequest(message: string, status?: number): boolean {
  if (shouldRetryRateLimit(message)) return true;
  return status === 408 || status === 429 || (typeof status === "number" && status >= 500);
}
