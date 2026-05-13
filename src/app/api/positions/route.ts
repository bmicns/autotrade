import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";
import { readEngineStateSnapshot } from "@/lib/engine/snapshot";
import { mapPositionsApiResponse } from "@/lib/engine/read-model";
import { apiCacheHeaders } from "@/lib/http-cache";


export async function GET() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) {
      return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
    }

    const snapshot = await readEngineStateSnapshot();
    return NextResponse.json(mapPositionsApiResponse(snapshot.openPositions), { headers: apiCacheHeaders.realtime });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: apiCacheHeaders.realtime });
  }
}
