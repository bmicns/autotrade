import { NextResponse } from "next/server";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { buildEngineControlUpdates, upsertAppConfigEntries } from "@/lib/engine/app-config";
import { readEngineControlSnapshot } from "@/lib/engine/control";
import { apiCacheHeaders } from "@/lib/http-cache";

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
  }

  const { data } = await supabase.from("app_config").select("key, value");
  const cfgMap = new Map((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  return NextResponse.json(readEngineControlSnapshot(cfgMap), { headers: apiCacheHeaders.realtime });
}

export async function POST(req: Request) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const updates = buildEngineControlUpdates(body);
    await upsertAppConfigEntries(updates, { actor: "session", source: "api/engine-control" });
    return NextResponse.json(
      { ok: true, updatedKeys: updates.map((entry) => entry.key) },
      { headers: apiCacheHeaders.realtime },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "engine-control 저장 실패";
    const status = message.includes("변경할 필드") || message.includes("형식") || message.includes("범위") || message.includes("정수") || message.includes("boolean")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status, headers: apiCacheHeaders.realtime });
  }
}
