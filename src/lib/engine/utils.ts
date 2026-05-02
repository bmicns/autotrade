import { OPENING_BONUS_STRONG, OPENING_BONUS_MILD, OPENING_PENALTY_MILD, OPENING_PENALTY_STRONG, OPENING_GAP_STRONG, OPENING_GAP_MILD, OPENING_GAP_DROP_STRONG, OPENING_GAP_DROP_MILD } from "@/lib/engine/constants";

export async function batchFetch<T>(
  codes: string[],
  fetcher: (code: string) => Promise<T>,
  batchSize = 3
): Promise<Map<string, T>> {
  const map = new Map<string, T>();
  for (let i = 0; i < codes.length; i += batchSize) {
    const chunk = codes.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      chunk.map(async (code) => ({ code, data: await fetcher(code) }))
    );
    for (const r of results) {
      if (r.status === "fulfilled") map.set(r.value.code, r.value.data);
    }
    if (i + batchSize < codes.length) await new Promise((r) => setTimeout(r, 200));
  }
  return map;
}

export function getOpeningBonus(
  code: string,
  snapshotMap: Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>
): number {
  const snap = snapshotMap.get(code);
  if (!snap || snap.open_price <= 0) return 0;
  const gap = (snap.snapshot_price - snap.open_price) / snap.open_price;
  if (gap > OPENING_GAP_STRONG && snap.snapshot_volume > 50000) return OPENING_BONUS_STRONG;
  if (gap > OPENING_GAP_MILD) return OPENING_BONUS_MILD;
  if (gap < OPENING_GAP_DROP_STRONG) return OPENING_PENALTY_STRONG;
  if (gap < OPENING_GAP_DROP_MILD) return OPENING_PENALTY_MILD;
  return 0;
}
