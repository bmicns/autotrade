"use client";

import { useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { usePendingSignals } from "@/hooks/usePendingSignals";
import { ManualBuyForm } from "./manual-buy-form";
import { ManualSellForm } from "./manual-sell-form";
import { PendingSignalList } from "./pending-signal-list";

interface Props {
  marketMode?: "kr" | "us";
}

export function SignalTab({ marketMode = "kr" }: Props) {
  const kisConnected = useAppStore((s) => s.kisConnected);
  const kisConfig = useAppStore((s) => s.kisConfig);
  const fetchKISData = useAppStore((s) => s.fetchKISData);
  const kisConfigured = !!(kisConfig.appKey && kisConfig.appSecret && kisConfig.accountNo);
  const { signals, recentSignals, filterLogs, fetchSignals, fetchEngineLog, expireSignal, rejectSignal, bulkBuySignals, bulkApproveSignals } = usePendingSignals();

  useEffect(() => {
    fetchSignals();
    fetchEngineLog();
  }, [fetchSignals, fetchEngineLog]);

  const refreshAfterManualAction = async () => {
    await Promise.all([
      fetchSignals(),
      fetchEngineLog(),
      fetchKISData(),
    ]);
  };

  return (
    <div style={{ padding: "16px 20px" }}>
      <ManualBuyForm
        kisConnected={kisConnected}
        kisConfigured={kisConfigured}
        onDone={fetchSignals}
        marketMode={marketMode}
      />
      <ManualSellForm
        kisConfigured={kisConfigured}
        onDone={refreshAfterManualAction}
        marketMode={marketMode}
      />
      {marketMode === "kr" ? (
        <PendingSignalList
          signals={signals}
          recentSignals={recentSignals}
          filterLogs={filterLogs}
          fetchSignals={fetchSignals}
          expireSignal={expireSignal}
          rejectSignal={rejectSignal}
          bulkBuySignals={bulkBuySignals}
          bulkApproveSignals={bulkApproveSignals}
        />
      ) : (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>해외 신호승인</div>
          <div style={{ marginTop: 6, fontSize: 12, color: COLORS.dim }}>
            해외는 현재 승인 대기 큐 대신 즉시 주문 중심으로 운영합니다.
          </div>
        </div>
      )}
    </div>
  );
}
