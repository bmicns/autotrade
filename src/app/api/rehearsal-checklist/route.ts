import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { recordEngineEvent } from "@/lib/engine/event-log";
import {
  applyRehearsalUpdates,
  normalizeRehearsalChecklist,
  summarizeRehearsalChecklist,
} from "@/lib/operations/rehearsal-checklist";

const APP_CONFIG_KEY = "rehearsal_checklist";

async function readChecklist() {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", APP_CONFIG_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeRehearsalChecklist(data?.value);
}

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  try {
    const items = await readChecklist();
    return NextResponse.json({
      items,
      summary: summarizeRehearsalChecklist(items),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "리허설 체크리스트 조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  try {
    const body = await req.json() as { items?: Array<{ key?: string; checked?: boolean }> };
    const updates = Array.isArray(body.items)
      ? body.items
          .filter((item): item is { key: string; checked: boolean } => typeof item?.key === "string" && typeof item?.checked === "boolean")
      : [];

    if (updates.length === 0) {
      return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
    }

    const current = await readChecklist();
    const next = applyRehearsalUpdates(current, updates);
    const updatedAt = new Date().toISOString();

    const { error } = await supabase.from("app_config").upsert({
      key: APP_CONFIG_KEY,
      value: next,
      updated_at: updatedAt,
    });
    if (error) throw new Error(error.message);

    await recordEngineEvent({
      eventType: "app_config_updated",
      stockCode: null,
      entityTable: "app_config",
      entityId: null,
      payload: {
        actor: "session",
        source: "rehearsal-checklist",
        changes: [{ key: APP_CONFIG_KEY, value: next }],
      },
    });

    return NextResponse.json({
      items: next,
      summary: summarizeRehearsalChecklist(next),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "리허설 체크리스트 저장 실패" },
      { status: 500 },
    );
  }
}
