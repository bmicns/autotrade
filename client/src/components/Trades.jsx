function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Trades({ trades }) {
  return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-bold text-white mb-2">매매이력</h2>
      {(!trades || trades.length === 0) && (
        <p className="text-center text-[#64748b] text-sm py-12">매매 이력 없음</p>
      )}
      {trades?.map((t, i) => (
        <div key={i} className="bg-[#0f1629] rounded-xl p-3 border border-[#1a2540]">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  t.action === "buy" ? "bg-[#34d399]/20 text-[#34d399]" : "bg-[#f87171]/20 text-[#f87171]"
                }`}>
                  {t.action === "buy" ? "매수" : "매도"}
                </span>
                <span className="text-white font-medium">{t.name}</span>
              </div>
              <p className="text-xs text-[#64748b] mt-1">
                {t.qty}주 × {formatKRW(t.price)}원 = {formatKRW(t.amount)}원
              </p>
              {t.strategy && <p className="text-xs text-[#fbbf24]">{t.strategy}</p>}
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-0.5 rounded ${
                t.status === "executed" ? "bg-[#34d399]/20 text-[#34d399]" :
                t.status === "error" ? "bg-[#f87171]/20 text-[#f87171]" :
                "bg-[#fbbf24]/20 text-[#fbbf24]"
              }`}>
                {t.status === "executed" ? "체결" : t.status === "error" ? "실패" : t.status}
              </span>
              <p className="text-[10px] text-[#64748b] mt-1">
                {new Date(t.timestamp).toLocaleTimeString("ko-KR")}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
