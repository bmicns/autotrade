import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// GET: 대기 중인 신호 목록
export async function GET() {
  const { data, error } = await supabase
    .from("pending_signals")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST: 신호 승인/거부
export async function POST(req: NextRequest) {
  const { id, action } = await req.json();
  if (!id || !["approved", "rejected"].includes(action)) {
    return NextResponse.json({ error: "id와 action(approved/rejected) 필수" }, { status: 400 });
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
  const { id, status } = await req.json();
  if (!id || status !== "expired") {
    return NextResponse.json({ error: "id와 status=expired 필수" }, { status: 400 });
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
