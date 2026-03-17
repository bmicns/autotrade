// 개발: Vite proxy → /api, 배포: 환경변수로 서버 URL 지정
const API_URL = import.meta.env.VITE_API_URL || "";
const BASE = `${API_URL}/api`;

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "API 오류");
  return json.data;
}

export const api = {
  // Universe
  getUniverse: () => request("/universe"),
  refreshUniverse: () => request("/universe/refresh", { method: "POST" }),

  // Signals
  getSignals: () => request("/signals"),
  scan: () => request("/scan", { method: "POST" }),
  analyze: (code, name) => request(`/analyze/${code}?name=${encodeURIComponent(name)}`),

  // Trades
  getTrades: () => request("/trades"),
  approve: (data) => request("/trade/approve", { method: "POST", body: JSON.stringify(data) }),

  // Momentum
  momentumScan: () => request("/momentum/scan", { method: "POST" }),
  momentumBuy: (data) => request("/momentum/buy", { method: "POST", body: JSON.stringify(data) }),

  // Positions
  getPositions: () => request("/positions"),
  getPositionHistory: () => request("/positions/history"),
  closePosition: (id, price) => request(`/positions/${id}/close`, { method: "POST", body: JSON.stringify({ price }) }),

  // Balance & Stats
  getBalance: () => request("/balance"),
  getStats: () => request("/stats"),
  getPrice: (code) => request(`/price/${code}`),

  // Settings
  getSettings: () => request("/settings"),
  updateSettings: (data) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),
};
