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
    <div className="px-5 py-6 space-y-4">
      <h2 className="text-2xl font-bold text-white tracking-tight">시그널</h2>

      {(!signals || signals.length === 0) && (
        <div className="glass rounded-2xl py-16 text-center">
          <p className="text-[#86868b] text-sm">시그널 없음</p>
          <p className="text-[#86868b]/60 text-xs mt-1">대시보드에서 스캔을 실행하세요</p>
        </div>
      )}

      <div className="space-y-3">
        {signals?.map((sig, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold truncate">{sig.name}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    sig.action === "buy" ? "bg-[#34c759]/15 text-[#34c759]" :
                    sig.action === "sell" ? "bg-[#ff3b30]/15 text-[#ff3b30]" :
                    "bg-white/[0.06] text-[#86868b]"
                  }`}>
                    {sig.action === "buy" ? "매수" : sig.action === "sell" ? "매도" : "관망"}
                  </span>
                </div>
                <p className="text-[#86868b] text-xs mt-1">
                  {formatKRW(sig.price)}원 · 신뢰도 {sig.confidence}%
                  {sig.autoExecute ? " · 자동실행" : ""}
                </p>
                {sig.momentum && (
                  <p className="text-[#ff9f0a] text-xs mt-0.5 font-medium">
                    모멘텀 {sig.momentum.score}/5
                  </p>
                )}
              </div>
              {sig.action !== "hold" && !sig.autoExecute && (
                <button
                  onClick={() => handleApprove(sig)}
                  className={`shrink-0 ml-3 px-4 py-2 rounded-full text-xs font-bold active:scale-[0.97] transition-transform ${
                    sig.action === "buy"
                      ? "bg-[#34c759] text-black"
                      : "bg-[#ff3b30] text-white"
                  }`}
                >
                  승인
                </button>
              )}
            </div>

            {sig.strategies && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(sig.strategies).map(([key, val]) => (
                  <span key={key} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    val.signal === "buy" ? "bg-[#34c759]/10 text-[#34c759]" :
                    val.signal === "sell" ? "bg-[#ff3b30]/10 text-[#ff3b30]" :
                    "bg-white/[0.06] text-[#86868b]"
                  }`}>
                    {key.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
