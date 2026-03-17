import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { router as apiRouter } from "./src/routes/api.js";
import { runSignalScan, runMomentumScan } from "./src/services/signal.js";
import { executeMomentumBuy } from "./src/services/trader.js";
import { refreshUniverse } from "./src/services/stock-universe.js";
import { checkPositions } from "./src/services/position-manager.js";
import { log } from "./src/utils/logger.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

// ─── 헬스체크 ───
app.get("/health", (_, res) => res.json({ status: "ok", uptime: process.uptime() }));

// ─── HTTP + WebSocket 서버 ───
const server = createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  log("info", `📱 클라이언트 연결 (총 ${clients.size}명)`);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ─── 크론 1: 장 시작 전 프리필터 (08:50) ───
cron.schedule("50 8 * * 1-5", async () => {
  log("info", "🔍 [크론] 전체 종목 프리필터 시작");
  try {
    await refreshUniverse();
    broadcast("universe_refresh", { status: "done" });
  } catch (err) {
    log("error", `프리필터 실패: ${err.message}`);
  }
});

// ─── 크론 2: 모멘텀 매수 스캔 (09:05) ───
cron.schedule("5 9 * * 1-5", async () => {
  log("info", "🚀 [크론] 모멘텀 매수 스캔 시작");
  try {
    const candidates = await runMomentumScan(broadcast);
    for (const stock of candidates) {
      await executeMomentumBuy(stock);
    }
  } catch (err) {
    log("error", `모멘텀 스캔 실패: ${err.message}`);
  }
});

// ─── 크론 3: 포지션 모니터링 (3분마다) ───
cron.schedule("*/3 9-15 * * 1-5", async () => {
  try {
    await checkPositions(broadcast);
  } catch (err) {
    log("error", `포지션 체크 실패: ${err.message}`);
  }
});

// ─── 크론 4: 기존 시그널 스캔 (5분마다) ───
const schedule = process.env.CRON_SCHEDULE || "*/5 9-15 * * 1-5";
cron.schedule(schedule, async () => {
  log("info", "⏰ [크론] 시그널 스캔 시작");
  try {
    await runSignalScan(broadcast);
  } catch (err) {
    log("error", `시그널 스캔 실패: ${err.message}`);
  }
});

server.listen(PORT, () => {
  log("info", `🚀 AutoTrade 서버 시작 (port: ${PORT})`);
  log("info", `📊 모드: ${process.env.KIS_MODE || "vts"}`);
  log("info", `📱 WebSocket: ws://localhost:${PORT}`);
  log("info", "⏱  크론 스케줄:");
  log("info", "   08:50 - 전체 종목 프리필터");
  log("info", "   09:05 - 모멘텀 매수 스캔");
  log("info", "   */3분 - 포지션 모니터링 (익절/손절)");
  log("info", `   ${schedule} - 시그널 스캔`);
});
