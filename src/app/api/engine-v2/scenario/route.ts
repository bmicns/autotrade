import { NextRequest, NextResponse } from "next/server";
import { readEngineV2RuntimeConfig, overrideEngineV2Selections, resolveEngineV2RuntimeStatus, runEngineV2Scenario } from "@/lib/engine-v2";
import { apiCacheHeaders } from "@/lib/http-cache";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const assetClasses = searchParams.get("assetClasses") ?? undefined;
    const config = overrideEngineV2Selections(readEngineV2RuntimeConfig(), assetClasses);
    const runtime = resolveEngineV2RuntimeStatus();
    if (!runtime.allowed) {
      return NextResponse.json(
        { ok: false, error: runtime.detail, runtime },
        { status: 403, headers: apiCacheHeaders.realtime },
      );
    }
    const result = await runEngineV2Scenario(config);

    return NextResponse.json(
      {
        ok: true,
        mode: "local_engine_v2",
        runtime,
        result,
      },
      { headers: apiCacheHeaders.realtime },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "engine-v2 scenario failed" },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const assetClasses = typeof body?.assetClasses === "string" ? body.assetClasses : undefined;
    const profileOverrides = body?.profileOverrides && typeof body.profileOverrides === "object"
      ? body.profileOverrides
      : undefined;
    const config = overrideEngineV2Selections(readEngineV2RuntimeConfig(), assetClasses);
    const runtime = resolveEngineV2RuntimeStatus();
    if (!runtime.allowed) {
      return NextResponse.json(
        { ok: false, error: runtime.detail, runtime },
        { status: 403, headers: apiCacheHeaders.realtime },
      );
    }
    const result = await runEngineV2Scenario(config, undefined, profileOverrides);

    return NextResponse.json(
      {
        ok: true,
        mode: "local_engine_v2",
        runtime,
        result,
      },
      { headers: apiCacheHeaders.realtime },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "engine-v2 scenario failed" },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }
}
