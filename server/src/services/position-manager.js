/**
 * position-manager.js
 * 모멘텀 전략 포지션 관리
 * - 포지션 열기/닫기
 * - 5% 익절 / 3% 손절 자동 체크
 */
import { getCurrentPrice, sellOrder } from "./kis-api.js";
import { getPositions, addPosition, updatePosition, getSettings } from "../db/store.js";
import { log } from "../utils/logger.js";
import { rateLimit } from "../utils/rate-limiter.js";

let idCounter = Date.now();

/**
 * 새 포지션 열기
 */
export function openPosition({ code, name, buyPrice, qty }) {
  const settings = getSettings();
  const pos = {
    id: String(++idCounter),
    code,
    name,
    buyPrice,
    qty,
    amount: buyPrice * qty,
    strategy: "momentum",
    targetProfitPct: settings.profitTargetPct,
    stopLossPct: settings.stopLossPct,
    status: "open",
    currentPrice: buyPrice,
    profitPct: 0,
    openedAt: new Date().toISOString(),
    closedAt: null,
    closeReason: null,
  };
  addPosition(pos);
  log("info", `📈 포지션 오픈: ${name}(${code}) ${qty}주 @${buyPrice.toLocaleString()}원`);
  return pos;
}

/**
 * 열린 포지션 수 조회
 */
export function getOpenPositionCount() {
  return getPositions().filter((p) => p.status === "open").length;
}

/**
 * 모든 열린 포지션 수익률 체크 + 자동 익절/손절
 * 3분마다 크론에서 호출
 */
export async function checkPositions(broadcast) {
  const positions = getPositions().filter((p) => p.status === "open");
  if (positions.length === 0) return [];

  const results = [];

  for (const pos of positions) {
    try {
      await rateLimit();
      const priceData = await getCurrentPrice(pos.code);
      const currentPrice = priceData.price;
      const profitPct = ((currentPrice - pos.buyPrice) / pos.buyPrice) * 100;

      // 포지션 업데이트
      updatePosition(pos.id, { currentPrice, profitPct: Number(profitPct.toFixed(2)) });

      // 익절 체크
      if (profitPct >= pos.targetProfitPct) {
        await closePosition(pos.id, currentPrice, "profit_target");
        results.push({ ...pos, action: "sell", reason: `익절 ${profitPct.toFixed(1)}%` });
        if (broadcast) broadcast("trade", { type: "profit_target", code: pos.code, name: pos.name, profitPct });
      }
      // 손절 체크
      else if (profitPct <= -pos.stopLossPct) {
        await closePosition(pos.id, currentPrice, "stop_loss");
        results.push({ ...pos, action: "sell", reason: `손절 ${profitPct.toFixed(1)}%` });
        if (broadcast) broadcast("trade", { type: "stop_loss", code: pos.code, name: pos.name, profitPct });
      }
      // 포지션 업데이트 브로드캐스트
      else if (broadcast) {
        broadcast("position_update", { id: pos.id, code: pos.code, currentPrice, profitPct });
      }
    } catch (err) {
      log("error", `포지션 체크 실패 (${pos.code}): ${err.message}`);
    }
  }

  return results;
}

/**
 * 포지션 닫기 (매도 실행)
 */
export async function closePosition(positionId, sellPrice, reason) {
  const positions = getPositions();
  const pos = positions.find((p) => p.id === positionId);
  if (!pos || pos.status !== "open") return null;

  try {
    await sellOrder(pos.code, pos.qty);
    const profitPct = ((sellPrice - pos.buyPrice) / pos.buyPrice) * 100;
    const profitAmount = (sellPrice - pos.buyPrice) * pos.qty;

    updatePosition(positionId, {
      status: "closed",
      currentPrice: sellPrice,
      profitPct: Number(profitPct.toFixed(2)),
      profitAmount: Math.round(profitAmount),
      closedAt: new Date().toISOString(),
      closeReason: reason,
    });

    const emoji = profitPct >= 0 ? "💰" : "💸";
    log("info", `${emoji} 포지션 종료: ${pos.name} ${profitPct.toFixed(1)}% (${reason})`);
    return { ...pos, profitPct, profitAmount, closeReason: reason };
  } catch (err) {
    log("error", `포지션 종료 실패 (${pos.code}): ${err.message}`);
    return null;
  }
}

/**
 * 열린 포지션 목록
 */
export function getOpenPositions() {
  return getPositions().filter((p) => p.status === "open");
}

/**
 * 종료된 포지션 이력
 */
export function getClosedPositions() {
  return getPositions().filter((p) => p.status === "closed");
}

/**
 * 수익 통계
 */
export function getStats() {
  const closed = getClosedPositions();
  const wins = closed.filter((p) => p.profitPct > 0);
  const losses = closed.filter((p) => p.profitPct <= 0);
  const totalProfit = closed.reduce((s, p) => s + (p.profitAmount || 0), 0);

  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : "0",
    totalProfit,
    openPositions: getOpenPositions().length,
  };
}
