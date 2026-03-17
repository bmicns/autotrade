function formatKRW(n) {
  return (n || 0).toLocaleString("ko-KR");
}

export default function Trades({ trades }) {
  return (
    <div className="px-6 pt-10 pb-8 space-y-8 animate-fade-up">
      <section>
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-2">이력</p>
        <h2 className="text-[34px] font-bold text-white tracking-tight leading-none">매매</h2>
      </section>

      {(!trades || trades.length === 0) ? (
        <div className="card py-20 text-center">
          <p className="text-white/20 text-[15px]">매매 이력 없음</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((t, i) => (
            <div key={i} className="card p-5">
              <div className="flex justify-between items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className={`shrink-0 px-2.5 py-[3px] rounded-full text-[11px] font-bold ${
                      t.action === "buy" ? "bg-[#30d158]/15 text-[#30d158]" : "bg-[#ff453a]/15 text-[#ff453a]"
                    }`}>
                      {t.action === "buy" ? "매수" : "매도"}
                    </span>
                    <span className="text-white font-semibold text-[17px] tracking-tight truncate">{t.name}</span>
                  </div>
                  <p className="text-white/30 text-[13px] mt-1.5">
                    {t.qty}주 × {formatKRW(t.price)}원 = {formatKRW(t.amount)}원
                  </p>
                  {t.strategy && (
                    <p className="text-[#ff9f0a] text-[11px] font-medium mt-1">{t.strategy}</p>
                  )}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span className={`inline-block px-3 py-1.5 rounded-full text-[11px] font-semibold ${
                    t.status === "executed" ? "bg-[#30d158]/15 text-[#30d158]" :
                    t.status === "error" ? "bg-[#ff453a]/15 text-[#ff453a]" :
                    "bg-[#ff9f0a]/15 text-[#ff9f0a]"
                  }`}>
                    {t.status === "executed" ? "체결" : t.status === "error" ? "실패" : t.status}
                  </span>
                  <p className="text-white/20 text-[11px] mt-1.5">
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
