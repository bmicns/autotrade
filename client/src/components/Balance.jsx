function fmt(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Balance({ balance }) {
  return (
    <div className="page-padding space-y-[20px]">
      <h2 className="text-[18px] font-bold text-white">잔고</h2>

      {/* 자산 요약 */}
      <div className="kis-card overflow-hidden">
        <div className="px-[16px] py-[12px]">
          <span className="text-[13px] font-bold text-white">자산현황</span>
        </div>
        <div className="h-px bg-[#1e2640]" />
        <div className="grid grid-cols-2">
          <div className="p-[16px] border-r border-[#1e2640]">
            <p className="text-[11px] text-[#8c919a] mb-[6px]">예수금</p>
            <p className="text-[20px] font-bold text-white kis-amount">{fmt(balance?.cash)}</p>
            <p className="text-[11px] text-[#8c919a]">원</p>
          </div>
          <div className="p-[16px]">
            <p className="text-[11px] text-[#8c919a] mb-[6px]">주식평가</p>
            <p className="text-[20px] font-bold text-white kis-amount">{fmt(balance?.totalEval)}</p>
            <p className="text-[11px] text-[#8c919a]">원</p>
          </div>
        </div>
      </div>

      {/* 보유 종목 */}
      <div className="kis-card overflow-hidden">
        <div className="px-[16px] py-[12px] flex items-center justify-between">
          <span className="text-[13px] font-bold text-white">보유종목</span>
          <span className="text-[11px] text-[#8c919a]">{balance?.holdings?.length || 0}종목</span>
        </div>

        {(!balance?.holdings || balance.holdings.length === 0) ? (
          <div className="py-[40px] text-center border-t border-[#1e2640]">
            <p className="text-[#8c919a] text-[13px]">보유 종목 없음</p>
          </div>
        ) : (
          <>
            {/* 테이블 헤더 */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-[8px] px-[16px] py-[8px] bg-[#0d1225] text-[10px] text-[#8c919a] font-semibold border-t border-[#1e2640]">
              <span>종목명</span>
              <span className="text-right w-[70px]">현재가</span>
              <span className="text-right w-[60px]">수익률</span>
            </div>
            {balance.holdings.map((h, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-[8px] items-center px-[16px] py-[12px] border-t border-[#1e2640]">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-white truncate">{h.name}</p>
                  <p className="text-[11px] text-[#8c919a] mt-[1px]">{h.code} · {h.qty}주 · 평균 {fmt(h.avgPrice)}</p>
                </div>
                <div className="text-right w-[70px]">
                  <p className="text-[14px] font-bold text-white kis-amount">{fmt(h.currentPrice)}</p>
                </div>
                <div className="text-right w-[60px]">
                  <p className={`text-[14px] font-bold kis-amount ${h.profitRate >= 0 ? "c-up" : "c-down"}`}>
                    {h.profitRate >= 0 ? "+" : ""}{h.profitRate?.toFixed(2)}%
                  </p>
                  <p className={`text-[10px] font-medium kis-amount ${h.profitAmount >= 0 ? "c-up" : "c-down"}`}>
                    {h.profitAmount >= 0 ? "+" : ""}{fmt(h.profitAmount)}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
