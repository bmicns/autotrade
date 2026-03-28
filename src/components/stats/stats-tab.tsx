"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

export function StatsTab() {
  const trades = useAppStore((s) => s.trades);
  const kisConnected = useAppStore((s) => s.kisConnected);

  if (trades.length === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COLORS.dim} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>매매 통계 없음</span>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 13, color: COLORS.dim, lineHeight: 1.6 }}>
            {kisConnected
              ? "매매가 실행되면 통계가 자동으로 집계됩니다."
              : "KIS 연결 후 매매가 실행되면 통계가 표시됩니다."}
          </span>
        </div>
      </div>
    );
  }

  // 실제 매매 이력 기반 통계 계산
  const executed = trades.filter((t) => t.status === "executed");
  const buys = executed.filter((t) => t.side === "buy");
  const sells = executed.filter((t) => t.side === "sell");

  return (
    <div>
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>매매 이력</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
        {[
          { l: "총 매매", v: `${executed.length}회`, c: COLORS.ink },
          { l: "매수", v: `${buys.length}회`, c: COLORS.rise },
          { l: "매도", v: `${sells.length}회`, c: COLORS.fall },
        ].map((item, i) => (
          <div key={i} style={{ background: COLORS.sub, borderRadius: 10, padding: 14, border: `1px solid ${COLORS.line}` }}>
            <span style={{ fontSize: 12, color: COLORS.dim }}>{item.l}</span>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: item.c, fontVariantNumeric: "tabular-nums" }}>{item.v}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 최근 체결 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>최근 체결</span>
      </div>
      {executed.slice(0, 10).map((t) => (
        <div key={t.id}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{t.name}</span>
              <div style={{ marginTop: 3 }}>
                <span style={{ fontSize: 12, color: COLORS.dim }}>
                  {t.side === "buy" ? "매수" : "매도"} · {t.quantity}주 · {new Date(t.executedAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.side === "buy" ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
              {t.price.toLocaleString("ko-KR")}원
            </span>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </div>
      ))}
    </div>
  );
}
