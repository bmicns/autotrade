import { useState } from "react";
import { api } from "../lib/api";

function formatKRW(n) {
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

  const totalAsset = (balance?.cash || 0) + (balance?.totalEval || 0);

  return (
    <div className="px-5 py-6 space-y-6">
      {/* 총 자산 */}
      <div className="glass rounded-2xl p-6">
        <p className="text-[#86868b] text-sm font-medium tracking-tight">총 자산</p>
        <p className="text-[34px] font-bold text-white tracking-tight leading-tight mt-1">
          {formatKRW(totalAsset)}<span className="text-lg ml-0.5">원</span>
        </p>
        <div className="flex gap-6 mt-4">
          <div>
            <p className="text-[#86868b] text-xs">예수금</p>
            <p className="text-white text-sm font-semibold mt-0.5">{formatKRW(balance?.cash)}원</p>
          </div>
          <div>
            <p className="text-[#86868b] text-xs">평가금</p>
            <p className="text-white text-sm font-semibold mt-0.5">{formatKRW(balance?.totalEval)}원</p>
          </div>
        </div>
      </div>

      {/* 모멘텀 통계 */}
      <div className="glass rounded-2xl p-6">
        <p className="text-[#86868b] text-sm font-medium tracking-tight mb-4">모멘텀 전략</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-[28px] font-bold text-[#0a84ff] tracking-tight">{stats?.openPositions || 0}</p>
            <p className="text-[#86868b] text-xs mt-1">포지션</p>
          </div>
          <div className="text-center">
            <p className="text-[28px] font-bold text-[#34c759] tracking-tight">{stats?.winRate || 0}%</p>
            <p className="text-[#86868b] text-xs mt-1">승률</p>
          </div>
          <div className="text-center">
            <p className={`text-[28px] font-bold tracking-tight ${(stats?.totalProfit || 0) >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"}`}>
              {formatKRW(stats?.totalProfit)}
            </p>
            <p className="text-[#86868b] text-xs mt-1">총 수익</p>
          </div>
        </div>
      </div>

      {/* 활성 포지션 */}
      {positions?.length > 0 && (
        <div>
          <p className="text-[#86868b] text-xs font-medium uppercase tracking-wider px-1 mb-3">활성 포지션</p>
          <div className="space-y-3">
            {positions.map((p) => (
              <div key={p.id} className="glass rounded-2xl p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white font-semibold">{p.name}</p>
                    <p className="text-[#86868b] text-xs mt-0.5">{p.code} · {p.qty}주</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold tracking-tight ${p.profitPct >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"}`}>
                      {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                    </p>
                    <p className="text-[#86868b] text-xs mt-0.5">{formatKRW(p.currentPrice)}원</p>
                  </div>
                </div>
                <div className="mt-3 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${p.profitPct >= 0 ? "bg-[#34c759]" : "bg-[#ff3b30]"}`}
                    style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#86868b] mt-1">
                  <span>-3% 손절</span>
                  <span>+5% 익절</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleRefreshUniverse}
          disabled={refreshing}
          className="glass py-3.5 rounded-xl text-sm font-medium text-[#0a84ff] active:scale-[0.97] transition-transform disabled:opacity-40"
        >
          {refreshing ? "갱신 중..." : "종목 갱신"}
        </button>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="bg-[#0a84ff] py-3.5 rounded-xl text-sm font-medium text-white active:scale-[0.97] transition-transform disabled:opacity-40"
        >
          {scanning ? "스캔 중..." : "시그널 스캔"}
        </button>
      </div>
    </div>
  );
}
