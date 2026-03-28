"use client";

import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/ui/icons";

const GROUPS = [
  { title: "매매 한도", rows: [{ l: "1회 매매 한도", i: "trend" as const, r: "100만원 (Kelly)" }, { l: "1일 최대 횟수", i: "clock" as const, r: "5회" }] },
  { title: "손익 관리", rows: [{ l: "손절 라인", i: "dn" as const, r: "-5%" }, { l: "1차 익절", i: "up" as const, r: "+5% · 50%" }, { l: "트레일링 스탑", i: "trend" as const, r: "고점 -3%" }] },
  { title: "시간대 필터", rows: [{ l: "오전 세션", i: "clock" as const, r: "09:30~11:30" }, { l: "오후 세션", i: "clock" as const, r: "13:00~14:50" }] },
  { title: "API 연결", rows: [{ l: "KIS API 키", i: "key" as const, r: "●●●●●●●●" }, { l: "WebSocket", i: "wifi" as const, r: "연결됨" }] },
];

export function SettingsTab() {
  return (
    <div>
      {GROUPS.map((sec, si) => (
        <div key={si}>
          <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
            <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>{sec.title}</span>
          </div>
          {sec.rows.map((r, ri) => (
            <div key={ri}>
              <div className="flex cursor-pointer items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
                    <Icon name={r.i} size={16} color={COLORS.mid} strokeWidth={1.5} />
                  </div>
                  <span className="text-xs font-medium" style={{ color: COLORS.ink }}>{r.l}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: COLORS.mid }}>{r.r}</span>
                  <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
                </div>
              </div>
              <div className="h-px" style={{ background: COLORS.line }} />
            </div>
          ))}
        </div>
      ))}
      <div className="py-7 text-center">
        <span className="text-xs" style={{ color: COLORS.dim }}>NEXIO v2.0 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
