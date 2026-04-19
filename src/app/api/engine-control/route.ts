import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";

export async function GET() {
  const { data } = await supabase.from("app_config").select("key, value");
  const cfgMap = new Map((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

  const engineEnabled = cfgMap.get("engine_enabled");
  const maxPositions = cfgMap.get("max_positions");

  return NextResponse.json({
    engine_enabled: engineEnabled === false || engineEnabled === "false" ? false : true,
    max_positions: Number(maxPositions ?? 5) || 5,
  });
}

