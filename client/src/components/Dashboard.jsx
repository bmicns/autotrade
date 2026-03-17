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
    <div className="px-6 pt-10 pb-8 space-y-10 animate-fade-up">
      {/* Hero — Total Asset */}
      <section className="text-center">
        <p className="text-white/40 text-[13px] font-medium tracking-wide uppercase mb-3">총 자산</p>
        <p className="hero-number">{formatKRW(totalAsset)}</p>
        <p className="text-white/30 text-[15px] font-medium mt-1">원</p>
        <div className="flex justify-center gap-8 mt-6">
          <div>
            <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider">예수금</p>
            <p className="text-white/80 text-[17px] font-semibold tracking-tight mt-1">{formatKRW(balance?.cash)}</p>
          </div>
          <div className="w-px bg-white/[0.06]" />
          <div>
            <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider">평가금</p>
            <p className="text-white/80 text-[17px] font-semibold tracking-tight mt-1">{formatKRW(balance?.totalEval)}</p>
          </div>
        </div>
      </section>

      {/* Momentum Stats */}
      <section className="card-elevated p-6">
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-5">모멘텀 전략</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-[32px] font-bold tracking-tight text-[#0a84ff]">{stats?.openPositions || 0}</p>
            <p className="text-white/30 text-[11px] mt-1">포지션</p>
          </div>
          <div className="text-center">
            <p className="text-[32px] font-bold tracking-tight text-profit">{stats?.winRate || 0}%</p>
            <p className="text-white/30 text-[11px] mt-1">승률</p>
          </div>
          <div className="text-center">
            <p className={`text-[32px] font-bold tracking-tight ${(stats?.totalProfit || 0) >= 0 ? "text-profit" : "text-loss"}`}>
              {formatKRW(stats?.totalProfit)}
            </p>
            <p className="text-white/30 text-[11px] mt-1">총 수익</p>
          </div>
        </div>
      </section>

      {/* Active Positions */}
      {positions?.length > 0 && (
        <section>
          <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-4 px-1">
            활성 포지션
          </p>
          <div className="space-y-3">
            {positions.map((p) => (
              <div key={p.id} className="card p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-semibold text-[17px] tracking-tight">{p.name}</p>
                    <p className="text-white/30 text-[13px] mt-1">{p.code} · {p.qty}주</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[24px] font-bold tracking-tight ${p.profitPct >= 0 ? "text-profit" : "text-loss"}`}>
                      {p.profitPct >= 0 ? "+" : ""}{p.profitPct?.toFixed(1)}%
                    </p>
                    <p className="text-white/30 text-[13px] mt-1">{formatKRW(p.currentPrice)}원</p>
                  </div>
                </div>
                <div className="gauge-track mt-4">
                  <div
                    className={`gauge-fill ${p.profitPct >= 0 ? "bg-[#30d158]" : "bg-[#ff453a]"}`}
                    style={{ width: `${Math.min(Math.abs(p.profitPct) * 20, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-white/20 mt-1.5">
                  <span>-3% 손절</span>
                  <span>+5% 익절</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action Buttons */}
      <section className="grid grid-cols-2 gap-3">
        <button onClick={handleRefreshUniverse} disabled={refreshing} className="btn-secondary">
          {refreshing ? "갱신 중..." : "종목 갱신"}
        </button>
        <button onClick={handleScan} disabled={scanning} className="btn-blue">
          {scanning ? "스캔 중..." : "시그널 스캔"}
        </button>
      </section>
    </div>
  );
}
