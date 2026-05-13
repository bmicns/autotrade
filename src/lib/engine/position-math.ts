export function getOpenPositionRemainingQty(position: { entry_qty?: unknown; partial_exit_qty?: unknown }): number {
  const entryQty = Number(position.entry_qty) || 0;
  const partialQty = Number(position.partial_exit_qty) || 0;
  return Math.max(0, entryQty - partialQty);
}
