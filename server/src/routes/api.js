/**
 * api.js — REST API 라우터
 */
import { Router } from "express";
import { analyzeStock, runSignalScan, runMomentumScan, getSignalHistory, getWatchlist } from "../services/signal.js";
import { approveManualTrade, executeMomentumBuy, getTradeLog } from "../services/trader.js";
import { getCurrentPrice, getBalance } from "../services/kis-api.js";
import { refreshUniverse, getScanTargets } from "../services/stock-universe.js";
import { getOpenPositions, getClosedPositions, closePosition, getStats } from "../services/position-manager.js";
import { getSettings, updateSettings } from "../db/store.js";
import { log } from "../utils/logger.js";

export const router = Router();

// ─── 감시 종목 / Universe ───
router.get("/watchlist", (req, res) => {
  res.json({ data: getWatchlist() });
});

router.get("/universe", (req, res) => {
  res.json({ data: getScanTargets() });
});

router.post("/universe/refresh", async (req, res) => {
  try {
    const stocks = await refreshUniverse();
    res.json({ data: stocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 개별 종목 분석 ───
router.get("/analyze/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const name = req.query.name || code;
    const result = await analyzeStock(code, name);
    res.json({ data: result });
  } catch (err) {
    log("error", `분석 실패: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── 전체 스캔 실행 ───
router.post("/scan", async (req, res) => {
  try {
    const results = await runSignalScan();
    res.json({ data: results });
  } catch (err) {
    log("error", `스캔 실패: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── 모멘텀 스캔 실행 ───
router.post("/momentum/scan", async (req, res) => {
  try {
    const candidates = await runMomentumScan();
    res.json({ data: candidates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/momentum/buy", async (req, res) => {
  try {
    const { code, name, price, momentum } = req.body;
    const result = await executeMomentumBuy({ code, name, price, momentum });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 시그널 이력 ───
router.get("/signals", (req, res) => {
  res.json({ data: getSignalHistory() });
});

// ─── 수동 매매 승인 ───
router.post("/trade/approve", async (req, res) => {
  try {
    const { code, name, price, action, confidence } = req.body;
    if (!code || !action) {
      return res.status(400).json({ error: "code, action 필수" });
    }
    const result = await approveManualTrade({ code, name, price, action, confidence });
    res.json({ data: result });
  } catch (err) {
    log("error", `수동 매매 실패: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── 매매 이력 ───
router.get("/trades", (req, res) => {
  res.json({ data: getTradeLog() });
});

// ─── 포지션 관리 (모멘텀) ───
router.get("/positions", (req, res) => {
  res.json({ data: getOpenPositions() });
});

router.get("/positions/history", (req, res) => {
  res.json({ data: getClosedPositions() });
});

router.post("/positions/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;
    const result = await closePosition(id, price, "manual");
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 수익 통계 ───
router.get("/stats", (req, res) => {
  res.json({ data: getStats() });
});

// ─── 현재가 조회 ───
router.get("/price/:code", async (req, res) => {
  try {
    const data = await getCurrentPrice(req.params.code);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 잔고 조회 ───
router.get("/balance", async (req, res) => {
  try {
    const data = await getBalance();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 설정 ───
router.get("/settings", (req, res) => {
  res.json({ data: getSettings() });
});

router.put("/settings", (req, res) => {
  const updated = updateSettings(req.body);
  res.json({ data: updated });
});
