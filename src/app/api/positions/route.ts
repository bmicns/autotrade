import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";
import { readEngineStateSnapshot } from "@/lib/engine/snapshot";
import { mapPositionsApiResponse } from "@/lib/engine/read-model";


export async function GET() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

    const snapshot = await readEngineStateSnapshot();
    return NextResponse.json(mapPositionsApiResponse(snapshot.openPositions));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
