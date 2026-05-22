import { after, NextResponse } from "next/server";
import { runEngineRequest } from "@/app/api/engine/route";
import { apiCacheHeaders } from "@/lib/http-cache";
import { requireSessionWriteRequest } from "@/lib/request-guard";

export async function POST(req: Request) {
  const guard = requireSessionWriteRequest(req);
  if (guard) return guard;

  after(async () => {
    try {
      await runEngineRequest();
    } catch {
      // runEngineRequest 내부에서 로깅 처리됨
    }
  });

  return NextResponse.json(
    { triggered: true },
    { headers: apiCacheHeaders.realtime },
  );
}
