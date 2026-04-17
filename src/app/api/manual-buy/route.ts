import { supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";


interface ManualBuyItem {
  stock_code: string;
  stock_name: string;
  qty: number;
}

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: ManualBuyItem[] };
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items required" }, { status: 400 });
    }

    const records = items.map((item) => ({
      stock_code: item.stock_code,
      stock_name: item.stock_name,
      signal_score: 100,
      signal_comment: `수동 지정 매수 — ${(item.qty).toLocaleString()}주`,
      source: "manual",
      status: "approved",
      signal_data: { qty_override: item.qty },
    }));

    const { data, error } = await supabase
      .from("pending_signals")
      .insert(records)
      .select("id, stock_code, stock_name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, inserted: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
