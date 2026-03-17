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
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">모멘텀 전략</h2>
        <button
          onClick={handleMomentumScan}
          disabled={scanning}
          className="bg-[#4a9eff] text-white px-4 py-2 rounded-lg text-sm active:scale-95 transition disabled:opacity-50"
        >
          {scanning ? "스캔 중..." : "🎯 후보 스캔"}
        </button>
      </div>

      {/* 매수 후보 */}
      {candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-[#fbbf24] px-1">매수 후보</p>
          {candidates.map((s) => (
            <div key={s.code} className="bg-[#0f1629] rounded-xl p-3 border border-[#fbbf24]/30">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-white">{s.name}</p>
                  <p className="text-xs text-[#64748b]">
                    {s.code} · 스코어 {s.momentum?.score}/5
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm">{formatKRW(s.price)}원</span>
                  <button
                    onClick={() => handleBuy(s)}
                    className="bg-[#34d399] text-black px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95"
                  >
                    매수
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 활성 포지션 */}
      <div className="space-y-2">
        <p className="text-sm text-[#64748b] px-1">활성 포지션 ({positions?.length || 0})</p>
        {(!positions || positions.length === 0) && (
          <p className="text-center text-[#64748b] text-sm py-8">활성 포지션 없음</p>
        )}
        {positions?.map((p) => (
          <div key={p.id} className="bg-[#0f1629] rounded-xl p-3 border border-[#1a2540]">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-white">{p.name}</p>
                <p className="text-xs text-[#64748b]">{p.qty}주 · 매수가 {formatKRW(p.buyPrice)}원</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className={`font-bold ${p.profitPct >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
                    {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                  </p>
                </div>
                <button
                  onClick={() => handleClose(p.id, p.currentPrice)}
                  className="bg-[#f87171] text-white px-2 py-1 rounded text-xs active:scale-95"
                >
                  청산
                </button>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${p.profitPct >= 0 ? "bg-[#34d399]" : "bg-[#f87171]"}`}
                style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 종료된 포지션 */}
      {closedPositions?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-[#64748b] px-1">완료 ({closedPositions.length})</p>
          {closedPositions.slice(0, 10).map((p, i) => (
            <div key={i} className="bg-[#0f1629] rounded-xl p-3 border border-[#1a2540] opacity-70">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-white">{p.name}</p>
                  <p className="text-xs text-[#64748b]">
                    {p.closeReason === "profit_target" ? "익절" : p.closeReason === "stop_loss" ? "손절" : "수동"}
                  </p>
                </div>
                <p className={`font-bold ${p.profitPct >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
                  {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
