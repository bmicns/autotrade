import { api } from "../lib/api";

function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Signals({ signals, onRefresh }) {
  async function handleApprove(sig) {
    try {
      await api.approve({
        code: sig.code, name: sig.name,
        price: sig.price, action: sig.action,
        confidence: sig.confidence,
      });
      onRefresh();
    } catch {}
  }

  return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-bold text-white mb-2">시그널</h2>
      {(!signals || signals.length === 0) && (
        <p className="text-center text-[#64748b] text-sm py-12">시그널 없음 — 스캔을 실행하세요</p>
      )}
      {signals?.map((sig, i) => (
        <div key={i} className="bg-[#0f1629] rounded-xl p-3 border border-[#1a2540]">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-white">{sig.name}</p>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  sig.action === "buy" ? "bg-[#34d399]/20 text-[#34d399]" :
                  sig.action === "sell" ? "bg-[#f87171]/20 text-[#f87171]" :
                  "bg-[#64748b]/20 text-[#64748b]"
                }`}>
                  {sig.action === "buy" ? "매수" : sig.action === "sell" ? "매도" : "관망"}
                </span>
              </div>
              <p className="text-xs text-[#64748b] mt-1">
                {formatKRW(sig.price)}원 · 신뢰도 {sig.confidence}%
                {sig.autoExecute ? " · ⚡자동" : ""}
              </p>
              {sig.momentum && (
                <p className="text-xs text-[#fbbf24] mt-0.5">
                  모멘텀 {sig.momentum.score}/5
                </p>
              )}
            </div>
            {sig.action !== "hold" && !sig.autoExecute && (
              <button
                onClick={() => handleApprove(sig)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 ${
                  sig.action === "buy" ? "bg-[#34d399] text-black" : "bg-[#f87171] text-white"
                }`}
              >
                승인
              </button>
            )}
          </div>
          {/* 전략 상세 */}
          {sig.strategies && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(sig.strategies).map(([key, val]) => (
                <span key={key} className={`px-1.5 py-0.5 rounded text-[10px] ${
                  val.signal === "buy" ? "bg-[#34d399]/10 text-[#34d399]" :
                  val.signal === "sell" ? "bg-[#f87171]/10 text-[#f87171]" :
                  "bg-[#1a2540] text-[#64748b]"
                }`}>
                  {key.toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
