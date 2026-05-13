type BalanceSummary = Record<string, unknown>;

const CASH_FALLBACK_FIELDS = ["dnca_tot_amt", "ord_psbl_cash", "ord_psbl_amt", "nxdy_excc_amt"] as const;
const AVAILABLE_CASH_FIELDS = ["ord_psbl_cash", "ord_psbl_amt", "dnca_tot_amt", "nxdy_excc_amt"] as const;
const AVAILABLE_CASH_BUFFER_RATE = 0.99;

function parseNumericField(summary: BalanceSummary, key: string): number {
  const value = Number(summary[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function resolveBalanceCashAmount(summary: BalanceSummary): number {
  for (const key of CASH_FALLBACK_FIELDS) {
    const value = parseNumericField(summary, key);
    if (value > 0) return value;
  }
  return 0;
}

export function resolveAvailableCash(summary: BalanceSummary): number {
  const candidates = AVAILABLE_CASH_FIELDS
    .map((key) => parseNumericField(summary, key))
    .filter((value) => value > 0);

  if (candidates.length === 0) return 0;

  const baseAmount = Math.min(...candidates);
  return Math.max(0, Math.floor(baseAmount * AVAILABLE_CASH_BUFFER_RATE));
}
