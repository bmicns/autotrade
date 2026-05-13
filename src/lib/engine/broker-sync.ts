export interface BrokerHoldingCandidate {
  pdno?: string;
  prdt_name?: string;
  hldg_qty?: string;
  pchs_avg_pric?: string;
}

export interface RestorableHolding {
  code: string;
  name: string;
  qty: number;
  price: number;
}

export interface DbOpenPositionCandidate {
  stock_code?: string;
  stock_name?: string | null;
  entry_qty?: unknown;
  partial_exit_qty?: unknown;
}

export interface BrokerDbMismatchSummary {
  missingInDb: Array<{ code: string; name: string; brokerQty: number; brokerPrice: number }>;
  qtyMismatch: Array<{ code: string; name: string; brokerQty: number; dbQty: number }>;
  orphanedDb: Array<{ code: string; name: string; dbQty: number }>;
}

export interface BrokerReconcilePlan {
  missingInDb: BrokerDbMismatchSummary["missingInDb"];
  qtyAdjustments: Array<{ code: string; name: string; brokerQty: number; dbQty: number }>;
  orphanedClosures: Array<{ code: string; name: string; dbQty: number }>;
}

export function selectRestorableBrokerHoldings(
  holdings: BrokerHoldingCandidate[],
  openCodes: Iterable<string>,
): RestorableHolding[] {
  const openCodeSet = new Set(openCodes);
  const restored: RestorableHolding[] = [];

  for (const holding of holdings) {
    const code = String(holding.pdno ?? "");
    const qty = Number(holding.hldg_qty) || 0;
    const price = Math.round(Number(holding.pchs_avg_pric) || 0);
    if (!code || openCodeSet.has(code) || qty <= 0 || price <= 0) continue;

    restored.push({
      code,
      name: String(holding.prdt_name ?? code),
      qty,
      price,
    });
    openCodeSet.add(code);
  }

  return restored;
}

export function compareBrokerHoldingsWithDb(
  holdings: BrokerHoldingCandidate[],
  openPositions: DbOpenPositionCandidate[],
): BrokerDbMismatchSummary {
  const brokerMap = new Map<string, { code: string; name: string; qty: number; price: number }>();
  const dbMap = new Map<string, { code: string; name: string; qty: number }>();

  for (const holding of holdings) {
    const code = String(holding.pdno ?? "");
    const qty = Number(holding.hldg_qty) || 0;
    const price = Math.round(Number(holding.pchs_avg_pric) || 0);
    if (!code || qty <= 0) continue;
    brokerMap.set(code, {
      code,
      name: String(holding.prdt_name ?? code),
      qty,
      price,
    });
  }

  for (const position of openPositions) {
    const code = String(position.stock_code ?? "");
    const entryQty = Number(position.entry_qty) || 0;
    const partialQty = Number(position.partial_exit_qty) || 0;
    const qty = Math.max(0, entryQty - partialQty);
    if (!code || qty <= 0) continue;
    dbMap.set(code, {
      code,
      name: String(position.stock_name ?? code),
      qty,
    });
  }

  const missingInDb: BrokerDbMismatchSummary["missingInDb"] = [];
  const qtyMismatch: BrokerDbMismatchSummary["qtyMismatch"] = [];
  const orphanedDb: BrokerDbMismatchSummary["orphanedDb"] = [];

  for (const [code, broker] of brokerMap) {
    const db = dbMap.get(code);
    if (!db) {
      missingInDb.push({ code, name: broker.name, brokerQty: broker.qty, brokerPrice: broker.price });
      continue;
    }
    if (db.qty !== broker.qty) {
      qtyMismatch.push({ code, name: broker.name, brokerQty: broker.qty, dbQty: db.qty });
    }
  }

  for (const [code, db] of dbMap) {
    if (!brokerMap.has(code)) {
      orphanedDb.push({ code, name: db.name, dbQty: db.qty });
    }
  }

  return { missingInDb, qtyMismatch, orphanedDb };
}

export function buildBrokerReconcilePlan(
  holdings: BrokerHoldingCandidate[],
  openPositions: DbOpenPositionCandidate[],
): BrokerReconcilePlan {
  const summary = compareBrokerHoldingsWithDb(holdings, openPositions);
  return {
    missingInDb: summary.missingInDb,
    qtyAdjustments: summary.qtyMismatch,
    orphanedClosures: summary.orphanedDb,
  };
}
