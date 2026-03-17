/**
 * trader.js
 * 자동매매 실행 엔진
 * - 1회 매매 한도: 설정값 기반
 * - 자동 수량 계산
 * - 매매 이력 DB 저장
 */
import { buyOrder, sellOrder, getBalance } from "./kis-api.js";
import { addTrade, getTrades, getSettings } from "../db/store.js";
import { openPosition, getOpenPositionCount } from "./position-manager.js";
import { log } from "../utils/logger.js";

// ─── 매수 수량 계산 ───
function calcBuyQty(price) {
  const settings = getSettings();
  const maxAmount = settings.maxTradeAmount || 1_000_000;
  if (price <= 0) return 0;
  return Math.floor(maxAmount / price);
}

// ─── 매매 실행 ───
export async function executeTrade(analysis) {
  const { code, name, price, action, confidence } = analysis;

  const record = {
    code,
    name,
    action,
    price,
    confidence,
    timestamp: new Date().toISOString(),
    status: "pending",
    result: null,
  };

  try {
    if (action === "buy") {
      const qty = calcBuyQty(price);
      if (qty <= 0) {
        record.status = "skipped";
        record.result = "매수 가능 수량 없음 (가격 > 한도)";
        log("warn", `⏭  ${name} 매수 스킵: 가격(${price}원) > 한도`);
      } else {
        const orderResult = await buyOrder(code, qty);
        record.qty = qty;
        record.amount = qty * price;
        record.status = "executed";
        record.result = orderResult;
        log("info", `✅ ${name} 매수 완료: ${qty}주 × ${price}원 = ${(qty * price).toLocaleString()}원`);
      }
    } else if (action === "sell") {
      const balance = await getBalance();
      const holding = balance.holdings.find((h) => h.code === code);
      if (!holding || holding.qty <= 0) {
        record.status = "skipped";
        record.result = "보유 수량 없음";
        log("warn", `⏭  ${name} 매도 스킵: 미보유`);
      } else {
        const orderResult = await sellOrder(code, holding.qty);
        record.qty = holding.qty;
        record.amount = holding.qty * price;
        record.status = "executed";
        record.result = orderResult;
        log("info", `✅ ${name} 매도 완료: ${holding.qty}주`);
      }
    }
  } catch (err) {
    record.status = "error";
    record.result = err.message;
    log("error", `❌ ${name} ${action} 실패: ${err.message}`);
  }

  addTrade(record);
  return record;
}

// ─── 모멘텀 매수 실행 (포지션 매니저 연동) ───
export async function executeMomentumBuy(stock) {
  const settings = getSettings();
  const { code, name, price } = stock;

  // 최대 포지션 수 체크
  if (getOpenPositionCount() >= settings.maxPositions) {
    log("warn", `⏭  ${name} 모멘텀 매수 스킵: 최대 포지션(${settings.maxPositions}) 도달`);
    return null;
  }

  const qty = calcBuyQty(price);
  if (qty <= 0) {
    log("warn", `⏭  ${name} 모멘텀 매수 스킵: 수량 부족`);
    return null;
  }

  try {
    const orderResult = await buyOrder(code, qty);
    const position = openPosition({ code, name, buyPrice: price, qty });

    addTrade({
      code, name, action: "buy", price, qty,
      amount: qty * price,
      confidence: stock.momentum?.score ? stock.momentum.score * 20 : 0,
      strategy: "momentum",
      status: "executed",
      result: orderResult,
      timestamp: new Date().toISOString(),
    });

    log("info", `🚀 모멘텀 매수: ${name} ${qty}주 @${price.toLocaleString()}원`);
    return position;
  } catch (err) {
    log("error", `❌ 모멘텀 매수 실패 (${name}): ${err.message}`);
    return null;
  }
}

// ─── 수동 매매 승인 실행 ───
export async function approveManualTrade(analysis) {
  log("info", `👤 수동 승인 매매: ${analysis.name} ${analysis.action}`);
  return executeTrade(analysis);
}

// ─── 매매 이력 조회 ───
export function getTradeLog() {
  return getTrades();
}
