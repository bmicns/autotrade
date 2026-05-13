export interface KISAccountParts {
  cano: string;
  productCode: string;
}

export interface NormalizedKisAccountInput {
  accountNo: string;
  accountProductCode: string;
}

export function normalizeKisAccountInput(accountNo: string, accountProductCode?: string | null): NormalizedKisAccountInput {
  const cleanAccountNo = String(accountNo ?? "").replace(/\D/g, "").slice(0, 10);
  const cleanProductCode = String(accountProductCode ?? "").replace(/\D/g, "").slice(0, 2);

  if (cleanAccountNo.length >= 10) {
    return {
      accountNo: cleanAccountNo.slice(0, 8),
      accountProductCode: cleanAccountNo.slice(8, 10),
    };
  }

  return {
    accountNo: cleanAccountNo.slice(0, 8),
    accountProductCode: cleanProductCode || "01",
  };
}

export function resolveKisAccountParts(accountNo: string, accountProductCode?: string | null): KISAccountParts {
  const normalized = normalizeKisAccountInput(accountNo, accountProductCode);
  return {
    cano: normalized.accountNo,
    productCode: normalized.accountProductCode,
  };
}
