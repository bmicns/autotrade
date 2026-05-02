"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { usePendingSignals } from "@/hooks/usePendingSignals";
import { ManualBuyForm } from "./manual-buy-form";
import { PendingSignalList } from "./pending-signal-list";

export function SignalTab() {
  const kisConnected = useAppStore((s) => s.kisConnected);
  const kisConfig = useAppStore((s) => s.kisConfig);
  const kisConfigured = !!(kisConfig.appKey && kisConfig.appSecret && kisConfig.accountNo);

  const { signals, recentSignals, filterLogs, fetchSignals, fetchEngineLog, expireSignal, rejectSignal } = usePendingSignals();

  useEffect(() => {
    fetchSignals();
    fetchEngineLog();
  }, [fetchSignals, fetchEngineLog]);

  return (
    <div style={{ padding: "16px 20px" }}>
      <ManualBuyForm
        kisConnected={kisConnected}
        kisConfigured={kisConfigured}
        onDone={fetchSignals}
      />
      <PendingSignalList
        signals={signals}
        recentSignals={recentSignals}
        filterLogs={filterLogs}
        fetchSignals={fetchSignals}
        expireSignal={expireSignal}
        rejectSignal={rejectSignal}
      />
    </div>
  );
}
