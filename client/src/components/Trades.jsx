function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Trades({ trades }) {
  return (
    <div className="px-5 py-6 space-y-4">
      <h2 className="text-2xl font-bold text-white tracking-tight">매매이력</h2>

      {(!trades || trades.length === 0) && (
        <div className="glass rounded-2xl py-16 text-center">
          <p className="text-[#86868b] text-sm">매매 이력 없음</p>
        </div>
      )}

      <div className="space-y-3">
        {trades?.map((t, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    t.action === "buy" ? "bg-[#34c759]/15 text-[#34c759]" : "bg-[#ff3b30]/15 text-[#ff3b30]"
                  }`}>
                    {t.action === "buy" ? "매수" : "매도"}
                  </span>
                  <span className="text-white font-semibold truncate">{t.name}</span>
                </div>
                <p className="text-[#86868b] text-xs mt-1">
                  {t.qty}주 × {formatKRW(t.price)}원 = {formatKRW(t.amount)}원
                </p>
                {t.strategy && (
                  <p className="text-[#ff9f0a] text-[10px] font-medium mt-0.5">{t.strategy}</p>
                )}
              </div>
              <div className="text-right shrink-0 ml-3">
                <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                  t.status === "executed" ? "bg-[#34c759]/15 text-[#34c759]" :
                  t.status === "error" ? "bg-[#ff3b30]/15 text-[#ff3b30]" :
                  "bg-[#ff9f0a]/15 text-[#ff9f0a]"
                }`}>
                  {t.status === "executed" ? "체결" : t.status === "error" ? "실패" : t.status}
                </span>
                <p className="text-[#86868b] text-[10px] mt-1">
                  {new Date(t.timestamp).toLocaleTimeString("ko-KR")}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
