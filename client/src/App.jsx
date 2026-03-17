import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";
import { useWebSocket } from "./lib/useWebSocket";
import BottomNav from "./components/BottomNav";
import Dashboard from "./components/Dashboard";
import Momentum from "./components/Momentum";
import Signals from "./components/Signals";
import Trades from "./components/Trades";
import Balance from "./components/Balance";

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [balance, setBalance] = useState(null);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [stats, setStats] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [b, sig, t, pos, hist, st] = await Promise.allSettled([
        api.getBalance(),
        api.getSignals(),
        api.getTrades(),
        api.getPositions(),
        api.getPositionHistory(),
        api.getStats(),
      ]);
      if (b.status === "fulfilled") setBalance(b.value);
      if (sig.status === "fulfilled") setSignals(sig.value);
      if (t.status === "fulfilled") setTrades(t.value);
      if (pos.status === "fulfilled") setPositions(pos.value);
      if (hist.status === "fulfilled") setClosedPositions(hist.value);
      if (st.status === "fulfilled") setStats(st.value);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 30000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === "signal") {
      setSignals((prev) => [msg.data, ...prev].slice(0, 200));
    } else if (msg.type === "trade" || msg.type === "scan_complete") {
      fetchAll();
    } else if (msg.type === "position_update") {
      setPositions((prev) =>
        prev.map((p) => (p.id === msg.data.id ? { ...p, ...msg.data } : p))
      );
    }
  }, [fetchAll]);

  useWebSocket(handleWsMessage);

  return (
    <div className="min-h-dvh pb-[80px]">
      {/* 한투 스타일 헤더 */}
      <header className="kis-header sticky top-0 z-40">
        <div className="flex items-center justify-between px-[30px] h-[52px]">
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-[18px] rounded-full bg-[#ff8a00]" />
            <span className="text-[16px] font-bold text-white tracking-tight">AutoTrade</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-[7px] w-[7px]">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00c853] opacity-60" />
              <span className="relative inline-flex rounded-full h-[7px] w-[7px] bg-[#00c853]" />
            </span>
            <span className="text-[#8c919a] text-[12px] font-medium">
              {process.env.NODE_ENV === "production" ? "실전투자" : "모의투자"}
            </span>
          </div>
        </div>
      </header>

      {tab === "dashboard" && (
        <Dashboard balance={balance} positions={positions} stats={stats} onRefresh={fetchAll} />
      )}
      {tab === "momentum" && (
        <Momentum positions={positions} closedPositions={closedPositions} onRefresh={fetchAll} />
      )}
      {tab === "signals" && <Signals signals={signals} onRefresh={fetchAll} />}
      {tab === "trades" && <Trades trades={trades} />}
      {tab === "balance" && <Balance balance={balance} />}

      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
