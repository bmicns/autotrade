const tabs = [
  { id: "dashboard", label: "홈", icon: "home" },
  { id: "momentum", label: "모멘텀", icon: "trending" },
  { id: "signals", label: "시그널", icon: "signal" },
  { id: "trades", label: "매매", icon: "swap" },
  { id: "balance", label: "잔고", icon: "wallet" },
];

const icons = {
  home: (a) => (
    <svg width="22" height="22" fill={a ? "#ff8a00" : "none"} viewBox="0 0 24 24" stroke={a ? "#ff8a00" : "#8c919a"} strokeWidth={a ? 0 : 1.8}>
      {a
        ? <path d="M4 12.5l8-8 8 8V20a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1V12.5z" />
        : <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      }
    </svg>
  ),
  trending: (a) => (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={a ? "#ff8a00" : "#8c919a"} strokeWidth={a ? 2.2 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  signal: (a) => (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={a ? "#ff8a00" : "#8c919a"} strokeWidth={a ? 2.2 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M12 12h.008v.007H12V12z" />
    </svg>
  ),
  swap: (a) => (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={a ? "#ff8a00" : "#8c919a"} strokeWidth={a ? 2.2 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  wallet: (a) => (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={a ? "#ff8a00" : "#8c919a"} strokeWidth={a ? 2.2 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  ),
};

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="kis-tabbar fixed bottom-0 left-0 right-0 z-50">
      <div className="flex justify-around pt-2 pb-[calc(6px+env(safe-area-inset-bottom))]">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex flex-col items-center gap-[3px] min-w-[52px] transition-colors ${
                isActive ? "text-[#ff8a00]" : "text-[#8c919a]"
              }`}
            >
              {icons[t.icon](isActive)}
              <span className="text-[10px] font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
