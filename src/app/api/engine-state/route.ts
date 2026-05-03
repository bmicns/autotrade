import { NextResponse } from "next/server";
import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { readEngineStateSnapshot } from "@/lib/engine/snapshot";

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  try {
    const snapshot = await readEngineStateSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "engine state 조회 실패" }, { status: 500 });
  }
}
