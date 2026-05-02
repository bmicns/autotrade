import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";


export async function GET() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

    const { data, error } = await supabase
      .from("positions")
      .select("stock_code, entry_date, entry_price, entry_qty")
      .eq("status", "open")
      .order("entry_date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data || []);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
