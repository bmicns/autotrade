import { useState } from "react";
import { api } from "../lib/api";

function fmt(n) {
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
    <div className="page-padding space-y-[20px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-white">모멘텀 전략</h2>
        <button onClick={handleMomentumScan} disabled={scanning} className="btn-kis text-[13px] px-[16px] py-[10px]">
          {scanning ? "스캔 중..." : "후보 스캔"}
        </button>
      </div>

      {/* 매수 후보 */}
      {candidates.length > 0 && (
        <div className="kis-card overflow-hidden">
          <div className="px-[16px] py-[12px] flex items-center gap-[8px]">
            <span className="w-[6px] h-[6px] rounded-full bg-[#ff8a00]" />
            <span className="text-[13px] font-bold text-[#ff8a00]">매수 후보</span>
            <span className="text-[11px] text-[#8c919a]">{candidates.length}종목</span>
          </div>
          {candidates.map((s) => (
            <div key={s.code} className="kis-row">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white truncate">{s.name}</p>
                <div className="flex items-center gap-[8px] mt-[3px]">
                  <span className="text-[11px] text-[#8c919a]">{s.code}</span>
                  <span className="badge bg-[#ff8a00]/15 text-[#ff8a00]">스코어 {s.momentum?.score}/5</span>
                </div>
              </div>
              <div className="flex items-center gap-[12px] ml-[12px]">
                <span className="text-[14px] font-bold text-white kis-amount">{fmt(s.price)}</span>
                <button
                  onClick={() => handleBuy(s)}
                  className="bg-[#ff2f2f] text-white px-[14px] py-[8px] rounded-[6px] text-[12px] font-bold active:scale-[0.98] transition-transform"
                >
                  매수
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 활성 포지션 */}
      <div className="kis-card overflow-hidden">
        <div className="px-[16px] py-[12px] flex items-center justify-between">
          <span className="text-[13px] font-bold text-white">보유 포지션</span>
          <span className="text-[11px] text-[#8c919a]">{positions?.length || 0}종목</span>
        </div>
        {(!positions || positions.length === 0) ? (
          <div className="py-[40px] text-center">
            <p className="text-[#8c919a] text-[13px]">보유 포지션 없음</p>
          </div>
        ) : (
          positions.map((p) => (
            <div key={p.id} className="px-[16px] py-[14px] border-t border-[#1e2640]">
              <div className="flex justify-between items-center">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-white truncate">{p.name}</p>
                  <p className="text-[11px] text-[#8c919a] mt-[2px]">{p.qty}주 · 매수 {fmt(p.buyPrice)}</p>
                </div>
                <div className="flex items-center gap-[12px] ml-[12px]">
                  <div className="text-right">
                    <p className={`text-[16px] font-bold kis-amount ${p.profitPct >= 0 ? "c-up" : "c-down"}`}>
                      {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(2)}%
                    </p>
                    <p className="text-[11px] text-[#8c919a] mt-[1px]">{fmt(p.currentPrice)}원</p>
                  </div>
                  <button
                    onClick={() => handleClose(p.id, p.currentPrice)}
                    className="bg-[#2b83ff]/15 text-[#2b83ff] px-[12px] py-[7px] rounded-[6px] text-[11px] font-bold active:scale-[0.98] transition-transform"
                  >
                    청산
                  </button>
                </div>
              </div>
              <div className="kis-gauge mt-[10px]">
                <div
                  className={`kis-gauge-fill ${p.profitPct >= 0 ? "bg-[#ff2f2f]" : "bg-[#2b83ff]"}`}
                  style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* 완료 */}
      {closedPositions?.length > 0 && (
        <div className="kis-card overflow-hidden">
          <div className="px-[16px] py-[12px] flex items-center justify-between">
            <span className="text-[13px] font-bold text-white">매매 완료</span>
            <span className="text-[11px] text-[#8c919a]">{closedPositions.length}건</span>
          </div>
          {closedPositions.slice(0, 10).map((p, i) => (
            <div key={i} className="kis-row opacity-60">
              <div>
                <p className="text-[13px] font-medium text-white">{p.name}</p>
                <p className="text-[11px] text-[#8c919a] mt-[1px]">
                  {p.closeReason === "profit_target" ? "익절" : p.closeReason === "stop_loss" ? "손절" : "수동청산"}
                </p>
              </div>
              <p className={`text-[15px] font-bold kis-amount ${p.profitPct >= 0 ? "c-up" : "c-down"}`}>
                {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(2)}%
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
