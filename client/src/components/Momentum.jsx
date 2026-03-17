import { useState } from "react";
import { api } from "../lib/api";

function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Momentum({ positions, closedPositions, onRefresh }) {
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState([]);

  async function handleMomentumScan() {
    setScanning(true);
    try {
      const data = await api.momentumScan();
      setCandidates(data || []);
    } catch {} finally { setScanning(false); }
  }

  async function handleBuy(stock) {
    try {
      await api.momentumBuy(stock);
      setCandidates((prev) => prev.filter((s) => s.code !== stock.code));
      onRefresh();
    } catch {}
  }

  async function handleClose(id, price) {
    try {
      await api.closePosition(id, price);
      onRefresh();
    } catch {}
  }

  return (
    <div className="px-6 pt-10 pb-8 space-y-10 animate-fade-up">
      {/* Header */}
      <section className="flex items-end justify-between">
        <div>
          <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-2">전략</p>
          <h2 className="text-[34px] font-bold text-white tracking-tight leading-none">모멘텀</h2>
        </div>
        <button onClick={handleMomentumScan} disabled={scanning} className="btn-blue text-[13px] px-5 py-2.5">
          {scanning ? "스캔 중..." : "후보 스캔"}
        </button>
      </section>

      {/* Buy Candidates */}
      {candidates.length > 0 && (
        <section>
          <p className="text-[#ff9f0a] text-[11px] font-semibold uppercase tracking-wider mb-4 px-1">매수 후보</p>
          <div className="space-y-3">
            {candidates.map((s) => (
              <div key={s.code} className="card p-5" style={{ borderColor: "rgba(255,159,10,0.15)" }}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white font-semibold text-[17px] tracking-tight">{s.name}</p>
                    <p className="text-white/30 text-[13px] mt-1">
                      {s.code} · 스코어 <span className="text-[#ff9f0a] font-semibold">{s.momentum?.score}/5</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white/70 text-[15px] font-medium">{formatKRW(s.price)}원</span>
                    <button
                      onClick={() => handleBuy(s)}
                      className="bg-[#30d158] text-black px-5 py-2 rounded-full text-[13px] font-bold active:scale-[0.97] transition-transform"
                    >
                      매수
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Positions */}
      <section>
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-4 px-1">
          활성 포지션 ({positions?.length || 0})
        </p>
        {(!positions || positions.length === 0) ? (
          <div className="card py-16 text-center">
            <p className="text-white/20 text-[15px]">활성 포지션 없음</p>
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map((p) => (
              <div key={p.id} className="card p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white font-semibold text-[17px] tracking-tight">{p.name}</p>
                    <p className="text-white/30 text-[13px] mt-1">{p.qty}주 · 매수가 {formatKRW(p.buyPrice)}원</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className={`text-[22px] font-bold tracking-tight ${p.profitPct >= 0 ? "text-profit" : "text-loss"}`}>
                      {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                    </p>
                    <button
                      onClick={() => handleClose(p.id, p.currentPrice)}
                      className="text-[#ff453a] bg-[#ff453a]/10 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform"
                    >
                      청산
                    </button>
                  </div>
                </div>
                <div className="gauge-track mt-4">
                  <div
                    className={`gauge-fill ${p.profitPct >= 0 ? "bg-[#30d158]" : "bg-[#ff453a]"}`}
                    style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Closed Positions */}
      {closedPositions?.length > 0 && (
        <section>
          <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-4 px-1">
            완료 ({closedPositions.length})
          </p>
          <div className="space-y-2">
            {closedPositions.slice(0, 10).map((p, i) => (
              <div key={i} className="card p-4 opacity-50">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white text-[15px] font-medium">{p.name}</p>
                    <p className="text-white/30 text-[11px] mt-0.5">
                      {p.closeReason === "profit_target" ? "익절" : p.closeReason === "stop_loss" ? "손절" : "수동"}
                    </p>
                  </div>
                  <p className={`text-[20px] font-bold tracking-tight ${p.profitPct >= 0 ? "text-profit" : "text-loss"}`}>
                    {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
