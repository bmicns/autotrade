const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function buildRevalidateHeaders(seconds: number) {
  return {
    "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
  } as const;
}

export const apiCacheHeaders = {
  realtime: NO_STORE_HEADERS,
  short: buildRevalidateHeaders(60),
  marketData: buildRevalidateHeaders(300),
  staticLookup: buildRevalidateHeaders(3600),
} as const;
