"use server";

import { supabase } from "@/lib/supabase/api-client";

function checkAdminSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET 미설정");
}

export async function setEngineEnabled(enabled: boolean) {
  checkAdminSecret();
  if (typeof enabled !== "boolean") throw new Error("enabled 필드는 boolean이어야 합니다");

  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "engine_enabled", value: enabled, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setMaxPositions(max_positions: number) {
  checkAdminSecret();
  const val = Number(max_positions);
  if (!Number.isInteger(val) || val < 1 || val > 20) {
    throw new Error("max_positions는 1~20 정수여야 합니다");
  }

  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "max_positions", value: val, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true };
}
