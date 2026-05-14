export const DEFAULT_BUY_FEE_RATE = 0.00015;
export const DEFAULT_SELL_FEE_RATE = 0.00015;
export const DEFAULT_SELL_TAX_RATE = 0.0018;
export const DEFAULT_BUY_SLIPPAGE_RATE = 0.0005;
export const DEFAULT_SELL_SLIPPAGE_RATE = 0.0005;

export function roundMoney(value: number): number {
  return Math.round(value);
}

export function applyBuyExecution(price: number, slippageRate: number) {
  return price * (1 + slippageRate);
}

export function applySellExecution(price: number, slippageRate: number) {
  return price * (1 - slippageRate);
}

export function calcBuyCost(price: number, quantity: number, feeRate: number) {
  const gross = price * quantity;
  const fee = gross * feeRate;
  return {
    gross,
    fee,
    total: gross + fee,
  };
}

export function calcSellProceeds(price: number, quantity: number, feeRate: number, taxRate: number) {
  const gross = price * quantity;
  const fee = gross * feeRate;
  const tax = gross * taxRate;
  return {
    gross,
    fee,
    tax,
    net: gross - fee - tax,
  };
}
