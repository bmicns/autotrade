import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";
import { readEngineStateSnapshot, selectPendingSignalsForScope } from "@/lib/engine/snapshot";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(v: unknown): v is string { return typeof v === "string" && UUID_RE.test(v); }


// GET: 대기 중인 신호 목록
export async function GET(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const scope = req.nextUrl.searchParams.get("scope") ?? "active";
  const snapshot = await readEngineStateSnapshot();
  const signals = selectPendingSignalsForScope(snapshot, scope === "history" ? "history" : "active");
  return NextResponse.json(signals.map((signal) => ({
    id: signal.id,
    stock_code: signal.stockCode,
    stock_name: signal.stockName,
    status: signal.status,
    signal_score: signal.score,
    signal_comment: signal.comment,
    source: signal.source,
    created_at: signal.createdAt,
    resolved_at: signal.resolvedAt,
    signal_data: signal.signalData,
  })));
}

// POST: 신호 승인/거부
export async function POST(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const { id, action } = await req.json();
  if (!isUUID(id) || !["approved", "rejected"].includes(action)) {
    return NextResponse.json({ error: "id(UUID)와 action(approved/rejected) 필수" }, { status: 400 });
  }

  // approved: resolved_at 없이 상태만 변경 (매수 성공 시 expired로 전환)
  // rejected: 즉시 resolved_at 기록
  const updatePayload = action === "rejected"
    ? { status: action, resolved_at: new Date().toISOString() }
    : { status: action };

  const { data, error } = await supabase
    .from("pending_signals")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: 즉시매수 성공 후 expired 전환
export async function PATCH(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const { id, status } = await req.json();
  if (!isUUID(id) || status !== "expired") {
    return NextResponse.json({ error: "id(UUID)와 status=expired 필수" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pending_signals")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
