import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/stock-search?q=삼성
 * 네이버 금융 자동완성 API로 종목 검색 (국내주식만)
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1 || q.length > 50) {
    return NextResponse.json([]);
  }

  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return NextResponse.json([]);

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

    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}
