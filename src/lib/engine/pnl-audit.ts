export interface ClosedPositionAuditRow {
  id: string;
  stock_code: string;
  stock_name?: string | null;
  exit_date?: string | null;
  exit_reason?: string | null;
  pnl_amount?: number | null;
  pnl_percent?: number | null;
}

export interface TradeMemoryAuditRow {
  id: string;
  stock_code: string;
  stock_name?: string | null;
  closed_at?: string | null;
  exit_reason?: string | null;
  pnl_amount?: number | null;
  pnl_percent?: number | null;
}

export interface PnlAuditMismatch {
  kind: "missing_trade_memory" | "missing_position" | "pnl_amount" | "pnl_percent" | "exit_reason";
  code: string;
  name: string;
  positionId?: string;
  tradeMemoryId?: string;
  positionExitAt?: string | null;
  tradeMemoryClosedAt?: string | null;
  positionValue?: number | string | null;
  tradeMemoryValue?: number | string | null;
}

export interface PnlAuditSummary {
  mismatchCount: number;
  mismatches: PnlAuditMismatch[];
  matchedCount: number;
}

const MAX_MATCH_DISTANCE_MS = 12 * 60 * 60 * 1000;

function asNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function pickClosestTradeMemory(
  position: ClosedPositionAuditRow,
  memories: TradeMemoryAuditRow[],
): { match: TradeMemoryAuditRow | null; rest: TradeMemoryAuditRow[] } {
  if (memories.length === 0) return { match: null, rest: memories };

  const positionTime = asTime(position.exit_date);
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  memories.forEach((memory, index) => {
    const memoryTime = asTime(memory.closed_at);
    const distance = positionTime !== null && memoryTime !== null
      ? Math.abs(positionTime - memoryTime)
      : index;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  if (bestIndex < 0 || bestDistance > MAX_MATCH_DISTANCE_MS) {
    return { match: null, rest: memories };
  }

  return {
    match: memories[bestIndex],
    rest: memories.filter((_, index) => index !== bestIndex),
  };
}

export function compareClosedPositionPnl(
  positions: ClosedPositionAuditRow[],
  memories: TradeMemoryAuditRow[],
): PnlAuditSummary {
  const mismatches: PnlAuditMismatch[] = [];
  let matchedCount = 0;

  const memoryGroups = new Map<string, TradeMemoryAuditRow[]>();
  for (const memory of memories) {
    const list = memoryGroups.get(memory.stock_code) ?? [];
    list.push(memory);
    memoryGroups.set(memory.stock_code, list);
  }

  for (const position of positions) {
    const code = position.stock_code;
    const name = position.stock_name ?? code;
    const currentGroup = memoryGroups.get(code) ?? [];
    const { match, rest } = pickClosestTradeMemory(position, currentGroup);
    memoryGroups.set(code, rest);

    if (!match) {
      mismatches.push({
        kind: "missing_trade_memory",
        code,
        name,
        positionId: position.id,
        positionExitAt: position.exit_date ?? null,
      });
      continue;
    }

    matchedCount++;

    const posAmount = asNumber(position.pnl_amount);
    const memAmount = asNumber(match.pnl_amount);
    if (posAmount !== memAmount) {
      mismatches.push({
        kind: "pnl_amount",
        code,
        name,
        positionId: position.id,
        tradeMemoryId: match.id,
        positionExitAt: position.exit_date ?? null,
        tradeMemoryClosedAt: match.closed_at ?? null,
        positionValue: posAmount,
        tradeMemoryValue: memAmount,
      });
    }

    const posPercent = asNumber(position.pnl_percent);
    const memPercent = asNumber(match.pnl_percent);
    if (posPercent !== memPercent) {
      mismatches.push({
        kind: "pnl_percent",
        code,
        name,
        positionId: position.id,
        tradeMemoryId: match.id,
        positionExitAt: position.exit_date ?? null,
        tradeMemoryClosedAt: match.closed_at ?? null,
        positionValue: posPercent,
        tradeMemoryValue: memPercent,
      });
    }

    if ((position.exit_reason ?? null) !== (match.exit_reason ?? null)) {
      mismatches.push({
        kind: "exit_reason",
        code,
        name,
        positionId: position.id,
        tradeMemoryId: match.id,
        positionExitAt: position.exit_date ?? null,
        tradeMemoryClosedAt: match.closed_at ?? null,
        positionValue: position.exit_reason ?? null,
        tradeMemoryValue: match.exit_reason ?? null,
      });
    }
  }

  for (const [code, rest] of memoryGroups.entries()) {
    for (const memory of rest) {
      mismatches.push({
        kind: "missing_position",
        code,
        name: memory.stock_name ?? code,
        tradeMemoryId: memory.id,
        tradeMemoryClosedAt: memory.closed_at ?? null,
      });
    }
  }

  return {
    mismatchCount: mismatches.length,
    mismatches,
    matchedCount,
  };
}
