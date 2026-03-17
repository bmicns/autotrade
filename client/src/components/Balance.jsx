function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Balance({ balance }) {
  return (
    <div className="px-5 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-white tracking-tight">잔고</h2>

      {/* 요약 */}
      <div className="glass rounded-2xl p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[#86868b] text-xs font-medium">예수금</p>
            <p className="text-xl font-bold text-white tracking-tight mt-1">{formatKRW(balance?.cash)}<span className="text-sm ml-0.5">원</span></p>
          </div>
          <div>
            <p className="text-[#86868b] text-xs font-medium">평가금</p>
            <p className="text-xl font-bold text-white tracking-tight mt-1">{formatKRW(balance?.totalEval)}<span className="text-sm ml-0.5">원</span></p>
          </div>
        </div>
      </div>

      {/* 보유 종목 */}
      <div>
        <p className="text-[#86868b] text-xs font-medium uppercase tracking-wider px-1 mb-3">
          보유 종목 ({balance?.holdings?.length || 0})
        </p>
        {(!balance?.holdings || balance.holdings.length === 0) && (
          <div className="glass rounded-2xl py-12 text-center">
            <p className="text-[#86868b] text-sm">보유 종목 없음</p>
          </div>
        )}
        <div className="space-y-3">
          {balance?.holdings?.map((h, i) => (
            <div key={i} className="glass rounded-2xl p-4">
              <div className="flex justify-between items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{h.name}</p>
                  <p className="text-[#86868b] text-xs mt-0.5">
                    {h.code} · {h.qty}주 · 평균 {formatKRW(h.avgPrice)}원
                  </p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-white font-semibold">{formatKRW(h.currentPrice)}원</p>
                  <p className={`text-sm font-bold tracking-tight ${h.profitRate >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"}`}>
                    {h.profitRate >= 0 ? "+" : ""}{h.profitRate?.toFixed(2)}%
                  </p>
                  <p className={`text-[10px] font-medium ${h.profitAmount >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"}`}>
                    {h.profitAmount >= 0 ? "+" : ""}{formatKRW(h.profitAmount)}원
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
