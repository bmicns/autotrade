"use client";

import { useState } from "react";
import { COLORS } from "@/lib/constants";

export interface SignalThresholds {
  rsiBuy: number;
  rsiSell: number;
  strongScore: number;
  weakScore: number;
}

type SignalKey = keyof SignalThresholds;

interface SignalMeta {
  key: SignalKey;
  label: string;
  description: string;
}

const SIGNAL_METAS: SignalMeta[] = [
  { key: "rsiBuy",      label: "RSI 매수 기준",  description: "RSI가 이 값 미만일 때 과매도로 판단 (기본 30)" },
  { key: "rsiSell",     label: "RSI 매도 기준",  description: "RSI가 이 값 초과일 때 과매수로 판단 (기본 70)" },
  { key: "strongScore", label: "강한 신호 기준", description: "이 점수 이상이면 즉시 매수 실행 (기본 70)" },
  { key: "weakScore",   label: "약한 신호 기준", description: "이 점수 이상이면 승인 대기 큐 진입 (기본 40)" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`, background: COLORS.sub,
  color: COLORS.ink, fontSize: 14, fontFamily: "inherit", outline: "none",
};

interface Props {
  editKey: SignalKey;
  thresholds: SignalThresholds;
  onSave: (next: Partial<SignalThresholds>) => void;
  onClose: () => void;
}

export function SignalEditSheet({ editKey, thresholds, onSave, onClose }: Props) {
  const meta = SIGNAL_METAS.find((m) => m.key === editKey)!;
  const [value, setValue] = useState(() => String(thresholds[editKey]));

  const handleSave = () => {
    const num = Number(value);
    if (Number.isNaN(num) || num < 0 || num > 100) return;
    onSave({ [editKey]: num });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
        background: COLORS.bg, borderRadius: "20px 20px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.line, margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 6 }}>{meta.label}</div>
        <div style={{ fontSize: 12, color: COLORS.dim, marginBottom: 20 }}>{meta.description}</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              min={0} max={100} step={1}
              style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "14px 16px", textAlign: "center" }}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.mid, flexShrink: 0 }}>점</span>
          </div>
          <input
            type="range" min={0} max={100} step={1} value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: "100%", marginTop: 12, accentColor: COLORS.rise }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: COLORS.dim }}>0</span>
            <span style={{ fontSize: 10, color: COLORS.dim }}>100</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px 0", borderRadius: 12, border: `1.5px solid ${COLORS.line}`,
            background: "transparent", color: COLORS.mid, fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>취소</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "14px 0", borderRadius: 12, border: "none",
            background: COLORS.ink, color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>저장</button>
        </div>
      </div>
    </>
  );
}
