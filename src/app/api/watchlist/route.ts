import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";


// GET: 관심종목 목록 조회
export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

function validateCode(code: unknown): code is string {
  return typeof code === "string" && /^\d{6}$/.test(code);
}

// POST: 관심종목 추가
export async function POST(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const { code, name } = await req.json();
  if (!validateCode(code)) return NextResponse.json({ error: "유효하지 않은 종목코드입니다" }, { status: 400 });

  const { data, error } = await supabase
    .from("watchlist")
    .upsert({ code, name, active: true }, { onConflict: "code" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: 관심종목 삭제
export async function DELETE(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const { code } = await req.json();
  if (!validateCode(code)) return NextResponse.json({ error: "유효하지 않은 종목코드입니다" }, { status: 400 });

  const { error } = await supabase.from("watchlist").delete().eq("code", code);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
