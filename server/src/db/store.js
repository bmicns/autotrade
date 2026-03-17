/**
 * store.js
 * JSON 파일 기반 영속 저장소
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name, fallback = []) {
  try {
    const raw = fs.readFileSync(filePath(name), "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Signals ───
const MAX_SIGNALS = 200;

export function getSignals() {
  return read("signals", []);
}

export function addSignal(signal) {
  const list = getSignals();
  list.unshift(signal);
  if (list.length > MAX_SIGNALS) list.length = MAX_SIGNALS;
  write("signals", list);
}

// ─── Trades ───
const MAX_TRADES = 200;

export function getTrades() {
  return read("trades", []);
}

export function addTrade(trade) {
  const list = getTrades();
  list.unshift(trade);
  if (list.length > MAX_TRADES) list.length = MAX_TRADES;
  write("trades", list);
}

// ─── Positions (모멘텀) ───
export function getPositions() {
  return read("positions", []);
}

export function savePositions(positions) {
  write("positions", positions);
}

export function addPosition(pos) {
  const list = getPositions();
  list.push(pos);
  write("positions", list);
}

export function updatePosition(id, updates) {
  const list = getPositions();
  const idx = list.findIndex((p) => p.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates };
    write("positions", list);
  }
  return list[idx] || null;
}

// ─── Universe (스캔 대상 종목) ───
export function getUniverse() {
  return read("universe", { stocks: [], updatedAt: null });
}

export function saveUniverse(stocks) {
  write("universe", { stocks, updatedAt: new Date().toISOString() });
}

// ─── Settings ───
const DEFAULT_SETTINGS = {
  profitTargetPct: 5,
  stopLossPct: 3,
  maxPositions: 5,
  maxTradeAmount: 1000000,
  scanTopN: 50,
};

export function getSettings() {
  return read("settings", DEFAULT_SETTINGS);
}

export function updateSettings(updates) {
  const current = getSettings();
  const merged = { ...current, ...updates };
  write("settings", merged);
  return merged;
}
