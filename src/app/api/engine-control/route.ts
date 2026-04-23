import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";

export async function GET() {
  const { data } = await supabase.from("app_config").select("key, value");
  const cfgMap = new Map((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

  const engineEnabled = cfgMap.get("engine_enabled");

  return NextResponse.json({
    engine_enabled: engineEnabled === false || engineEnabled === "false" ? false : true,
    max_positions:  Number(cfgMap.get("max_positions")  ?? 5) || 5,
    max_per_sector: Number(cfgMap.get("max_per_sector") ?? 2) || 2,
    rsi_buy:        cfgMap.has("rsi_buy")      ? Number(cfgMap.get("rsi_buy"))      : 30,
    rsi_sell:       cfgMap.has("rsi_sell")     ? Number(cfgMap.get("rsi_sell"))     : 70,
    strong_score:   cfgMap.has("strong_score") ? Number(cfgMap.get("strong_score")) : 70,
    weak_score:     cfgMap.has("weak_score")   ? Number(cfgMap.get("weak_score"))   : 40,
    market_crash_threshold: cfgMap.has("market_crash_threshold") ? Number(cfgMap.get("market_crash_threshold")) : -2.0,
  });
}
