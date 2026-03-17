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
    <div className="px-5 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white tracking-tight">모멘텀</h2>
        <button
          onClick={handleMomentumScan}
          disabled={scanning}
          className="bg-[#0a84ff] text-white px-5 py-2.5 rounded-full text-sm font-semibold active:scale-[0.97] transition-transform disabled:opacity-40"
        >
          {scanning ? "스캔 중..." : "후보 스캔"}
        </button>
      </div>

      {/* 매수 후보 */}
      {candidates.length > 0 && (
        <div>
          <p className="text-[#ff9f0a] text-xs font-semibold uppercase tracking-wider px-1 mb-3">매수 후보</p>
          <div className="space-y-3">
            {candidates.map((s) => (
              <div key={s.code} className="glass rounded-2xl p-4 border-[#ff9f0a]/20">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white font-semibold">{s.name}</p>
                    <p className="text-[#86868b] text-xs mt-0.5">
                      {s.code} · 스코어 {s.momentum?.score}/5
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white text-sm font-medium">{formatKRW(s.price)}원</span>
                    <button
                      onClick={() => handleBuy(s)}
                      className="bg-[#34c759] text-black px-4 py-2 rounded-full text-xs font-bold active:scale-[0.97] transition-transform"
                    >
                      매수
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 활성 포지션 */}
      <div>
        <p className="text-[#86868b] text-xs font-medium uppercase tracking-wider px-1 mb-3">
          활성 포지션 ({positions?.length || 0})
        </p>
        {(!positions || positions.length === 0) && (
          <div className="glass rounded-2xl py-12 text-center">
            <p className="text-[#86868b] text-sm">활성 포지션 없음</p>
          </div>
        )}
        <div className="space-y-3">
          {positions?.map((p) => (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-semibold">{p.name}</p>
                  <p className="text-[#86868b] text-xs mt-0.5">{p.qty}주 · 매수가 {formatKRW(p.buyPrice)}원</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className={`text-lg font-bold tracking-tight ${p.profitPct >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"}`}>
                    {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                  </p>
                  <button
                    onClick={() => handleClose(p.id, p.currentPrice)}
                    className="bg-[#ff3b30]/10 text-[#ff3b30] px-3 py-1.5 rounded-full text-xs font-semibold active:scale-[0.97] transition-transform"
                  >
                    청산
                  </button>
                </div>
              </div>
              <div className="mt-3 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${p.profitPct >= 0 ? "bg-[#34c759]" : "bg-[#ff3b30]"}`}
                  style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 종료된 포지션 */}
      {closedPositions?.length > 0 && (
        <div>
          <p className="text-[#86868b] text-xs font-medium uppercase tracking-wider px-1 mb-3">
            완료 ({closedPositions.length})
          </p>
          <div className="space-y-2">
            {closedPositions.slice(0, 10).map((p, i) => (
              <div key={i} className="glass rounded-2xl p-4 opacity-60">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white text-sm font-medium">{p.name}</p>
                    <p className="text-[#86868b] text-xs mt-0.5">
                      {p.closeReason === "profit_target" ? "익절" : p.closeReason === "stop_loss" ? "손절" : "수동"}
                    </p>
                  </div>
                  <p className={`text-lg font-bold tracking-tight ${p.profitPct >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"}`}>
                    {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
