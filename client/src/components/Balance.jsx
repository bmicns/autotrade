function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Balance({ balance }) {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-white">잔고</h2>

      {/* 요약 */}
      <div className="bg-[#0f1629] rounded-2xl p-4 border border-[#1a2540]">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[#64748b] text-sm">예수금</p>
            <p className="text-lg font-bold text-white">{formatKRW(balance?.cash)}원</p>
          </div>
          <div>
            <p className="text-[#64748b] text-sm">평가금</p>
            <p className="text-lg font-bold text-white">{formatKRW(balance?.totalEval)}원</p>
          </div>
        </div>
      </div>

      {/* 보유 종목 */}
      <div className="space-y-2">
        <p className="text-sm text-[#64748b] px-1">보유 종목 ({balance?.holdings?.length || 0})</p>
        {(!balance?.holdings || balance.holdings.length === 0) && (
          <p className="text-center text-[#64748b] text-sm py-8">보유 종목 없음</p>
        )}
        {balance?.holdings?.map((h, i) => (
          <div key={i} className="bg-[#0f1629] rounded-xl p-3 border border-[#1a2540]">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-white">{h.name}</p>
                <p className="text-xs text-[#64748b]">
                  {h.code} · {h.qty}주 · 평균 {formatKRW(h.avgPrice)}원
                </p>
              </div>
              <div className="text-right">
                <p className="text-white font-medium">{formatKRW(h.currentPrice)}원</p>
                <p className={`text-sm font-bold ${h.profitRate >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
                  {h.profitRate >= 0 ? "+" : ""}{h.profitRate?.toFixed(2)}%
                </p>
                <p className={`text-xs ${h.profitAmount >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
                  {h.profitAmount >= 0 ? "+" : ""}{formatKRW(h.profitAmount)}원
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
