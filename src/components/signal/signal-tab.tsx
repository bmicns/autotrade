"use client";

import { useState, useEffect } from "react";
import { COLORS, DUMMY_STOCKS, SIGNAL_INDICATORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

function TimerBar({ total }: { total: number }) {
  const [left, setLeft] = useState(total);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const pct = (left / total) * 100;
  const col = pct > 50 ? COLORS.ink : COLORS.rise;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid }}>승인 타임아웃</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</span>
      </div>
      <div style={{ height: 3, background: COLORS.line, borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 2, transition: "width 1s linear" }} />
      </div>
    </div>
  );
}

export function SignalTab() {
  const [sel, setSel] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const holdings = useAppStore((s) => s.holdings);
  const addTrade = useAppStore((s) => s.addTrade);
  const pending = holdings.slice(0, 2).map((h) => ({ ...h, match: 4 }));

  if (!pending.length) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>보유 종목을 먼저 추가하세요</span>
      </div>
    );
  }

  const s = pending[Math.min(sel, pending.length - 1)];
  const stock = DUMMY_STOCKS.find((x) => x.code === s.code);
  const price = stock?.price ?? s.avgPrice;

  return (
    <div>
      {/* 탭 선택 */}
      <div style={{ padding: "16px 16px 0", display: "flex", gap: 8 }}>
        {pending.map((p, i) => (
          <div key={i} onClick={() => { setSel(i); setDone(null); }} style={{
            flex: 1, padding: "12px 16px", borderRadius: 10, cursor: "pointer",
            border: `1.5px solid ${sel === i ? COLORS.rise : COLORS.line}`,
            background: sel === i ? COLORS.riseL : COLORS.sub,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: sel === i ? COLORS.rise : COLORS.ink }}>{p.name}</span>
            <div style={{ marginTop: 3 }}>
              <span style={{ fontSize: 12, color: sel === i ? COLORS.rise : COLORS.dim }}>{p.match}/5 지표 일치</span>
            </div>
          </div>
        ))}
      </div>

      {/* 카드 */}
      <div style={{ margin: "12px 16px", borderRadius: 12, border: `1px solid ${COLORS.lineD}`, background: COLORS.card, overflow: "hidden" }}>
        {/* 헤더 */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.ink }}>{s.name}</span>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 12, color: COLORS.dim }}>{s.code} · {s.market}</span>
            </div>
          </div>
          <Badge label={`약한 신호 ${s.match}/5`} tone="gold" />
        </div>

        {/* 주문 정보 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderBottom: `1px solid ${COLORS.line}`, background: COLORS.line }}>
          {[
            ["매매구분", "매수", COLORS.rise, true],
            ["현재가", price.toLocaleString() + "원", COLORS.ink, false],
            ["주문수량", s.quantity + "주", COLORS.ink, false],
            ["주문금액", (price * s.quantity).toLocaleString() + "원", COLORS.ink, false],
          ].map(([lbl, val, col, bold], i) => (
            <div key={i} style={{ background: COLORS.card, padding: "12px 16px" }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.dim }}>{lbl as string}</span>
              <div style={{ marginTop: 5 }}>
                <span style={{ fontSize: 14, fontWeight: (bold as boolean) ? 800 : 700, color: col as string }}>{val as string}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Claude 판단 */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.line}`, background: `${COLORS.fall}08` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.fall }}>Claude 판단</span>
            <Badge label="매수 · 신뢰도 높음" tone="fall" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 400, color: COLORS.mid, lineHeight: 1.6 }}>
            시장 하락 속 반도체 섹터 강세 유지. HBM4 수주 확정으로 펀더멘털 뒷받침. 외국인 순매수 전환 확인.
          </span>
        </div>

        {/* 지표 분석 */}
        <div style={{ padding: "0 20px" }}>
          <div style={{ padding: "12px 0 8px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>지표 분석</span>
          </div>
          {SIGNAL_INDICATORS.map((ind, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: ind.hit ? COLORS.rise : COLORS.sub,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name={ind.hit ? "ok" : "xx"} size={12} color={ind.hit ? "#fff" : COLORS.dim} strokeWidth={2.5} />
                </div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{ind.name}</span>
                  <div style={{ marginTop: 1 }}><span style={{ fontSize: 12, color: COLORS.dim }}>{ind.desc}</span></div>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: ind.hit ? COLORS.rise : COLORS.dim }}>{ind.value}</span>
            </div>
          ))}
        </div>

        {/* 타이머 */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${COLORS.line}` }}>
          <TimerBar total={180} />
        </div>
      </div>

      {/* 버튼 */}
      {done === null ? (
        <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
          <button onClick={() => setDone("no")} style={{
            flex: 1, padding: "14px 0", borderRadius: 10,
            border: `1.5px solid ${COLORS.lineD}`, background: "transparent",
            fontSize: 12, fontWeight: 600, color: COLORS.mid, cursor: "pointer", fontFamily: "inherit",
          }}>거절</button>
          <button onClick={() => {
            setDone("yes");
            addTrade({
              id: crypto.randomUUID(), code: s.code, name: s.name,
              side: "buy", quantity: s.quantity, price,
              signalStrength: "weak", status: "executed", executedAt: new Date().toISOString(),
            });
          }} style={{
            flex: 2, padding: "14px 0", borderRadius: 10, border: "none",
            background: COLORS.rise, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            boxShadow: `0 4px 20px ${COLORS.rise}50`,
          }}>승인 · 매수 체결</button>
        </div>
      ) : (
        <div style={{
          margin: "0 16px 16px", padding: 20, borderRadius: 10, textAlign: "center",
          background: done === "yes" ? COLORS.riseL : COLORS.sub,
          border: `1.5px solid ${done === "yes" ? COLORS.riseB : COLORS.lineD}`,
        }}>
          <span style={{ fontSize: 22 }}>{done === "yes" ? "✓" : "✕"}</span>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: done === "yes" ? COLORS.rise : COLORS.mid }}>
              {done === "yes" ? "매수 주문 체결 완료" : "주문 거절됨"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
