import { api } from "../lib/api";

function fmt(n) {
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
    <div className="p-[30px] space-y-[20px]">
      <h2 className="text-[18px] font-bold text-white">시그널</h2>

      {(!signals || signals.length === 0) ? (
        <div className="kis-card py-[50px] text-center">
          <p className="text-[#8c919a] text-[13px]">시그널 없음</p>
          <p className="text-[#8c919a]/60 text-[11px] mt-[4px]">홈에서 스캔을 실행하세요</p>
        </div>
      ) : (
        <div className="kis-card overflow-hidden">
          <div className="px-[16px] py-[12px]">
            <span className="text-[13px] font-bold text-white">분석 결과</span>
            <span className="text-[11px] text-[#8c919a] ml-[8px]">{signals.length}건</span>
          </div>
          {signals.map((sig, i) => (
            <div key={i} className="px-[16px] py-[14px] border-t border-[#1e2640]">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[8px]">
                    <p className="text-[14px] font-semibold text-white truncate">{sig.name}</p>
                    <span className={`badge ${
                      sig.action === "buy" ? "bg-up c-up" :
                      sig.action === "sell" ? "bg-down c-down" :
                      "bg-[#1e2640] text-[#8c919a]"
                    }`}>
                      {sig.action === "buy" ? "매수" : sig.action === "sell" ? "매도" : "관망"}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8c919a] mt-[4px]">
                    {fmt(sig.price)}원 · 신뢰도 {sig.confidence}%
                    {sig.autoExecute ? " · 자동" : ""}
                  </p>
                  {sig.momentum && (
                    <span className="badge bg-[#ff8a00]/15 text-[#ff8a00] mt-[4px]">
                      모멘텀 {sig.momentum.score}/5
                    </span>
                  )}
                </div>
                {sig.action !== "hold" && !sig.autoExecute && (
                  <button
                    onClick={() => handleApprove(sig)}
                    className={`shrink-0 ml-[12px] px-[14px] py-[8px] rounded-[6px] text-[12px] font-bold active:scale-[0.98] transition-transform ${
                      sig.action === "buy"
                        ? "bg-[#ff2f2f] text-white"
                        : "bg-[#2b83ff] text-white"
                    }`}
                  >
                    승인
                  </button>
                )}
              </div>

              {sig.strategies && (
                <div className="mt-[10px] flex flex-wrap gap-[6px]">
                  {Object.entries(sig.strategies).map(([key, val]) => (
                    <span key={key} className={`badge ${
                      val.signal === "buy" ? "bg-up c-up" :
                      val.signal === "sell" ? "bg-down c-down" :
                      "bg-[#1e2640] text-[#8c919a]"
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
