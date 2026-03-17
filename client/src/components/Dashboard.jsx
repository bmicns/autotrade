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

  return (
    <div className="p-4 space-y-4">
      {/* 자산 요약 */}
      <div className="bg-[#0f1629] rounded-2xl p-4 border border-[#1a2540]">
        <p className="text-[#64748b] text-sm mb-1">총 자산</p>
        <p className="text-2xl font-bold text-white">
          {formatKRW((balance?.cash || 0) + (balance?.totalEval || 0))}원
        </p>
        <div className="flex gap-4 mt-3 text-sm">
          <div>
            <span className="text-[#64748b]">예수금 </span>
            <span className="text-white">{formatKRW(balance?.cash)}원</span>
          </div>
          <div>
            <span className="text-[#64748b]">평가금 </span>
            <span className="text-white">{formatKRW(balance?.totalEval)}원</span>
          </div>
        </div>
      </div>

      {/* 모멘텀 수익 요약 */}
      <div className="bg-[#0f1629] rounded-2xl p-4 border border-[#1a2540]">
        <p className="text-[#64748b] text-sm mb-2">모멘텀 전략</p>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <p className="text-[#64748b]">열린 포지션</p>
            <p className="text-xl font-bold text-[#4a9eff]">{stats?.openPositions || 0}</p>
          </div>
          <div>
            <p className="text-[#64748b]">승률</p>
            <p className="text-xl font-bold text-[#34d399]">{stats?.winRate || 0}%</p>
          </div>
          <div>
            <p className="text-[#64748b]">총 수익</p>
            <p className={`text-xl font-bold ${(stats?.totalProfit || 0) >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
              {formatKRW(stats?.totalProfit)}원
            </p>
          </div>
        </div>
      </div>

      {/* 열린 포지션 목록 */}
      {positions?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-[#64748b] px-1">활성 포지션</p>
          {positions.map((p) => (
            <div key={p.id} className="bg-[#0f1629] rounded-xl p-3 border border-[#1a2540]">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-white">{p.name}</p>
                  <p className="text-xs text-[#64748b]">{p.code} · {p.qty}주</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${p.profitPct >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
                    {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                  </p>
                  <p className="text-xs text-[#64748b]">{formatKRW(p.currentPrice)}원</p>
                </div>
              </div>
              {/* 수익률 게이지 바 */}
              <div className="mt-2 h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${p.profitPct >= 0 ? "bg-[#34d399]" : "bg-[#f87171]"}`}
                  style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[#64748b] mt-0.5">
                <span>-3% 손절</span>
                <span>+5% 익절</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleRefreshUniverse}
          disabled={refreshing}
          className="bg-[#1a2540] text-[#4a9eff] py-3 rounded-xl text-sm font-medium active:scale-95 transition disabled:opacity-50"
        >
          {refreshing ? "갱신 중..." : "🔍 종목 갱신"}
        </button>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="bg-[#4a9eff] text-white py-3 rounded-xl text-sm font-medium active:scale-95 transition disabled:opacity-50"
        >
          {scanning ? "스캔 중..." : "📡 시그널 스캔"}
        </button>
      </div>
    </div>
  );
}
