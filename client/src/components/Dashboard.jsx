import { useState } from "react";
import { api } from "../lib/api";

function fmt(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Dashboard({ balance, positions, stats, onRefresh }) {
  const [scanning, setScanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleScan() {
    setScanning(true);
    try { await api.scan(); onRefresh(); } catch {} finally { setScanning(false); }
  }

  async function handleRefreshUniverse() {
    setRefreshing(true);
    try { await api.refreshUniverse(); onRefresh(); } catch {} finally { setRefreshing(false); }
  }

  const total = (balance?.cash || 0) + (balance?.totalEval || 0);
  const profit = stats?.totalProfit || 0;

  return (
    <div className="page-padding space-y-[20px]">
      {/* 계좌 총자산 */}
      <div className="kis-card p-[20px]">
        <div className="flex items-center justify-between mb-[16px]">
          <span className="text-[#8c919a] text-[12px] font-medium">총 평가자산</span>
          <span className="text-[#8c919a] text-[11px]">44256805-01</span>
        </div>
        <p className="text-[28px] font-bold text-white kis-amount">{fmt(total)}<span className="text-[14px] text-[#8c919a] ml-[2px]">원</span></p>

        <div className="h-px bg-[#1e2640] my-[16px]" />

        <div className="grid grid-cols-2 gap-[12px]">
          <div>
            <p className="text-[11px] text-[#8c919a] mb-[4px]">예수금</p>
            <p className="text-[16px] font-bold text-white kis-amount">{fmt(balance?.cash)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#8c919a] mb-[4px]">주식평가</p>
            <p className="text-[16px] font-bold text-white kis-amount">{fmt(balance?.totalEval)}</p>
          </div>
        </div>
      </div>

      {/* 모멘텀 전략 성과 */}
      <div className="kis-card">
        <div className="px-[16px] pt-[16px] pb-[12px] flex items-center justify-between">
          <span className="text-[13px] font-bold text-white">모멘텀 전략</span>
          <span className={`badge ${profit >= 0 ? "bg-up c-up" : "bg-down c-down"}`}>
            {profit >= 0 ? "+" : ""}{fmt(profit)}원
          </span>
        </div>
        <div className="h-px bg-[#1e2640]" />
        <div className="grid grid-cols-3">
          <div className="text-center py-[16px] border-r border-[#1e2640]">
            <p className="text-[20px] font-bold text-[#ff8a00] kis-amount">{stats?.openPositions || 0}</p>
            <p className="text-[11px] text-[#8c919a] mt-[4px]">보유종목</p>
          </div>
          <div className="text-center py-[16px] border-r border-[#1e2640]">
            <p className="text-[20px] font-bold text-[#00c853] kis-amount">{stats?.winRate || 0}%</p>
            <p className="text-[11px] text-[#8c919a] mt-[4px]">승률</p>
          </div>
          <div className="text-center py-[16px]">
            <p className="text-[20px] font-bold text-white kis-amount">{stats?.totalTrades || 0}</p>
            <p className="text-[11px] text-[#8c919a] mt-[4px]">총매매</p>
          </div>
        </div>
      </div>

      {/* 보유 포지션 */}
      {positions?.length > 0 && (
        <div className="kis-card overflow-hidden">
          <div className="px-[16px] py-[12px] flex items-center justify-between">
            <span className="text-[13px] font-bold text-white">보유종목</span>
            <span className="text-[11px] text-[#8c919a]">{positions.length}종목</span>
          </div>
          {positions.map((p) => (
            <div key={p.id} className="kis-row">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white truncate">{p.name}</p>
                <p className="text-[11px] text-[#8c919a] mt-[2px]">{p.code} · {p.qty}주</p>
              </div>
              <div className="text-right ml-[12px]">
                <p className="text-[14px] font-bold kis-amount text-white">{fmt(p.currentPrice)}</p>
                <p className={`text-[13px] font-bold kis-amount ${p.profitPct >= 0 ? "c-up" : "c-down"}`}>
                  {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(2)}%
                </p>
              </div>
              <div className="w-full mt-[8px]">
                <div className="kis-gauge">
                  <div
                    className={`kis-gauge-fill ${p.profitPct >= 0 ? "bg-[#ff2f2f]" : "bg-[#2b83ff]"}`}
                    style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#8c919a] mt-[3px]">
                  <span>손절 -3%</span>
                  <span>익절 +5%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="grid grid-cols-2 gap-[12px]">
        <button onClick={handleRefreshUniverse} disabled={refreshing} className="btn-kis-outline">
          {refreshing ? "갱신 중..." : "종목 갱신"}
        </button>
        <button onClick={handleScan} disabled={scanning} className="btn-kis">
          {scanning ? "스캔 중..." : "시그널 스캔"}
        </button>
      </div>
    </div>
  );
}
