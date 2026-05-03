import { NextResponse } from "next/server";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { readEngineControlSnapshot } from "@/lib/engine/control";

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const { data } = await supabase.from("app_config").select("key, value");
  const cfgMap = new Map((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  return NextResponse.json(readEngineControlSnapshot(cfgMap));
}
