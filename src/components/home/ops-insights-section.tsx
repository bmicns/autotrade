"use client";

import { COLORS } from "@/lib/constants";
import type {
  DirectOrderLog,
  DirectOrderNoteStat,
  EngineControlSnapshot,
  NewsStats,
  OverseasHoldingSummary,
  SurgeStats,
} from "./home-types";

interface HoldingRiskAlert {
  code: string;
  name: string;
  title: string;
  time: string;
}

interface HoldingNewsAlertNoteStat {
  note: string;
  count: number;
  lastRunAt: string;
  recentStocks: string[];
}

interface HoldingNewsAlertStockStat {
  stock: string;
  count: number;
  notes: string[];
  lastRunAt: string;
}

interface OpsInsightsSectionProps {
  isUsView: boolean;
  overseasSummary: OverseasHoldingSummary | null;
  surgeStats: SurgeStats | null;
  directOrderNoteStats: DirectOrderNoteStat[];
  directOrderNoteAlerts: DirectOrderNoteStat[];
  directOrderAlertRecentTrades: Map<string, DirectOrderLog[]>;
  topDirectOrderRecentTrades: DirectOrderLog[];
  engineControl: EngineControlSnapshot | null;
  combinedHoldingRiskAlerts: HoldingRiskAlert[];
  newsStats: NewsStats | null;
  holdingRiskAlertLoading: boolean;
  holdingRiskAlertResult: string | null;
  triggerHoldingRiskAlert: () => void;
  holdingNewsAlertNoteStats: HoldingNewsAlertNoteStat[];
  holdingNewsAlertStockStats: HoldingNewsAlertStockStat[];
}

