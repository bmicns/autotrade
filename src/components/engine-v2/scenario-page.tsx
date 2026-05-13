"use client";

import { useCallback, useEffect, useState } from "react";

import { loadFromStorage, saveToStorage } from "@/lib/browser-storage";
import { COLORS } from "@/lib/constants";

type AssetClass = "kr_stock" | "us_stock" | "kr_etf" | "us_etf";

interface ScenarioAssetResult {
  assetClass: AssetClass;
  candidate: {
    symbol: string;
    name: string;
    price: number;
    score: number;
    reasons: string[];
    breakdown: Array<{
      key: string;
      label: string;
      weight: number;
      matched: boolean;
      detail?: string;
    }>;
    candles: Array<{
      at: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  } | null;
  policyAllowed: boolean;
  policyReasons: string[];
  orderPreview: {
    venue: string;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    orderType: "market" | "limit";
    currency: string;
    limitPrice?: number;
    warnings: string[];
  } | null;
}

interface ScenarioResponse {
  ok: boolean;
  mode: string;
  runtime?: {
    environment: "dev" | "paper" | "prod";
    dryRun: boolean;
    allowed: boolean;
    phase: "dev_lab" | "paper_dry_run" | "paper_candidate" | "blocked_prod";
    headline: string;
    detail: string;
    readyForPaperVerification: boolean;
    checks: Array<{
      key: string;
      label: string;
      status: "pass" | "warn" | "fail";
      detail: string;
    }>;
  };
  result: {
    environment: "dev" | "paper" | "prod";
    dryRun: boolean;
    assets: ScenarioAssetResult[];
  };
  error?: string;
}

interface ScenarioHistoryEntry {
  id: string;
  createdAt: string;
  selected: AssetClass[];
  result: ScenarioResponse["result"];
  profiles: Record<AssetClass, ScenarioProfileDraft>;
  presetId?: string;
  presetName?: string;
}

interface ScenarioProfileDraft {
  minScore: number;
  closeMomentumWeight: number;
  breakoutWeight: number;
  volumeWeight: number;
  trendWeight: number;
  openStrengthWeight: number;
  higherLowWeight: number;
  volatilityWeight: number;
  returnWeight: number;
  averageCloseWeight: number;
  compressionWeight: number;
  overheatedThresholdPct: number;
  volumeBreakdownRatio: number;
  pullbackConsecutiveCount: number;
}

interface ScenarioProfilePreset {
  id: string;
  name: string;
  createdAt: string;
  profiles: Record<AssetClass, ScenarioProfileDraft>;
}

type HistoryFilter = "all" | "custom" | string;
type PresetSortKey = "allowRate" | "averageScore" | "runCount";

const ALL_ASSETS: AssetClass[] = ["kr_stock", "kr_etf", "us_stock", "us_etf"];
const HISTORY_KEY = "nx-engine-v2-scenarios";
const PROFILE_KEY = "nx-engine-v2-profile-overrides";
const PRESET_KEY = "nx-engine-v2-profile-presets";
const HISTORY_LIMIT = 8;
const DEFAULT_PROFILES: Record<AssetClass, ScenarioProfileDraft> = {
  kr_stock: {
    minScore: 60,
    closeMomentumWeight: 25,
    breakoutWeight: 20,
    volumeWeight: 10,
    trendWeight: 20,
    openStrengthWeight: 10,
    higherLowWeight: 10,
    volatilityWeight: 5,
    returnWeight: 10,
    averageCloseWeight: 10,
    compressionWeight: 5,
    overheatedThresholdPct: 7,
    volumeBreakdownRatio: 0.6,
    pullbackConsecutiveCount: 2,
  },
  kr_etf: {
    minScore: 50,
    closeMomentumWeight: 20,
    breakoutWeight: 10,
    volumeWeight: 10,
    trendWeight: 15,
    openStrengthWeight: 10,
    higherLowWeight: 10,
    volatilityWeight: 10,
    returnWeight: 10,
    averageCloseWeight: 10,
    compressionWeight: 10,
    overheatedThresholdPct: 5,
    volumeBreakdownRatio: 0.6,
    pullbackConsecutiveCount: 2,
  },
  us_stock: {
    minScore: 65,
    closeMomentumWeight: 25,
    breakoutWeight: 15,
    volumeWeight: 10,
    trendWeight: 20,
    openStrengthWeight: 10,
    higherLowWeight: 5,
    volatilityWeight: 5,
    returnWeight: 10,
    averageCloseWeight: 10,
    compressionWeight: 5,
    overheatedThresholdPct: 7,
    volumeBreakdownRatio: 0.6,
    pullbackConsecutiveCount: 2,
  },
  us_etf: {
    minScore: 55,
    closeMomentumWeight: 20,
    breakoutWeight: 10,
    volumeWeight: 10,
    trendWeight: 20,
    openStrengthWeight: 10,
    higherLowWeight: 10,
    volatilityWeight: 10,
    returnWeight: 10,
    averageCloseWeight: 10,
    compressionWeight: 10,
    overheatedThresholdPct: 5,
    volumeBreakdownRatio: 0.6,
    pullbackConsecutiveCount: 2,
  },
};

const PROFILE_FIELDS: Array<[keyof ScenarioProfileDraft, string]> = [
  ["minScore", "Min Score"],
  ["closeMomentumWeight", "Close"],
  ["breakoutWeight", "Breakout"],
  ["volumeWeight", "Volume"],
  ["trendWeight", "Trend"],
  ["openStrengthWeight", "Open"],
  ["higherLowWeight", "Higher Low"],
  ["volatilityWeight", "Range"],
  ["returnWeight", "Return"],
  ["averageCloseWeight", "Avg Close"],
  ["compressionWeight", "Compression"],
  ["overheatedThresholdPct", "Heat %"],
  ["volumeBreakdownRatio", "Vol Floor"],
  ["pullbackConsecutiveCount", "Pullback"],
];

const CARD_STYLE: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.line}`,
  borderRadius: 16,
  padding: 16,
};

function normalizeProfiles(
  stored: Partial<Record<AssetClass, Partial<ScenarioProfileDraft>>> | null | undefined,
): Record<AssetClass, ScenarioProfileDraft> {
  return {
    kr_stock: { ...DEFAULT_PROFILES.kr_stock, ...(stored?.kr_stock ?? {}) },
    kr_etf: { ...DEFAULT_PROFILES.kr_etf, ...(stored?.kr_etf ?? {}) },
    us_stock: { ...DEFAULT_PROFILES.us_stock, ...(stored?.us_stock ?? {}) },
    us_etf: { ...DEFAULT_PROFILES.us_etf, ...(stored?.us_etf ?? {}) },
  };
}

function normalizeHistoryEntries(
  stored: Array<Partial<ScenarioHistoryEntry>> | null | undefined,
): ScenarioHistoryEntry[] {
  return (stored ?? [])
    .filter((entry): entry is Partial<ScenarioHistoryEntry> & Pick<ScenarioHistoryEntry, "id" | "createdAt" | "selected" | "result"> => (
      Boolean(entry?.id && entry?.createdAt && entry?.selected && entry?.result)
    ))
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      selected: entry.selected,
      result: entry.result,
      profiles: normalizeProfiles(entry.profiles),
      presetId: entry.presetId,
      presetName: entry.presetName,
    }));
}

function normalizePresetEntries(
  stored: Array<Partial<ScenarioProfilePreset>> | null | undefined,
): ScenarioProfilePreset[] {
  return (stored ?? [])
    .filter((entry): entry is Partial<ScenarioProfilePreset> & Pick<ScenarioProfilePreset, "id" | "name" | "createdAt"> => (
      Boolean(entry?.id && entry?.name && entry?.createdAt)
    ))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      profiles: normalizeProfiles(entry.profiles),
    }));
}

function findPreviousAssetResult(
  history: ScenarioHistoryEntry[],
  entryIndex: number,
  assetClass: AssetClass,
): ScenarioAssetResult | null {
  for (let index = entryIndex + 1; index < history.length; index += 1) {
    const found = history[index].result.assets.find((asset) => asset.assetClass === assetClass);
    if (found) return found;
  }
  return null;
}

function formatScoreDelta(currentScore: number | null | undefined, previousScore: number | null | undefined): string {
  if (currentScore == null || previousScore == null) return "new";
  const delta = currentScore - previousScore;
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function getStatusChangeLabel(currentAllowed: boolean, previousAllowed: boolean | undefined): string | null {
  if (previousAllowed == null || currentAllowed === previousAllowed) return null;
  return currentAllowed ? "BLOCK -> ALLOW" : "ALLOW -> BLOCK";
}

function getCandidateChangeLabel(currentSymbol: string | undefined, previousSymbol: string | undefined): string | null {
  if (!currentSymbol || !previousSymbol || currentSymbol === previousSymbol) return null;
  return `${previousSymbol} -> ${currentSymbol}`;
}

function summarizeProfile(profile: ScenarioProfileDraft): string {
  return [
    `min ${profile.minScore}`,
    `heat ${profile.overheatedThresholdPct}%`,
    `vol ${profile.volumeBreakdownRatio}`,
    `pullback ${profile.pullbackConsecutiveCount}`,
  ].join(" / ");
}

function getPresetDiffSummary(
  currentProfiles: Record<AssetClass, ScenarioProfileDraft>,
  presetProfiles: Record<AssetClass, ScenarioProfileDraft>,
): string[] {
  const diffs: string[] = [];
  for (const assetClass of ALL_ASSETS) {
    for (const [key, label] of PROFILE_FIELDS) {
      const currentValue = currentProfiles[assetClass][key];
      const presetValue = presetProfiles[assetClass][key];
      if (currentValue !== presetValue) {
        diffs.push(`${assetClass} ${label}: ${currentValue} -> ${presetValue}`);
      }
    }
  }
  return diffs;
}

function buildPresetStats(historyEntries: ScenarioHistoryEntry[], presetId: string | null) {
  const filtered = historyEntries.filter((entry) => (presetId ? entry.presetId === presetId : !entry.presetId));
  const assets = filtered.flatMap((entry) => entry.result.assets);
  const allowCount = assets.filter((asset) => asset.policyAllowed).length;
  const scoredAssets = assets.filter((asset) => typeof asset.candidate?.score === "number");
  const averageScore = scoredAssets.length > 0
    ? Math.round(scoredAssets.reduce((sum, asset) => sum + (asset.candidate?.score ?? 0), 0) / scoredAssets.length)
    : 0;
  const candidateCounts = new Map<string, number>();
  for (const asset of assets) {
    const symbol = asset.candidate?.symbol;
    if (!symbol) continue;
    candidateCounts.set(symbol, (candidateCounts.get(symbol) ?? 0) + 1);
  }
  const topCandidate = [...candidateCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "none";

  return {
    runCount: filtered.length,
    allowRate: assets.length > 0 ? Math.round((allowCount / assets.length) * 100) : 0,
    averageScore,
    topCandidate,
  };
}

function buildPresetScoreTrend(historyEntries: ScenarioHistoryEntry[], presetId: string | null): number[] {
  return historyEntries
    .filter((entry) => (presetId ? entry.presetId === presetId : !entry.presetId))
    .map((entry) => {
      const scoredAssets = entry.result.assets.filter((asset) => typeof asset.candidate?.score === "number");
      if (scoredAssets.length === 0) return null;
      return Math.round(
        scoredAssets.reduce((sum, asset) => sum + (asset.candidate?.score ?? 0), 0) / scoredAssets.length,
      );
    })
    .filter((score): score is number => score !== null)
    .slice(0, 8);
}

function buildAssetStatsForPreset(historyEntries: ScenarioHistoryEntry[], presetId: string | null) {
  const filtered = historyEntries.filter((entry) => (presetId ? entry.presetId === presetId : !entry.presetId));
  return ALL_ASSETS.map((assetClass) => {
    const assets = filtered
      .flatMap((entry) => entry.result.assets)
      .filter((asset) => asset.assetClass === assetClass);
    const allowCount = assets.filter((asset) => asset.policyAllowed).length;
    const scoredAssets = assets.filter((asset) => typeof asset.candidate?.score === "number");
    const averageScore = scoredAssets.length > 0
      ? Math.round(scoredAssets.reduce((sum, asset) => sum + (asset.candidate?.score ?? 0), 0) / scoredAssets.length)
      : 0;
    const candidateCounts = new Map<string, number>();
    for (const asset of assets) {
      const symbol = asset.candidate?.symbol;
      if (!symbol) continue;
      candidateCounts.set(symbol, (candidateCounts.get(symbol) ?? 0) + 1);
    }
    const topCandidate = [...candidateCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "none";

    return {
      assetClass,
      runCount: assets.length,
      allowRate: assets.length > 0 ? Math.round((allowCount / assets.length) * 100) : 0,
      averageScore,
      topCandidate,
    };
  });
}

function buildCandidateStats(
  historyEntries: ScenarioHistoryEntry[],
  assetClass: AssetClass | "all",
): Array<{ symbol: string; runCount: number; allowRate: number; averageScore: number }> {
  const bucket = new Map<string, { runCount: number; allowCount: number; scoreSum: number; scoredCount: number }>();
  for (const entry of historyEntries) {
    for (const asset of entry.result.assets) {
      if (assetClass !== "all" && asset.assetClass !== assetClass) continue;
      const symbol = asset.candidate?.symbol;
      if (!symbol) continue;
      const current = bucket.get(symbol) ?? { runCount: 0, allowCount: 0, scoreSum: 0, scoredCount: 0 };
      current.runCount += 1;
      if (asset.policyAllowed) current.allowCount += 1;
      if (typeof asset.candidate?.score === "number") {
        current.scoreSum += asset.candidate.score;
        current.scoredCount += 1;
      }
      bucket.set(symbol, current);
    }
  }

  return [...bucket.entries()]
    .map(([symbol, value]) => ({
      symbol,
      runCount: value.runCount,
      allowRate: value.runCount > 0 ? Math.round((value.allowCount / value.runCount) * 100) : 0,
      averageScore: value.scoredCount > 0 ? Math.round(value.scoreSum / value.scoredCount) : 0,
    }))
    .sort((left, right) => right.runCount - left.runCount || right.averageScore - left.averageScore || left.symbol.localeCompare(right.symbol));
}

function buildCandidateTrend(
  historyEntries: ScenarioHistoryEntry[],
  assetClass: AssetClass | "all",
  symbol: string,
): Array<{ createdAt: string; assetClass: AssetClass; score: number; allowed: boolean }> {
  return historyEntries
    .flatMap((entry) => entry.result.assets.map((asset) => ({
      createdAt: entry.createdAt,
      assetClass: asset.assetClass,
      score: asset.candidate?.symbol === symbol ? (asset.candidate?.score ?? 0) : null,
      allowed: asset.policyAllowed,
      symbol: asset.candidate?.symbol,
    })))
    .filter((item): item is { createdAt: string; assetClass: AssetClass; score: number; allowed: boolean; symbol: string | undefined } => (
      item.score !== null && (assetClass === "all" || item.assetClass === assetClass)
    ))
    .slice(0, 8)
    .map((item) => ({
      createdAt: item.createdAt,
      assetClass: item.assetClass,
      score: item.score,
      allowed: item.allowed,
    }));
}

function buildSparkline(scores: number[]): string {
  if (scores.length === 0) return "";
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (min === max) {
    return scores.map(() => blocks[4]).join("");
  }
  return scores.map((score) => {
    const ratio = (score - min) / (max - min);
    const index = Math.min(blocks.length - 1, Math.max(0, Math.round(ratio * (blocks.length - 1))));
    return blocks[index];
  }).join("");
}

function findMatchingPreset(
  presetEntries: ScenarioProfilePreset[],
  currentProfiles: Record<AssetClass, ScenarioProfileDraft>,
): ScenarioProfilePreset | null {
  for (const preset of presetEntries) {
    if (getPresetDiffSummary(currentProfiles, preset.profiles).length === 0) {
      return preset;
    }
  }
  return null;
}

export function EngineV2ScenarioPage() {
  const [selected, setSelected] = useState<AssetClass[]>(["kr_stock", "kr_etf"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScenarioResponse["result"] | null>(null);
  const [runtime, setRuntime] = useState<ScenarioResponse["runtime"] | null>(null);
  const [history, setHistory] = useState<ScenarioHistoryEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<AssetClass, ScenarioProfileDraft>>(DEFAULT_PROFILES);
  const [presets, setPresets] = useState<ScenarioProfilePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [presetSortKey, setPresetSortKey] = useState<PresetSortKey>("allowRate");
  const [assetFocus, setAssetFocus] = useState<AssetClass | "all">("all");
  const [candidateFocus, setCandidateFocus] = useState<string | "all">("all");

  const pushHistory = useCallback((
    nextSelected: AssetClass[],
    result: ScenarioResponse["result"],
    nextProfiles: Record<AssetClass, ScenarioProfileDraft>,
    presetMeta?: { id: string; name: string } | null,
  ) => {
    const nextEntry: ScenarioHistoryEntry = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      selected: nextSelected,
      result,
      profiles: nextProfiles,
      presetId: presetMeta?.id,
      presetName: presetMeta?.name,
    };
    setHistory((current) => {
      const nextHistory = [nextEntry, ...current].slice(0, HISTORY_LIMIT);
      saveToStorage(HISTORY_KEY, nextHistory);
      return nextHistory;
    });
  }, []);

  async function loadScenario(
    nextSelected: AssetClass[],
    nextProfiles: Record<AssetClass, ScenarioProfileDraft> = profiles,
    presetMeta?: { id: string; name: string } | null,
  ) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/engine-v2/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClasses: nextSelected.join(","),
          profileOverrides: nextProfiles,
        }),
      });
      const json = await res.json() as ScenarioResponse;
      if (!res.ok || !json.ok) {
        setRuntime(json.runtime ?? null);
        throw new Error(json.error || "engine-v2 scenario fetch failed");
      }
      setRuntime(json.runtime ?? null);
      setData(json.result);
      const matchedPreset = presetMeta
        ?? presets.find((preset) => preset.id === activePresetId)
        ?? findMatchingPreset(presets, nextProfiles);
      pushHistory(
        nextSelected,
        json.result,
        nextProfiles,
        matchedPreset ? { id: matchedPreset.id, name: matchedPreset.name } : null,
      );
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "engine-v2 scenario fetch failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedHistory = normalizeHistoryEntries(
      loadFromStorage<Array<Partial<ScenarioHistoryEntry>>>(HISTORY_KEY, []),
    );
    const storedPresets = normalizePresetEntries(
      loadFromStorage<Array<Partial<ScenarioProfilePreset>>>(PRESET_KEY, []),
    );
    const storedProfiles = normalizeProfiles(
      loadFromStorage<Partial<Record<AssetClass, Partial<ScenarioProfileDraft>>>>(PROFILE_KEY, DEFAULT_PROFILES),
    );
    const matchedPreset = findMatchingPreset(storedPresets, storedProfiles);
    const initialSelected = ALL_ASSETS;

    setHistory(storedHistory);
    setPresets(storedPresets);
    setProfiles(storedProfiles);
    setActivePresetId(matchedPreset?.id ?? null);

    async function initializeScenario() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/engine-v2/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetClasses: initialSelected.join(","),
            profileOverrides: storedProfiles,
          }),
        });
        const json = await res.json() as ScenarioResponse;
      if (!res.ok || !json.ok) {
        setRuntime(json.runtime ?? null);
        throw new Error(json.error || "engine-v2 scenario fetch failed");
      }
      setRuntime(json.runtime ?? null);
      setData(json.result);
        pushHistory(
          initialSelected,
          json.result,
          storedProfiles,
          matchedPreset ? { id: matchedPreset.id, name: matchedPreset.name } : null,
        );
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "engine-v2 scenario fetch failed");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    void initializeScenario();
  }, [pushHistory]);

  function toggleAsset(assetClass: AssetClass) {
    const next = selected.includes(assetClass)
      ? selected.filter((item) => item !== assetClass)
      : [...selected, assetClass];
    const normalized: AssetClass[] = next.length > 0 ? next : ["kr_stock"];
    setSelected(normalized);
  }

  function updateProfile(assetClass: AssetClass, key: keyof ScenarioProfileDraft, value: number) {
    const nextProfiles = {
      ...profiles,
      [assetClass]: {
        ...profiles[assetClass],
        [key]: value,
      },
    };
    setProfiles(nextProfiles);
    saveToStorage(PROFILE_KEY, nextProfiles);
    setActivePresetId(null);
  }

  function resetProfile(assetClass: AssetClass) {
    const nextProfiles = {
      ...profiles,
      [assetClass]: DEFAULT_PROFILES[assetClass],
    };
    setProfiles(nextProfiles);
    saveToStorage(PROFILE_KEY, nextProfiles);
    setActivePresetId(null);
  }

  function savePreset() {
    const trimmed = presetName.trim();
    if (!trimmed) {
      setError("preset name is required");
      return;
    }
    const nextPreset: ScenarioProfilePreset = {
      id: `${Date.now()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      profiles,
    };
    const nextPresets = [nextPreset, ...presets.filter((item) => item.name !== trimmed)].slice(0, HISTORY_LIMIT);
    setPresets(nextPresets);
    saveToStorage(PRESET_KEY, nextPresets);
    setActivePresetId(nextPreset.id);
    setPresetName("");
    setError(null);
  }

  function applyPreset(preset: ScenarioProfilePreset) {
    const nextProfiles = normalizeProfiles(preset.profiles);
    setProfiles(nextProfiles);
    saveToStorage(PROFILE_KEY, nextProfiles);
    setActivePresetId(preset.id);
    setError(null);
    void loadScenario(selected, nextProfiles, { id: preset.id, name: preset.name });
  }

  function deletePreset(presetId: string) {
    const nextPresets = presets.filter((preset) => preset.id !== presetId);
    setPresets(nextPresets);
    saveToStorage(PRESET_KEY, nextPresets);
    setActivePresetId((current) => (current === presetId ? null : current));
    setHistoryFilter((current) => (current === presetId ? "all" : current));
  }

  const presetFilteredHistory = history.filter((entry) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "custom") return !entry.presetId;
    return entry.presetId === historyFilter;
  });
  const filteredHistory = presetFilteredHistory.filter((entry) => entry.result.assets.some((asset) => {
    if (assetFocus !== "all" && asset.assetClass !== assetFocus) return false;
    if (candidateFocus !== "all" && asset.candidate?.symbol !== candidateFocus) return false;
    return true;
  }));

  const presetCards = ([
    { id: null, label: "Custom" },
    ...presets.map((preset) => ({ id: preset.id, label: preset.name })),
  ] as Array<{ id: string | null; label: string }>).map((item) => ({
    ...item,
    stats: buildPresetStats(history, item.id),
  })).sort((left, right) => {
    const primary = right.stats[presetSortKey] - left.stats[presetSortKey];
    if (primary !== 0) return primary;
    return left.label.localeCompare(right.label);
  });
  const selectedPresetLabel = historyFilter === "all"
    ? "All"
    : historyFilter === "custom"
      ? "Custom"
      : presets.find((preset) => preset.id === historyFilter)?.name ?? "Preset";
  const selectedPresetAssetStats = historyFilter === "all"
    ? ALL_ASSETS.map((assetClass) => {
      const assets = history.flatMap((entry) => entry.result.assets).filter((asset) => asset.assetClass === assetClass);
      const allowCount = assets.filter((asset) => asset.policyAllowed).length;
      const scoredAssets = assets.filter((asset) => typeof asset.candidate?.score === "number");
      const averageScore = scoredAssets.length > 0
        ? Math.round(scoredAssets.reduce((sum, asset) => sum + (asset.candidate?.score ?? 0), 0) / scoredAssets.length)
        : 0;
      const candidateCounts = new Map<string, number>();
      for (const asset of assets) {
        const symbol = asset.candidate?.symbol;
        if (!symbol) continue;
        candidateCounts.set(symbol, (candidateCounts.get(symbol) ?? 0) + 1);
      }
      const topCandidate = [...candidateCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "none";
      return {
        assetClass,
        runCount: assets.length,
        allowRate: assets.length > 0 ? Math.round((allowCount / assets.length) * 100) : 0,
        averageScore,
        topCandidate,
      };
    })
    : buildAssetStatsForPreset(history, historyFilter === "custom" ? null : historyFilter);
  const candidateOptions = (() => {
    const counts = new Map<string, number>();
    for (const entry of presetFilteredHistory) {
      for (const asset of entry.result.assets) {
        if (assetFocus !== "all" && asset.assetClass !== assetFocus) continue;
        const symbol = asset.candidate?.symbol;
        if (!symbol) continue;
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([symbol, count]) => ({ symbol, count }));
  })();
  const candidateStats = buildCandidateStats(presetFilteredHistory, assetFocus).slice(0, 8);
  const candidateTrend = candidateFocus === "all"
    ? []
    : buildCandidateTrend(filteredHistory, assetFocus, candidateFocus);
  const candidateSparkline = buildSparkline(candidateTrend.map((item) => item.score));

  function exportCurrentView() {
    const payload = {
      exportedAt: new Date().toISOString(),
      filters: {
        preset: historyFilter,
        assetFocus,
        candidateFocus,
        presetSortKey,
      },
      summary: {
        totalRuns: filteredHistory.length,
        selectedPresetLabel,
      },
      runs: filteredHistory.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        presetName: entry.presetName ?? "custom",
        selected: entry.selected,
        assets: entry.result.assets
          .filter((asset) => (assetFocus === "all" || asset.assetClass === assetFocus))
          .filter((asset) => (candidateFocus === "all" || asset.candidate?.symbol === candidateFocus))
          .map((asset) => ({
            assetClass: asset.assetClass,
            policyAllowed: asset.policyAllowed,
            policyReasons: asset.policyReasons,
            candidate: asset.candidate
              ? {
                symbol: asset.candidate.symbol,
                name: asset.candidate.name,
                score: asset.candidate.score,
                reasons: asset.candidate.reasons,
              }
              : null,
          })),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `engine-v2-${selectedPresetLabel.toLowerCase().replace(/\s+/g, "-")}-${assetFocus}-${candidateFocus}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportCurrentViewCsv() {
    const rows = filteredHistory.flatMap((entry) =>
      entry.result.assets
        .filter((asset) => (assetFocus === "all" || asset.assetClass === assetFocus))
        .filter((asset) => (candidateFocus === "all" || asset.candidate?.symbol === candidateFocus))
        .map((asset) => ({
          runId: entry.id,
          createdAt: entry.createdAt,
          presetName: entry.presetName ?? "custom",
          selected: entry.selected.join("|"),
          assetClass: asset.assetClass,
          policyAllowed: asset.policyAllowed ? "allow" : "block",
          policyReasons: asset.policyReasons.join(" | "),
          candidateSymbol: asset.candidate?.symbol ?? "",
          candidateName: asset.candidate?.name ?? "",
          candidateScore: asset.candidate?.score ?? "",
          candidateReasons: asset.candidate?.reasons.join(" | ") ?? "",
        })),
    );

    const headers = [
      "runId",
      "createdAt",
      "presetName",
      "selected",
      "assetClass",
      "policyAllowed",
      "policyReasons",
      "candidateSymbol",
      "candidateName",
      "candidateScore",
      "candidateReasons",
    ];
    const escapeCell = (value: string | number) => `"${String(value).replaceAll("\"", "\"\"")}"`;
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCell(row[header as keyof typeof row] ?? "")).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `engine-v2-${selectedPresetLabel.toLowerCase().replace(/\s+/g, "-")}-${assetFocus}-${candidateFocus}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportCurrentViewMarkdown() {
    const lines: string[] = [
      "# Engine V2 Scenario Report",
      "",
      `- Exported At: ${new Date().toISOString()}`,
      `- Preset Filter: ${selectedPresetLabel}`,
      `- Asset Focus: ${assetFocus}`,
      `- Candidate Focus: ${candidateFocus}`,
      `- Preset Sort: ${presetSortKey}`,
      `- Filtered Runs: ${filteredHistory.length}`,
      "",
      "## Asset Breakdown",
      "",
      "| Asset | Runs | Allow Rate | Avg Score | Top Candidate |",
      "| --- | ---: | ---: | ---: | --- |",
      ...selectedPresetAssetStats.map((asset) => (
        `| ${asset.assetClass} | ${asset.runCount} | ${asset.allowRate}% | ${asset.averageScore} | ${asset.topCandidate} |`
      )),
      "",
    ];

    if (candidateFocus !== "all" && candidateTrend.length > 0) {
      lines.push("## Candidate Trend", "");
      lines.push(`- Candidate: ${candidateFocus}`);
      lines.push(`- Sparkline: ${candidateSparkline}`);
      lines.push("");
      lines.push("| Time | Asset | Score | Status |");
      lines.push("| --- | --- | ---: | --- |");
      for (const item of candidateTrend) {
        lines.push(`| ${item.createdAt} | ${item.assetClass} | ${item.score} | ${item.allowed ? "ALLOW" : "BLOCK"} |`);
      }
      lines.push("");
    }

    lines.push("## Runs", "");
    for (const entry of filteredHistory) {
      lines.push(`### ${entry.createdAt} · ${entry.presetName ?? "custom"}`);
      lines.push(`- Selected: ${entry.selected.join(", ")}`);
      for (const asset of entry.result.assets
        .filter((item) => (assetFocus === "all" || item.assetClass === assetFocus))
        .filter((item) => (candidateFocus === "all" || item.candidate?.symbol === candidateFocus))) {
        const candidateText = asset.candidate
          ? `${asset.candidate.symbol} / score ${asset.candidate.score}`
          : "none";
        const reasons = asset.policyReasons.length > 0 ? asset.policyReasons.join(", ") : "none";
        lines.push(`- ${asset.assetClass}: ${candidateText} / ${asset.policyAllowed ? "ALLOW" : "BLOCK"} / reasons: ${reasons}`);
      }
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `engine-v2-${selectedPresetLabel.toLowerCase().replace(/\s+/g, "-")}-${assetFocus}-${candidateFocus}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "20px 16px 120px", maxWidth: 1120 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.ink }}>Engine V2 Scenario Lab</div>
        <div style={{ marginTop: 6, fontSize: 14, color: COLORS.dim }}>
          운영 엔진과 분리된 로컬 검증 화면입니다. 후보 선택, policy 판정, preview order만 확인합니다.
        </div>
      </div>

      {runtime ? (
        <div style={{
          ...CARD_STYLE,
          marginBottom: 16,
          borderColor: runtime.phase === "blocked_prod" ? COLORS.riseB : runtime.readyForPaperVerification ? "#9FC7A2" : COLORS.line,
          background: runtime.phase === "blocked_prod" ? COLORS.riseL : runtime.readyForPaperVerification ? "#F4FBF4" : COLORS.card,
        }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.ink }}>{runtime.headline}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: COLORS.dim }}>{runtime.detail}</div>
            </div>
            <div style={{ fontSize: 12, color: COLORS.mid }}>
              {runtime.environment.toUpperCase()} / dryRun {String(runtime.dryRun)} / {runtime.allowed ? "allowed" : "blocked"}
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {runtime.checks.map((check) => (
              <div key={check.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                <div style={{ color: COLORS.ink, fontWeight: 700 }}>{check.label}</div>
                <div style={{ flex: 1, color: COLORS.dim }}>{check.detail}</div>
                <div style={{
                  color: check.status === "fail" ? COLORS.rise : check.status === "warn" ? "#9A6700" : "#0F7B0F",
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
                >
                  {check.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ ...CARD_STYLE, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>Asset Classes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ALL_ASSETS.map((assetClass) => {
            const active = selected.includes(assetClass);
            return (
              <button
                key={assetClass}
                type="button"
                onClick={() => toggleAsset(assetClass)}
                style={{
                  borderRadius: 999,
                  border: `1px solid ${active ? COLORS.hero : COLORS.lineD}`,
                  background: active ? COLORS.hero : COLORS.bg,
                  color: active ? "#fff" : COLORS.ink,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {assetClass}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: COLORS.dim }}>
          active preset {presets.find((preset) => preset.id === activePresetId)?.name ?? "custom"}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => void loadScenario(selected)}
              style={{
                borderRadius: 10,
                border: `1px solid ${COLORS.hero}`,
                background: COLORS.hero,
                color: "#fff",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {loading ? "Loading..." : "Run Scenario"}
            </button>
            <button
              type="button"
              onClick={exportCurrentView}
              style={{
                borderRadius: 10,
                border: `1px solid ${COLORS.lineD}`,
                background: COLORS.card,
                color: COLORS.ink,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={exportCurrentViewCsv}
              style={{
                borderRadius: 10,
                border: `1px solid ${COLORS.lineD}`,
                background: COLORS.card,
                color: COLORS.ink,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportCurrentViewMarkdown}
              style={{
                borderRadius: 10,
                border: `1px solid ${COLORS.lineD}`,
                background: COLORS.card,
                color: COLORS.ink,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Export MD
            </button>
          </div>
        </div>
      </div>

      <div style={{ ...CARD_STYLE, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>Scenario Profiles</div>
        <div style={{ marginBottom: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Preset name"
              style={{
                minWidth: 220,
                border: `1px solid ${COLORS.lineD}`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                color: COLORS.ink,
                background: COLORS.bg,
              }}
            />
            <button
              type="button"
              onClick={savePreset}
              style={{
                borderRadius: 10,
                border: `1px solid ${COLORS.hero}`,
                background: COLORS.hero,
                color: "#fff",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save Preset
            </button>
          </div>
          {presets.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {presets.map((preset) => (
                (() => {
                  const diffSummary = getPresetDiffSummary(profiles, preset.profiles);
                  return (
                    <div
                      key={preset.id}
                      style={{
                        display: "grid",
                        gap: 8,
                        border: `1px solid ${COLORS.line}`,
                        borderRadius: 12,
                        padding: 10,
                        background: COLORS.bg,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink }}>{preset.name}</div>
                          <div style={{ fontSize: 11, color: COLORS.dim }}>{preset.createdAt}</div>
                          <div style={{ fontSize: 11, color: COLORS.dim }}>
                            {ALL_ASSETS.map((assetClass) => `${assetClass}: ${summarizeProfile(preset.profiles[assetClass])}`).join(" · ")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => applyPreset(preset)}
                            style={{
                              borderRadius: 10,
                              border: `1px solid ${COLORS.lineD}`,
                              background: COLORS.card,
                              color: COLORS.ink,
                              padding: "8px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePreset(preset.id)}
                            style={{
                              borderRadius: 10,
                              border: `1px solid ${COLORS.fallL}`,
                              background: COLORS.bg,
                              color: COLORS.fall,
                              padding: "8px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.mid }}>
                        {diffSummary.length > 0 ? `diff ${diffSummary.slice(0, 6).join(" · ")}` : "diff none"}
                        {diffSummary.length > 6 ? ` · +${diffSummary.length - 6} more` : ""}
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {selected.map((assetClass) => (
            <div key={assetClass} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 12, background: COLORS.bg }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink }}>{assetClass}</div>
                <button
                  type="button"
                  onClick={() => resetProfile(assetClass)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${COLORS.lineD}`,
                    background: COLORS.bg,
                    color: COLORS.dim,
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                {PROFILE_FIELDS.map(([key, label]) => (
                  <label key={key} style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim }}>{label}</span>
                    <input
                      type="number"
                      value={profiles[assetClass][key]}
                      onChange={(event) => updateProfile(assetClass, key, Number(event.target.value) || 0)}
                      style={{
                        border: `1px solid ${COLORS.lineD}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: COLORS.ink,
                        background: COLORS.bg,
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div style={{ ...CARD_STYLE, borderColor: COLORS.riseB, color: COLORS.rise }}>
          {error}
        </div>
      ) : null}

      {data ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={CARD_STYLE}>
            <div style={{ fontSize: 13, color: COLORS.dim }}>
              env `{data.environment}` / dryRun `{String(data.dryRun)}`
            </div>
          </div>

          {data.assets.map((asset) => (
            <div key={asset.assetClass} style={CARD_STYLE}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.ink }}>{asset.assetClass}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: COLORS.dim }}>
                    policy {asset.policyAllowed ? "allowed" : "blocked"}
                  </div>
                </div>
                <div
                  style={{
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    background: asset.policyAllowed ? COLORS.riseL : COLORS.fallL,
                    color: asset.policyAllowed ? COLORS.rise : COLORS.fall,
                  }}
                >
                  {asset.policyAllowed ? "ALLOW" : "BLOCK"}
                </div>
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>Candidate</div>
                  <div style={{ marginTop: 4, fontSize: 14, color: COLORS.ink }}>
                    {asset.candidate
                      ? `${asset.candidate.symbol} · ${asset.candidate.name} · ${asset.candidate.price} · score ${asset.candidate.score}`
                      : "none"}
                  </div>
                  {asset.candidate?.reasons.length ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: COLORS.dim }}>
                      {asset.candidate.reasons.join(", ")}
                    </div>
                  ) : null}
                </div>

                {asset.candidate?.breakdown.length ? (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>Score Breakdown</div>
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {asset.candidate.breakdown.map((item) => (
                        <div
                          key={`${asset.assetClass}-${item.key}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "96px 1fr auto",
                            gap: 8,
                            alignItems: "center",
                            fontSize: 12,
                            color: COLORS.ink,
                          }}
                        >
                          <div style={{ fontWeight: 700, color: item.matched ? COLORS.rise : COLORS.dim }}>
                            {item.matched ? "MATCH" : "MISS"}
                          </div>
                          <div>
                            <div>{item.label}</div>
                            {item.detail ? (
                              <div style={{ marginTop: 2, color: COLORS.dim }}>{item.detail}</div>
                            ) : null}
                          </div>
                          <div style={{ fontWeight: 800, color: item.matched ? COLORS.rise : COLORS.dim }}>
                            +{item.weight}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>Policy Reasons</div>
                  <div style={{ marginTop: 4, fontSize: 14, color: COLORS.ink }}>
                    {asset.policyReasons.length > 0 ? asset.policyReasons.join(", ") : "none"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>Preview Order</div>
                  <div style={{ marginTop: 4, fontSize: 14, color: COLORS.ink }}>
                    {asset.orderPreview
                      ? `${asset.orderPreview.side} ${asset.orderPreview.symbol} ${asset.orderPreview.quantity} @ ${asset.orderPreview.limitPrice ?? "market"} ${asset.orderPreview.currency}`
                      : "none"}
                  </div>
                  {asset.orderPreview?.warnings.length ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: COLORS.dim }}>
                      warnings: {asset.orderPreview.warnings.join(", ")}
                    </div>
                  ) : null}
                </div>

                {asset.candidate?.candles.length ? (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>Recent Candles</div>
                    <div style={{ marginTop: 8, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: COLORS.dim, textAlign: "left" }}>
                            <th style={{ padding: "6px 8px" }}>At</th>
                            <th style={{ padding: "6px 8px" }}>O</th>
                            <th style={{ padding: "6px 8px" }}>H</th>
                            <th style={{ padding: "6px 8px" }}>L</th>
                            <th style={{ padding: "6px 8px" }}>C</th>
                            <th style={{ padding: "6px 8px" }}>Vol</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asset.candidate.candles.map((candle) => (
                            <tr key={`${asset.assetClass}-${candle.at}`} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                              <td style={{ padding: "6px 8px", color: COLORS.dim }}>{candle.at}</td>
                              <td style={{ padding: "6px 8px", color: COLORS.ink }}>{candle.open}</td>
                              <td style={{ padding: "6px 8px", color: COLORS.ink }}>{candle.high}</td>
                              <td style={{ padding: "6px 8px", color: COLORS.ink }}>{candle.low}</td>
                              <td style={{ padding: "6px 8px", color: COLORS.ink }}>{candle.close}</td>
                              <td style={{ padding: "6px 8px", color: COLORS.ink }}>{candle.volume}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          <div style={CARD_STYLE}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>Recent Runs</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {([
                { id: "allowRate", label: "Allow Rate" },
                { id: "averageScore", label: "Avg Score" },
                { id: "runCount", label: "Runs" },
              ] as Array<{ id: PresetSortKey; label: string }>).map((option) => {
                const active = presetSortKey === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPresetSortKey(option.id)}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${active ? COLORS.hero : COLORS.lineD}`,
                      background: active ? COLORS.hero : COLORS.bg,
                      color: active ? "#fff" : COLORS.ink,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    sort {option.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
              {presetCards.map((item) => {
                const stats = item.stats;
                const cardFilterId: HistoryFilter = item.id ?? "custom";
                const active = historyFilter === cardFilterId;
                const trend = buildPresetScoreTrend(history, item.id);
                return (
                  <button
                    key={item.id ?? "custom"}
                    type="button"
                    onClick={() => {
                      setHistoryFilter(cardFilterId);
                      setAssetFocus("all");
                      setCandidateFocus("all");
                    }}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 12,
                      padding: 10,
                      background: active ? COLORS.hero : COLORS.bg,
                      color: active ? "#fff" : COLORS.ink,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: active ? "#fff" : COLORS.ink }}>{item.label}</div>
                    {trend.length > 0 ? (
                      <div style={{ marginTop: 6, fontSize: 16, letterSpacing: 1, color: active ? "#fff" : COLORS.ink }}>
                        {buildSparkline(trend)}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6, fontSize: 11, color: active ? "rgba(255,255,255,0.82)" : COLORS.dim }}>runs {stats.runCount}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: active ? "rgba(255,255,255,0.82)" : COLORS.dim }}>allow {stats.allowRate}%</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: active ? "rgba(255,255,255,0.82)" : COLORS.dim }}>avg score {stats.averageScore}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: active ? "rgba(255,255,255,0.82)" : COLORS.dim }}>top candidate {stats.topCandidate}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 12, background: COLORS.bg, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink, marginBottom: 10 }}>
                {selectedPresetLabel} Asset Breakdown
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {selectedPresetAssetStats.map((asset) => (
                  <button
                    key={`detail-${asset.assetClass}`}
                    type="button"
                    onClick={() => {
                      setAssetFocus((current) => {
                        const nextFocus = current === asset.assetClass ? "all" : asset.assetClass;
                        setCandidateFocus("all");
                        return nextFocus;
                      });
                    }}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${assetFocus === asset.assetClass ? COLORS.hero : COLORS.line}`,
                      borderRadius: 10,
                      padding: 10,
                      background: assetFocus === asset.assetClass ? COLORS.hero : COLORS.card,
                      color: assetFocus === asset.assetClass ? "#fff" : COLORS.ink,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: assetFocus === asset.assetClass ? "#fff" : COLORS.ink }}>{asset.assetClass}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: assetFocus === asset.assetClass ? "rgba(255,255,255,0.82)" : COLORS.dim }}>runs {asset.runCount}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: assetFocus === asset.assetClass ? "rgba(255,255,255,0.82)" : COLORS.dim }}>allow {asset.allowRate}%</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: assetFocus === asset.assetClass ? "rgba(255,255,255,0.82)" : COLORS.dim }}>avg score {asset.averageScore}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: assetFocus === asset.assetClass ? "rgba(255,255,255,0.82)" : COLORS.dim }}>top candidate {asset.topCandidate}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: COLORS.dim }}>
                asset focus {assetFocus === "all" ? "all" : assetFocus} / candidate focus {candidateFocus}
              </div>
              {candidateStats.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                  {candidateStats.map((item) => {
                    const active = candidateFocus === item.symbol;
                    const trend = buildCandidateTrend(presetFilteredHistory, assetFocus, item.symbol).map((entry) => entry.score);
                    return (
                      <button
                        key={`candidate-card-${item.symbol}`}
                        type="button"
                        onClick={() => setCandidateFocus(active ? "all" : item.symbol)}
                        style={{
                          textAlign: "left",
                          borderRadius: 10,
                          border: `1px solid ${active ? COLORS.hero : COLORS.line}`,
                          background: active ? COLORS.hero : COLORS.card,
                          color: active ? "#fff" : COLORS.ink,
                          padding: 10,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: active ? "#fff" : COLORS.ink }}>{item.symbol}</div>
                        {trend.length > 0 ? (
                          <div style={{ marginTop: 6, fontSize: 16, letterSpacing: 1, color: active ? "#fff" : COLORS.ink }}>
                            {buildSparkline(trend)}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 6, fontSize: 11, color: active ? "rgba(255,255,255,0.82)" : COLORS.dim }}>runs {item.runCount}</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: active ? "rgba(255,255,255,0.82)" : COLORS.dim }}>allow {item.allowRate}%</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: active ? "rgba(255,255,255,0.82)" : COLORS.dim }}>avg score {item.averageScore}</div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {candidateTrend.length > 0 ? (
                <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 10, background: COLORS.bg }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.ink, marginBottom: 8 }}>
                    {candidateFocus} Recent Trend
                  </div>
                  <div style={{ marginBottom: 8, fontSize: 18, letterSpacing: 1, color: COLORS.ink }}>
                    {candidateSparkline}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {candidateTrend.map((item) => (
                      <div
                        key={`${item.createdAt}-${item.assetClass}-${item.score}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 8,
                          alignItems: "center",
                          fontSize: 11,
                          color: COLORS.ink,
                        }}
                      >
                        <div style={{ color: COLORS.dim }}>
                          {item.createdAt} · {item.assetClass}
                        </div>
                        <div style={{ fontWeight: 800 }}>score {item.score}</div>
                        <div
                          style={{
                            borderRadius: 999,
                            padding: "3px 8px",
                            fontWeight: 800,
                            background: item.allowed ? COLORS.riseL : COLORS.fallL,
                            color: item.allowed ? COLORS.rise : COLORS.fall,
                          }}
                        >
                          {item.allowed ? "ALLOW" : "BLOCK"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setCandidateFocus("all")}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${candidateFocus === "all" ? COLORS.hero : COLORS.lineD}`,
                    background: candidateFocus === "all" ? COLORS.hero : COLORS.bg,
                    color: candidateFocus === "all" ? "#fff" : COLORS.ink,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  All Candidates
                </button>
                {candidateOptions.map((item) => {
                  const active = candidateFocus === item.symbol;
                  return (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => setCandidateFocus(active ? "all" : item.symbol)}
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${active ? COLORS.hero : COLORS.lineD}`,
                        background: active ? COLORS.hero : COLORS.bg,
                        color: active ? "#fff" : COLORS.ink,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {item.symbol} ({item.count})
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, color: COLORS.dim }}>
              filtered runs {filteredHistory.length}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {([
                { id: "all", label: "All" },
                { id: "custom", label: "Custom" },
                ...presets.map((preset) => ({ id: preset.id, label: preset.name })),
              ] as Array<{ id: HistoryFilter; label: string }>).map((filter) => {
                const active = historyFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setHistoryFilter(filter.id)}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${active ? COLORS.hero : COLORS.lineD}`,
                      background: active ? COLORS.hero : COLORS.bg,
                      color: active ? "#fff" : COLORS.ink,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            {filteredHistory.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.dim }}>no local history</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredHistory.map((entry, entryIndex) => (
                  <div
                    key={entry.id}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${COLORS.line}`,
                      background: COLORS.bg,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 12, color: COLORS.dim }}>
                      {entry.createdAt} · {entry.selected.join(", ")}
                      {entry.presetName ? ` · preset ${entry.presetName}` : " · preset custom"}
                    </div>
                    <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                      {entry.result.assets.filter((asset) => assetFocus === "all" || asset.assetClass === assetFocus).map((asset) => {
                        const previous = findPreviousAssetResult(filteredHistory, entryIndex, asset.assetClass);
                        const scoreDelta = formatScoreDelta(asset.candidate?.score, previous?.candidate?.score);
                        const statusChange = getStatusChangeLabel(asset.policyAllowed, previous?.policyAllowed);
                        const candidateChange = getCandidateChangeLabel(asset.candidate?.symbol, previous?.candidate?.symbol);
                        return (
                          <div key={`${entry.id}-${asset.assetClass}`} style={{ display: "grid", gap: 4 }}>
                            <div style={{ fontSize: 13, color: COLORS.ink }}>
                              {asset.assetClass}: {asset.candidate?.symbol ?? "none"} / score {asset.candidate?.score ?? 0} ({scoreDelta}) / {asset.policyAllowed ? "allow" : "block"}
                              {asset.policyReasons.length > 0 ? ` / ${asset.policyReasons.join(", ")}` : ""}
                            </div>
                            <div style={{ fontSize: 11, color: COLORS.dim }}>
                              profile {summarizeProfile(entry.profiles[asset.assetClass])}
                            </div>
                            {statusChange || candidateChange ? (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {statusChange ? (
                                  <div
                                    style={{
                                      borderRadius: 999,
                                      padding: "4px 8px",
                                      fontSize: 11,
                                      fontWeight: 800,
                                      background: asset.policyAllowed ? COLORS.riseL : COLORS.fallL,
                                      color: asset.policyAllowed ? COLORS.rise : COLORS.fall,
                                    }}
                                  >
                                    {statusChange}
                                  </div>
                                ) : null}
                                {candidateChange ? (
                                  <div
                                    style={{
                                      borderRadius: 999,
                                      padding: "4px 8px",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      background: COLORS.card,
                                      color: COLORS.mid,
                                      border: `1px solid ${COLORS.line}`,
                                    }}
                                  >
                                    candidate {candidateChange}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
