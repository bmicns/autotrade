import { NextResponse } from "next/server";
import { runEngineRequest } from "@/app/api/engine/route";
import { apiCacheHeaders } from "@/lib/http-cache";
import { requireSessionWriteRequest } from "@/lib/request-guard";

export async function POST(req: Request) {
  const guard = requireSessionWriteRequest(req);
  if (guard) return guard;

  try {
    const response = await runEngineRequest();
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "엔진 재가동 실패" },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }
}
