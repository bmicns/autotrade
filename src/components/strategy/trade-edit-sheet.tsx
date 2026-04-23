"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { TradeSettings } from "@/lib/store";

export type SettingKey =
  | "maxAmountPerTrade" | "maxTradesPerDay"
  | "stopLoss" | "takeProfit" | "trailingStop"
  | "dailyLossLimit" | "maxHoldDays"
  | "morningSession" | "afternoonSession";

export interface SettingMeta {
  key: SettingKey; label: string;
  icon: "trend" | "clock" | "dn" | "up";
  unit: string; type: "number" | "time-range";
  min?: number; max?: number; step?: number;
  description: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`, background: COLORS.sub,
  color: COLORS.ink, fontSize: 14, fontFamily: "inherit", outline: "none",
};

interface Props {
  meta: SettingMeta;
  ts: TradeSettings;
  onSave: (next: Partial<TradeSettings>) => void;
  onClose: () => void;
}

export function TradeEditSheet({ meta, ts, onSave, onClose }: Props) {
  const [value, setValue]   = useState("");
  const [value2, setValue2] = useState("");
  const [ratio, setRatio]   = useState("");

  useEffect(() => {
    switch (meta.key) {
      case "maxAmountPerTrade":  setValue(String(ts.maxAmountPerTrade)); break;
      case "maxTradesPerDay":    setValue(String(ts.maxTradesPerDay)); break;
      case "stopLoss":           setValue(String(ts.stopLoss)); break;
      case "takeProfit":         setValue(String(ts.takeProfit)); setRatio(String(ts.takeProfitRatio)); break;
      case "trailingStop":       setValue(String(ts.trailingStop)); break;
      case "dailyLossLimit":     setValue(String(ts.dailyLossLimit)); break;
      case "maxHoldDays":        setValue(String(ts.maxHoldDays)); break;
      case "morningSession":     setValue(ts.morningStart); setValue2(ts.morningEnd); break;
      case "afternoonSession":   setValue(ts.afternoonStart); setValue2(ts.afternoonEnd); break;
    }
  }, [meta.key, ts]);

  const handleSave = () => {
    switch (meta.key) {
      case "maxAmountPerTrade":  onSave({ maxAmountPerTrade: Number(value) || 100 }); break;
      case "maxTradesPerDay":    onSave({ maxTradesPerDay: Number(value) || 5 }); break;
      case "stopLoss":           onSave({ stopLoss: Number(value) || 5 }); break;
      case "takeProfit":         onSave({ takeProfit: Number(value) || 5, takeProfitRatio: Number(ratio) || 50 }); break;
      case "trailingStop":       onSave({ trailingStop: Number(value) || 3 }); break;
      case "dailyLossLimit":     onSave({ dailyLossLimit: Number(value) || 3 }); break;
      case "maxHoldDays":        onSave({ maxHoldDays: Number(value) || 5 }); break;
      case "morningSession":     onSave({ morningStart: value, morningEnd: value2 }); break;
      case "afternoonSession":   onSave({ afternoonStart: value, afternoonEnd: value2 }); break;
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
        background: COLORS.bg, borderRadius: "20px 20px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.line, margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 6 }}>{meta.label}</div>
        <div style={{ fontSize: 12, color: COLORS.dim, marginBottom: 20 }}>{meta.description}</div>

        {meta.type === "number" && meta.key !== "takeProfit" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
                min={meta.min} max={meta.max} step={meta.step}
                style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "14px 16px", textAlign: "center" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.mid, flexShrink: 0 }}>{meta.unit}</span>
            </div>
            {meta.min != null && meta.max != null && (
              <>
                <input type="range" min={meta.min} max={meta.max} step={meta.step} value={value}
                  onChange={(e) => setValue(e.target.value)}
                  style={{ width: "100%", marginTop: 12, accentColor: COLORS.rise }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{meta.min}{meta.unit}</span>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{meta.max}{meta.unit}</span>
                </div>
              </>
            )}
          </div>
        )}

        {meta.key === "takeProfit" && (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>익절 기준</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} min={1} max={50} step={0.5}
                  style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "14px 16px", textAlign: "center" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.mid, flexShrink: 0 }}>%</span>
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>매도 비율</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" value={ratio} onChange={(e) => setRatio(e.target.value)} min={10} max={100} step={10}
                  style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "14px 16px", textAlign: "center" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.mid, flexShrink: 0 }}>%</span>
              </div>
            </div>
          </div>
        )}

        {meta.type === "time-range" && (
          <div style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>시작</label>
              <input type="time" value={value} onChange={(e) => setValue(e.target.value)}
                style={{ ...inputStyle, fontSize: 16, fontWeight: 600, padding: "14px 16px", textAlign: "center" }} />
            </div>
            <span style={{ fontSize: 16, color: COLORS.dim, marginTop: 20 }}>~</span>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>종료</label>
              <input type="time" value={value2} onChange={(e) => setValue2(e.target.value)}
                style={{ ...inputStyle, fontSize: 16, fontWeight: 600, padding: "14px 16px", textAlign: "center" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px 0", borderRadius: 12, border: `1.5px solid ${COLORS.line}`,
            background: "transparent", color: COLORS.mid, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>취소</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "14px 0", borderRadius: 12, border: "none",
            background: COLORS.ink, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>저장</button>
        </div>
      </div>
    </>
  );
}
