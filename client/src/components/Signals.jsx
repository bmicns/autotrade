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
    <div className="px-6 pt-10 pb-8 space-y-8 animate-fade-up">
      <section>
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-2">분석</p>
        <h2 className="text-[34px] font-bold text-white tracking-tight leading-none">시그널</h2>
      </section>

      {(!signals || signals.length === 0) ? (
        <div className="card py-20 text-center">
          <p className="text-white/20 text-[15px]">시그널 없음</p>
          <p className="text-white/10 text-[13px] mt-2">대시보드에서 스캔을 실행하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((sig, i) => (
            <div key={i} className="card p-5">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="text-white font-semibold text-[17px] tracking-tight truncate">{sig.name}</p>
                    <span className={`shrink-0 px-2.5 py-[3px] rounded-full text-[11px] font-bold ${
                      sig.action === "buy" ? "bg-[#30d158]/15 text-[#30d158]" :
                      sig.action === "sell" ? "bg-[#ff453a]/15 text-[#ff453a]" :
                      "bg-white/[0.06] text-white/30"
                    }`}>
                      {sig.action === "buy" ? "매수" : sig.action === "sell" ? "매도" : "관망"}
                    </span>
                  </div>
                  <p className="text-white/30 text-[13px] mt-1.5">
                    {formatKRW(sig.price)}원 · 신뢰도 {sig.confidence}%
                    {sig.autoExecute ? " · 자동실행" : ""}
                  </p>
                  {sig.momentum && (
                    <p className="text-[#ff9f0a] text-[12px] font-medium mt-1">
                      모멘텀 {sig.momentum.score}/5
                    </p>
                  )}
                </div>
                {sig.action !== "hold" && !sig.autoExecute && (
                  <button
                    onClick={() => handleApprove(sig)}
                    className={`shrink-0 ml-4 px-5 py-2.5 rounded-full text-[13px] font-bold active:scale-[0.97] transition-transform ${
                      sig.action === "buy"
                        ? "bg-[#30d158] text-black"
                        : "bg-[#ff453a] text-white"
                    }`}
                  >
                    승인
                  </button>
                )}
              </div>

              {sig.strategies && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(sig.strategies).map(([key, val]) => (
                    <span key={key} className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                      val.signal === "buy" ? "bg-[#30d158]/10 text-[#30d158]" :
                      val.signal === "sell" ? "bg-[#ff453a]/10 text-[#ff453a]" :
                      "bg-white/[0.04] text-white/20"
                    }`}>
                      {key.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
