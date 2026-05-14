import { NextResponse } from "next/server";
import { GET as runEngine } from "@/app/api/engine/route";
import { apiCacheHeaders } from "@/lib/http-cache";

export async function POST() {
  try {
    const response = await runEngine();
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "엔진 재가동 실패" },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }
}
