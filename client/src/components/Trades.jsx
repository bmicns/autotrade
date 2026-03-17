function fmt(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Trades({ trades }) {
  return (
    <div className="p-[30px] space-y-[20px]">
      <h2 className="text-[18px] font-bold text-white">매매이력</h2>

      {(!trades || trades.length === 0) ? (
        <div className="kis-card py-[50px] text-center">
          <p className="text-[#8c919a] text-[13px]">매매 이력 없음</p>
        </div>
      ) : (
        <div className="kis-card overflow-hidden">
          <div className="px-[16px] py-[12px] flex items-center justify-between">
            <span className="text-[13px] font-bold text-white">체결 내역</span>
            <span className="text-[11px] text-[#8c919a]">{trades.length}건</span>
          </div>
          {trades.map((t, i) => (
            <div key={i} className="px-[16px] py-[14px] border-t border-[#1e2640]">
              <div className="flex justify-between items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[8px]">
                    <span className={`badge ${
                      t.action === "buy" ? "bg-up c-up" : "bg-down c-down"
                    }`}>
                      {t.action === "buy" ? "매수" : "매도"}
                    </span>
                    <span className="text-[14px] font-semibold text-white truncate">{t.name}</span>
                  </div>
                  <p className="text-[12px] text-[#8c919a] mt-[4px]">
                    {t.qty}주 × {fmt(t.price)} = {fmt(t.amount)}원
                  </p>
                  {t.strategy && (
                    <span className="badge bg-[#ff8a00]/15 text-[#ff8a00] mt-[4px]">{t.strategy}</span>
                  )}
                </div>
                <div className="text-right shrink-0 ml-[12px]">
                  <span className={`badge ${
                    t.status === "executed" ? "bg-[#00c853]/15 text-[#00c853]" :
                    t.status === "error" ? "bg-up c-up" :
                    "bg-[#ff8a00]/15 text-[#ff8a00]"
                  }`}>
                    {t.status === "executed" ? "체결" : t.status === "error" ? "실패" : t.status}
                  </span>
                  <p className="text-[11px] text-[#8c919a] mt-[4px]">
                    {new Date(t.timestamp).toLocaleTimeString("ko-KR")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
