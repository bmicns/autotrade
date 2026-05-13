import { NextRequest, NextResponse } from "next/server";
import { getDefaultUsEtfUniverse, getDefaultUsStockUniverse } from "@/lib/market/adapters/us-shared";
import { apiCacheHeaders } from "@/lib/http-cache";

function searchUsUniverse(query: string) {
  const upperQuery = query.toUpperCase();
  return [...getDefaultUsStockUniverse(), ...getDefaultUsEtfUniverse()]
    .filter((item) =>
      item.symbol.toUpperCase().includes(upperQuery) ||
      item.name.toUpperCase().includes(upperQuery),
    )
    .slice(0, 10)
    .map((item) => ({
      code: item.symbol,
      name: item.name,
      market: item.exchange ?? "US",
      exchangeCode: item.symbol === "SPY" ? "AMEX" : item.symbol === "VTI" ? "NYSE" : "NASD",
      assetClass: item.assetClass,
    }));
}

/**
 * GET /api/stock-search?q=삼성
 * 네이버 금융 자동완성 API로 종목 검색 (국내주식만)
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const market = req.nextUrl.searchParams.get("market")?.trim().toLowerCase();
  if (!q || q.length < 1 || q.length > 50) {
    return NextResponse.json([], { headers: apiCacheHeaders.staticLookup });
  }

  if (market === "us") {
    return NextResponse.json(searchUsUniverse(q), { headers: apiCacheHeaders.staticLookup });
  }

  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return NextResponse.json([], { headers: apiCacheHeaders.marketData });

    const data = await res.json();
    const items = (data.items ?? [])
      .filter((item: Record<string, string>) =>
        item.nationCode === "KOR" && item.category === "stock"
      )
      .slice(0, 10)
      .map((item: Record<string, string>) => ({
        code: item.code,
        name: item.name,
        market: item.typeName ?? item.typeCode,
      }));

    return NextResponse.json(items, { headers: apiCacheHeaders.marketData });
  } catch {
    return NextResponse.json([], { headers: apiCacheHeaders.marketData });
  }
}
