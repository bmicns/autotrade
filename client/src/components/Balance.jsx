function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Balance({ balance }) {
  return (
    <div className="px-6 pt-10 pb-8 space-y-10 animate-fade-up">
      <section>
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-2">자산</p>
        <h2 className="text-[34px] font-bold text-white tracking-tight leading-none">잔고</h2>
      </section>

      {/* Summary */}
      <section className="card-elevated p-6">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider">예수금</p>
            <p className="text-[24px] font-bold text-white tracking-tight mt-2">{formatKRW(balance?.cash)}</p>
            <p className="text-white/20 text-[13px]">원</p>
          </div>
          <div>
            <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider">평가금</p>
            <p className="text-[24px] font-bold text-white tracking-tight mt-2">{formatKRW(balance?.totalEval)}</p>
            <p className="text-white/20 text-[13px]">원</p>
          </div>
        </div>
      </section>

      {/* Holdings */}
      <section>
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-4 px-1">
          보유 종목 ({balance?.holdings?.length || 0})
        </p>
        {(!balance?.holdings || balance.holdings.length === 0) ? (
          <div className="card py-16 text-center">
            <p className="text-white/20 text-[15px]">보유 종목 없음</p>
          </div>
        ) : (
          <div className="space-y-3">
            {balance.holdings.map((h, i) => (
              <div key={i} className="card p-5">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-[17px] tracking-tight truncate">{h.name}</p>
                    <p className="text-white/30 text-[13px] mt-1">
                      {h.code} · {h.qty}주 · 평균 {formatKRW(h.avgPrice)}원
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-white font-semibold text-[17px] tracking-tight">{formatKRW(h.currentPrice)}원</p>
                    <p className={`text-[15px] font-bold tracking-tight mt-0.5 ${h.profitRate >= 0 ? "text-profit" : "text-loss"}`}>
                      {h.profitRate >= 0 ? "+" : ""}{h.profitRate?.toFixed(2)}%
                    </p>
                    <p className={`text-[11px] font-medium mt-0.5 ${h.profitAmount >= 0 ? "text-[#30d158]" : "text-[#ff453a]"}`}>
                      {h.profitAmount >= 0 ? "+" : ""}{formatKRW(h.profitAmount)}원
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
