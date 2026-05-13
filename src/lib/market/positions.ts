import type { PositionSnapshot } from "./types";

export interface KrStockPositionRow {
  stock_code?: string | null;
  stock_name?: string | null;
  entry_qty?: number | string | null;
  partial_exit_qty?: number | string | null;
  entry_price?: number | string | null;
  entry_date?: string | null;
}

function resolveRemainingQuantity(row: KrStockPositionRow): number {
  const entryQty = Number(row.entry_qty) || 0;
  const partialExitQty = Number(row.partial_exit_qty) || 0;
  return Math.max(0, entryQty - partialExitQty);
}

function mapKrAssetPositionSnapshots(
  rows: KrStockPositionRow[],
  params: { assetClass: "kr_stock" | "kr_etf"; kind: "stock" | "etf" },
): PositionSnapshot[] {
  return rows
    .map((row) => ({
      symbol: String(row.stock_code ?? "").trim(),
      name: row.stock_name ? String(row.stock_name) : null,
      quantity: resolveRemainingQuantity(row),
      averagePrice: Number(row.entry_price) || 0,
      openedAt: row.entry_date ? String(row.entry_date) : undefined,
      currency: "KRW",
      assetClass: params.assetClass,
      region: "KR" as const,
      kind: params.kind,
    }))
    .filter((row) => /^\d{6}$/.test(row.symbol) && row.quantity > 0);
}

export function mapKrStockPositionSnapshots(rows: KrStockPositionRow[]): PositionSnapshot[] {
  return mapKrAssetPositionSnapshots(rows, { assetClass: "kr_stock", kind: "stock" });
}

export function mapKrEtfPositionSnapshots(rows: KrStockPositionRow[]): PositionSnapshot[] {
  return mapKrAssetPositionSnapshots(rows, { assetClass: "kr_etf", kind: "etf" });
}
