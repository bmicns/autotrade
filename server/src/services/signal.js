/**
 * signal.js
 * 종합 시그널 엔진
 * 6개 전략(RSI, MACD, 볼린저, 이평선, 거래량, 모멘텀)을 통합해 매매 판단
 */
import { getDailyCandles, getCurrentPrice } from "./kis-api.js";
import { analyzeRSI } from "../strategies/rsi.js";
import { analyzeMACD } from "../strategies/macd.js";
import { analyzeBollinger } from "../strategies/bollinger.js";
import { analyzeMA } from "../strategies/moving-avg.js";
import { analyzeVolume } from "../strategies/volume.js";
import { analyzeMomentum } from "../strategies/momentum.js";
import { executeTrade } from "./trader.js";
import { getScanTargets, getMomentumCandidates } from "./stock-universe.js";
import { addSignal, getSignals } from "../db/store.js";
import { log } from "../utils/logger.js";
import { rateLimit } from "../utils/rate-limiter.js";

export function getSignalHistory() {
  return getSignals();
}

export function getWatchlist() {
  return getScanTargets();
}

// ─── 개별 종목 분석 (6개 전략) ───
export async function analyzeStock(stockCode, stockName) {
  await rateLimit();
  const candles = await getDailyCandles(stockCode, 80);
  await rateLimit();
  const current = await getCurrentPrice(stockCode);
  const closes = candles.map((c) => c.close);

  const rsi = analyzeRSI(closes);
  const macd = analyzeMACD(closes);
  const bollinger = analyzeBollinger(closes);
  const ma = analyzeMA(closes);
  const volume = analyzeVolume(candles);
  const momentum = analyzeMomentum(candles, current.price);

  const strategies = { rsi, macd, bollinger, ma, volume, momentum };

  // ─── 종합 판단 (기존 5개 전략 기준) ───
  const coreSignals = [rsi, macd, bollinger, ma, volume];
  const buyCount = coreSignals.filter((s) => s.signal === "buy").length;
  const sellCount = coreSignals.filter((s) => s.signal === "sell").length;
  const buyStrength = coreSignals.filter((s) => s.signal === "buy").reduce((s, v) => s + v.strength, 0);
  const sellStrength = coreSignals.filter((s) => s.signal === "sell").reduce((s, v) => s + v.strength, 0);

  let action = "hold";
  let autoExecute = false;
  let confidence = 0;

  if (buyCount >= 3) {
    action = "buy";
    autoExecute = true;
    confidence = buyStrength / (buyCount * 2);
  } else if (buyCount === 2) {
    action = "buy";
    autoExecute = false;
    confidence = buyStrength / 4;
  } else if (sellCount >= 3) {
    action = "sell";
    autoExecute = true;
    confidence = sellStrength / (sellCount * 2);
  } else if (sellCount === 2) {
    action = "sell";
    autoExecute = false;
    confidence = sellStrength / 4;
  }

  const result = {
    code: stockCode,
    name: stockName,
    price: current.price,
    change: current.change,
    changeRate: current.changeRate,
    action,
    autoExecute,
    confidence: Math.round(confidence * 100),
    buyCount,
    sellCount,
    momentum: { signal: momentum.signal, score: momentum.score },
    strategies,
    timestamp: new Date().toISOString(),
  };

  addSignal(result);
  return result;
}

// ─── 전체 종목 스캔 (universe 기반) ───
export async function runSignalScan(broadcast) {
  const targets = getScanTargets();
  if (targets.length === 0) {
    log("warn", "스캔 대상 종목이 없습니다. 프리필터를 먼저 실행하세요.");
    return [];
  }

  log("info", `📊 시그널 스캔 시작: ${targets.length}개 종목`);
  const results = [];

  for (const stock of targets) {
    try {
      const analysis = await analyzeStock(stock.code, stock.name);
      results.push(analysis);

      if (analysis.autoExecute && analysis.action !== "hold") {
        log("warn", `⚡ 자동 ${analysis.action === "buy" ? "매수" : "매도"}: ${stock.name} (신뢰도: ${analysis.confidence}%)`);
        await executeTrade(analysis);
      } else if (analysis.action !== "hold") {
        log("info", `🔔 승인 대기: ${stock.name} ${analysis.action} (신뢰도: ${analysis.confidence}%)`);
      }

      if (broadcast) broadcast("signal", analysis);
    } catch (err) {
      log("error", `${stock.name} 분석 실패: ${err.message}`);
    }
  }

  if (broadcast) broadcast("scan_complete", { total: results.length });
  return results;
}

// ─── 모멘텀 전용 스캔 (장 시작 직후 1회) ───
export async function runMomentumScan(broadcast) {
  const candidates = getMomentumCandidates();
  if (candidates.length === 0) {
    log("info", "모멘텀 후보 없음");
    return [];
  }

  log("info", `🚀 모멘텀 스캔 시작: ${candidates.length}개 후보`);
  const results = [];

  for (const stock of candidates.slice(0, 30)) {
    try {
      await rateLimit();
      const candles = await getDailyCandles(stock.code, 10);
      await rateLimit();
      const current = await getCurrentPrice(stock.code);
      const momentum = analyzeMomentum(candles, current.price);

      if (momentum.signal === "buy") {
        results.push({
          code: stock.code,
          name: stock.name,
          price: current.price,
          momentum,
        });
        log("info", `🎯 모멘텀 매수 후보: ${stock.name} (스코어: ${momentum.score}/5)`);
      }

      if (broadcast) broadcast("momentum_scan", { code: stock.code, name: stock.name, momentum });
    } catch (err) {
      log("error", `모멘텀 분석 실패 (${stock.name}): ${err.message}`);
    }
  }

  return results;
}