export function OpsInsightsSection({
  isUsView,
  overseasSummary,
  surgeStats,
  directOrderNoteStats,
  directOrderNoteAlerts,
  directOrderAlertRecentTrades,
  topDirectOrderRecentTrades,
  engineControl,
  combinedHoldingRiskAlerts,
  newsStats,
  holdingRiskAlertLoading,
  holdingRiskAlertResult,
  triggerHoldingRiskAlert,
  holdingNewsAlertNoteStats,
  holdingNewsAlertStockStats,
}: OpsInsightsSectionProps) {
  return (
    <>
      {isUsView && overseasSummary?.configured && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8", letterSpacing: "0.05em", textTransform: "uppercase" }}>해외 평가 요약</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>
              {overseasSummary.connected ? "USD 기준" : "연결 확인 중"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[
              { label: "포지션", value: `${overseasSummary.summary?.positionCount ?? 0}개` },
              { label: "평가금액", value: `USD ${(overseasSummary.summary?.totalUsd ?? 0).toFixed(2)}` },
              { label: "상태", value: overseasSummary.connected ? "실잔고" : "미확인" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#1D4ED8" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {surgeStats && (
        <details style={{ margin: "10px 20px 0", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 액션</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>최근 5회 실행</span>
          </summary>
          <div style={{ padding: "0 14px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {[
                { label: "선캐치", value: surgeStats.earlyEntryCount },
                { label: "재진입", value: surgeStats.reentryCount },
                { label: "부분청산", value: surgeStats.partialExitCount },
                { label: "대기", value: surgeStats.pendingCount },
                { label: "쿨다운", value: surgeStats.cooldownSkipCount },
                { label: "장마감", value: surgeStats.lateSkipCount },
                { label: "뉴스쿨", value: surgeStats.newsCooldownSkipCount },
                { label: "뉴스차단", value: surgeStats.newsRiskSkipCount },
              ].map((item) => (
                <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {isUsView && directOrderNoteStats.length > 0 && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", letterSpacing: "0.05em", textTransform: "uppercase" }}>직접 주문 메모</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>최근 체결 기준</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {directOrderNoteStats.map((item) => (
              <div key={item.note} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                    {item.market.toUpperCase()} · 매수 {item.buyCount} · 매도 {item.sellCount}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                    회수율 {typeof item.sellToBuyRatio === "number" && item.sellToBuyRatio > 0 ? `${(item.sellToBuyRatio * 100).toFixed(0)}%` : "—"}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                    완결도 {typeof item.completionRate === "number" && item.completionRate > 0 ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                    {typeof item.residualExposure === "number" && item.residualExposure > 0 ? ` · 잔류 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: typeof item.netFlow === "number" ? (item.netFlow >= 0 ? COLORS.rise : COLORS.fall) : "#7C3AED" }}>
                    {typeof item.netFlow === "number"
                      ? `${item.netFlow >= 0 ? "+" : ""}${Math.round(item.netFlow).toLocaleString("ko-KR")}`
                      : `${item.count}회`}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                    {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {topDirectOrderRecentTrades.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                메모 흐름 1위 최근 거래
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {topDirectOrderRecentTrades.map((trade, index) => (
                  <div key={`${trade.stock_code}-${trade.run_at}-${index}`} style={{ fontSize: 10, color: COLORS.dim }}>
                    {trade.stock_code} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주 · {trade.currency === "USD" ? `$${trade.price.toFixed(2)}` : `${Math.round(trade.price).toLocaleString("ko-KR")}원`}
                  </div>
                ))}
              </div>
            </div>
          )}
          {directOrderNoteAlerts.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C2410C", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                메모 경고
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {directOrderNoteAlerts.map((item) => (
                  <div key={`alert-${item.note}`} style={{ fontSize: 10, color: "#9A3412" }}>
                    <div>
                      {item.note} · 완결도 {typeof item.completionRate === "number" ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                      {typeof item.residualExposure === "number" && item.residualExposure > 0 ? ` · 잔류 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                    </div>
                    {(directOrderAlertRecentTrades.get(item.note) ?? []).length > 0 && (
                      <div style={{ marginTop: 3, display: "grid", gap: 2 }}>
                        {(directOrderAlertRecentTrades.get(item.note) ?? []).map((trade, index) => (
                          <div key={`${item.note}-${trade.stock_code}-${trade.run_at}-${index}`} style={{ color: COLORS.dim }}>
                            {trade.stock_code} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isUsView && engineControl && ((engineControl.manual_us_buy_note_templates?.length ?? 0) > 0 || (engineControl.manual_us_sell_note_templates?.length ?? 0) > 0) && (
        <details style={{ margin: "10px 20px 0", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, letterSpacing: "0.05em", textTransform: "uppercase" }}>메모 템플릿</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>현재 설정</span>
          </summary>
          <div style={{ padding: "0 14px 14px" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, marginBottom: 6 }}>미국 매수</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(engineControl.manual_us_buy_note_templates ?? []).map((item) => (
                    <span key={`buy-${item}`} style={{ padding: "5px 8px", borderRadius: 999, background: "#EFF6FF", border: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: "#1D4ED8" }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, marginBottom: 6 }}>미국 매도</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(engineControl.manual_us_sell_note_templates ?? []).map((item) => (
                    <span key={`sell-${item}`} style={{ padding: "5px 8px", borderRadius: 999, background: "#FEF2F2", border: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: "#B91C1C" }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </details>
      )}

      {combinedHoldingRiskAlerts.length > 0 && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C", letterSpacing: "0.05em", textTransform: "uppercase" }}>보유 종목 뉴스 리스크</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>
                {combinedHoldingRiskAlerts.length}건 감지{newsStats ? ` · 엔진 ${newsStats.holdingRiskCount}회 · 진입차단 ${newsStats.entryRiskSkipCount}회` : ""}
              </span>
              <button
                onClick={triggerHoldingRiskAlert}
                disabled={holdingRiskAlertLoading}
                style={{
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid #FCA5A5",
                  background: "#FFF",
                  color: "#B91C1C",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: holdingRiskAlertLoading ? "default" : "pointer",
                  opacity: holdingRiskAlertLoading ? 0.5 : 1,
                }}
              >
                {holdingRiskAlertLoading ? "전송 중..." : "텔레그램 점검"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {combinedHoldingRiskAlerts.slice(0, 4).map((alert) => (
              <div key={`${alert.code}-${alert.title}`} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>{alert.name}</span>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{alert.time}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: COLORS.ink, lineHeight: 1.45 }}>{alert.title}</div>
              </div>
            ))}
          </div>
          {holdingRiskAlertResult && (
            <div style={{ marginTop: 10, fontSize: 11, color: holdingRiskAlertResult.startsWith("실패") ? "#B91C1C" : COLORS.dim }}>
              {holdingRiskAlertResult}
            </div>
          )}
        </div>
      )}

      {newsStats && ((newsStats.holdingAlertSentCount ?? 0) > 0 || (newsStats.holdingAlertFailedCount ?? 0) > 0 || (isUsView && (newsStats.holdingAlertNoteWarningCount ?? 0) > 0)) && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 점검 전송</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>최근 기록</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${isUsView ? 4 : 3}, minmax(0, 1fr))`, gap: 8 }}>
            {[
              { label: "전송", value: newsStats.holdingAlertSentCount ?? 0 },
              { label: "종목수", value: newsStats.holdingAlertSentStockCount ?? 0 },
              ...(isUsView ? [{ label: "메모경고", value: newsStats.holdingAlertNoteWarningCount ?? 0 }] : []),
              { label: "실패", value: newsStats.holdingAlertFailedCount ?? 0 },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
              </div>
            ))}
          </div>
          {isUsView && holdingNewsAlertNoteStats.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {holdingNewsAlertNoteStats.map((item) => (
                <div key={item.note} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.count}회</span>
                  </div>
                  {item.recentStocks.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>
                      {item.recentStocks.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isUsView && holdingNewsAlertStockStats.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {holdingNewsAlertStockStats.map((item) => (
                <div key={item.stock} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stock}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.count}회</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>
                    {item.notes.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
