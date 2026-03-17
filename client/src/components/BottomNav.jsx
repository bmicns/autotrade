const tabs = [
  { id: "dashboard", label: "대시보드", icon: "📊" },
  { id: "momentum", label: "모멘텀", icon: "🚀" },
  { id: "signals", label: "시그널", icon: "📡" },
  { id: "trades", label: "매매이력", icon: "📋" },
  { id: "balance", label: "잔고", icon: "💰" },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0f1629] border-t border-[#1a2540] flex justify-around py-1 pb-[env(safe-area-inset-bottom)] z-50">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-col items-center min-w-[56px] py-2 px-1 text-xs transition-colors ${
            active === t.id ? "text-[#4a9eff]" : "text-[#64748b]"
          }`}
        >
          <span className="text-lg mb-0.5">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
