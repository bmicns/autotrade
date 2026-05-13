import { NextRequest, NextResponse } from "next/server";

import { fetchNewsSnapshot } from "@/lib/news";
import { apiCacheHeaders } from "@/lib/http-cache";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market") === "us" ? "us" : "kr";
  const snapshot = await fetchNewsSnapshot(market);
  return NextResponse.json(snapshot, { headers: apiCacheHeaders.marketData });
}
