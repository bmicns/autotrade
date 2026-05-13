export interface RehearsalChecklistItem {
  key: string;
  label: string;
  checked: boolean;
  checkedAt: string | null;
}

export type RehearsalEvidenceMap = Partial<Record<string, string>>;

export const DEFAULT_REHEARSAL_ITEMS: RehearsalChecklistItem[] = [
  { key: "manual_buy", label: "수동매수 1건", checked: false, checkedAt: null },
  { key: "manual_sell", label: "수동매도 1건", checked: false, checkedAt: null },
  { key: "auto_exit", label: "자동 청산 1건", checked: false, checkedAt: null },
  { key: "reconcile", label: "리컨실 1건", checked: false, checkedAt: null },
  { key: "telegram", label: "텔레그램 알림 확인", checked: false, checkedAt: null },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeRehearsalChecklist(raw: unknown): RehearsalChecklistItem[] {
  const source = Array.isArray(raw) ? raw : [];
  const sourceMap = new Map<string, RehearsalChecklistItem>();

  for (const item of source) {
    if (!isRecord(item) || typeof item.key !== "string") continue;
    sourceMap.set(item.key, {
      key: item.key,
      label: typeof item.label === "string" ? item.label : item.key,
      checked: item.checked === true,
      checkedAt: typeof item.checkedAt === "string" && item.checkedAt ? item.checkedAt : null,
    });
  }

  return DEFAULT_REHEARSAL_ITEMS.map((base) => {
    const existing = sourceMap.get(base.key);
    return existing
      ? { ...base, checked: existing.checked, checkedAt: existing.checkedAt }
      : base;
  });
}

export function applyRehearsalUpdates(
  current: RehearsalChecklistItem[],
  updates: Array<{ key: string; checked: boolean }>,
  now = new Date().toISOString(),
): RehearsalChecklistItem[] {
  const updateMap = new Map(updates.map((item) => [item.key, item.checked]));
  return current.map((item) => {
    if (!updateMap.has(item.key)) return item;
    const checked = updateMap.get(item.key) === true;
    return {
      ...item,
      checked,
      checkedAt: checked ? now : null,
    };
  });
}

export function applyRehearsalEvidence(
  current: RehearsalChecklistItem[],
  evidence: RehearsalEvidenceMap,
): RehearsalChecklistItem[] {
  return current.map((item) => {
    if (item.checked) return item;
    const checkedAt = evidence[item.key];
    if (!checkedAt) return item;
    return {
      ...item,
      checked: true,
      checkedAt,
    };
  });
}

export function summarizeRehearsalChecklist(items: RehearsalChecklistItem[]) {
  const completedCount = items.filter((item) => item.checked).length;
  return {
    totalCount: items.length,
    completedCount,
    remainingCount: items.length - completedCount,
    completed: completedCount === items.length,
  };
}
