import { getBalance as getKisBalance, getPrice as getKisPrice, KISError, placeOrder, placeOverseasOrder } from "@/lib/kis/api";
import { fetchBalance as fetchKisClientBalance, fetchPrice as fetchKisClientPrice, fetchPrices as fetchKisClientPrices } from "@/lib/kis/client";
import { getActiveKisConfig, getActiveKisConfigForAssetClass } from "@/lib/kis/runtime-config";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import { getTokenDetails } from "@/lib/kis/api";
import { normalizeKisProfileId } from "@/lib/kis/profile";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { KIS_RUNTIME_MODE } from "@/lib/constants";
import { sendKISApiErrorAlert, sendKISConnectionAlert } from "@/lib/engine/notify";
import { supabase } from "@/lib/supabase/api-client";
import type { BrokerAdapter, BrokerBalancePayload, BrokerHealthStatus, BrokerManualOrderPayload, BrokerPricePayload, BrokerServiceResult, DomesticExecutionContextResult } from "../adapter-contract";

let prevConnected: boolean | null = null;

function kstNow(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().replace("Z", "+09:00");
}

async function persistIssuedToken(token: string, tokenExpiry: string | null) {
  await supabase
    .from("kis_config")
    .update({
      token,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
}

export const kisBrokerAdapter: BrokerAdapter = {
  id: "kis",
  label: "한국투자",
  implementationStatus: "implemented",
  async fetchPrice(payload: BrokerPricePayload): Promise<BrokerServiceResult<unknown>> {
    const active = await getActiveKisConfig();
    const fallbackConfig = active?.config ?? null;
    const appKey = payload.appKey || fallbackConfig?.appKey || "";
    const appSecret = payload.appSecret || fallbackConfig?.appSecret || "";
    const accountNo = payload.accountNo || fallbackConfig?.accountNo || "";
    const accountProductCode = payload.accountProductCode || fallbackConfig?.accountProductCode || "01";

    if (!appKey || !appSecret) {
      return {
        ok: false,
        status: 400,
        body: { error: "활성 KIS 앱키/시크릿이 없습니다" },
      };
    }

    const profileId = active?.profileId ?? "default";
    const token = payload.token || await resolveKisAccessToken(profileId, appKey, appSecret);
    const data = await getKisPrice(
      {
        appKey,
        appSecret,
        accountNo,
        accountProductCode,
        token,
      },
      payload.code,
    );

    return {
      ok: true,
      status: 200,
      body: data,
    };
  },
  async fetchBalance(payload: BrokerBalancePayload): Promise<BrokerServiceResult<unknown>> {
    const timestamp = new Date().toISOString();
    try {
      const active = await getActiveKisConfig();
      const fallbackConfig = active?.config ?? null;
      const appKey = payload.appKey || fallbackConfig?.appKey || "";
      const appSecret = payload.appSecret || fallbackConfig?.appSecret || "";
      const accountNo = payload.accountNo || fallbackConfig?.accountNo || "";
      const accountProductCode = payload.accountProductCode || fallbackConfig?.accountProductCode || "01";
      if (!appKey || !appSecret || !accountNo) {
        return {
          ok: false,
          status: 400,
          body: { error: "활성 KIS 잔고 조회 설정이 없습니다" },
        };
      }
      const profileId = active?.profileId ?? "default";
      const token = payload.token || await resolveKisAccessToken(profileId, appKey, appSecret);
      const data = await getKisBalance({
        appKey,
        appSecret,
        accountNo,
        accountProductCode,
        token,
      });
      return {
        ok: true,
        status: 200,
        body: data,
      };
    } catch (error: unknown) {
      if (error instanceof KISError) {
        await sendKISApiErrorAlert({
          operation: "balance",
          httpStatus: error.status,
          kisCode: error.kisCode,
          kisMessage: error.detail?.slice(0, 200),
          timestamp,
        }).catch(() => {});
        if (error.status === 401) {
          return {
            ok: false,
            status: 401,
            body: { error: "토큰이 만료되었습니다", kisCode: error.kisCode },
          };
        }
        return {
          ok: false,
          status: 500,
          body: { error: "잔고 조회 실패", kisCode: error.kisCode, kisMessage: error.detail },
        };
      }

      await sendKISApiErrorAlert({
        operation: "balance",
        kisMessage: error instanceof Error ? error.message.slice(0, 200) : "알 수 없는 오류",
        timestamp,
      }).catch(() => {});

      return {
        ok: false,
        status: 500,
        body: { error: "잔고 조회 실패" },
      };
    }
  },
  async checkHealth(): Promise<{ status: BrokerHealthStatus; httpStatus: number }> {
    const now = kstNow();
    const active = await getActiveKisConfig();
    if (!active) {
      return {
        status: {
          connected: false,
          lastChecked: now,
          latencyMs: 0,
          brokerId: "kis",
          brokerLabel: "한국투자",
          errorMessage: "KIS 설정이 없습니다",
        },
        httpStatus: 400,
      };
    }
    const diagnosticMeta = {
      profileId: active.profileId,
      source: active.source,
    };

    const { data: configRow } = await supabase
      .from("kis_config")
      .select("token")
      .eq("id", "default")
      .maybeSingle();

    let token = (configRow?.token as string | null) ?? null;
    const start = Date.now();

    try {
      if (!token) {
        const fresh = await getTokenDetails(active.config.appKey, active.config.appSecret);
        token = fresh.token;
        await persistIssuedToken(fresh.token, fresh.tokenExpiry);
      }
      await getKisBalance({ ...active.config, token });
      const latencyMs = Date.now() - start;

      if (prevConnected === false) {
        await sendKISConnectionAlert("reconnected").catch(() => {});
      }
      prevConnected = true;

      return {
        status: {
          connected: true,
          lastChecked: now,
          latencyMs,
          brokerId: "kis",
          brokerLabel: "한국투자",
          ...diagnosticMeta,
        },
        httpStatus: 200,
      };
    } catch (error: unknown) {
      const latencyMs = Math.max(Date.now() - start, 0);
      let errorCode: string | undefined;
      let errorMessage: string | undefined;

      if (token) {
        try {
          const fresh = await getTokenDetails(active.config.appKey, active.config.appSecret);
          await persistIssuedToken(fresh.token, fresh.tokenExpiry);
          await getKisBalance({ ...active.config, token: fresh.token });
          const recoveredLatencyMs = Math.max(Date.now() - start, 0);
          if (prevConnected === false) {
            await sendKISConnectionAlert("reconnected").catch(() => {});
          }
          prevConnected = true;
          return {
            status: {
              connected: true,
              lastChecked: now,
              latencyMs: recoveredLatencyMs,
              recovered: true,
              brokerId: "kis",
              brokerLabel: "한국투자",
              ...diagnosticMeta,
            },
            httpStatus: 200,
          };
        } catch {
          // fall through
        }
      }

      if (error instanceof KISError) {
        errorCode = error.kisCode;
        errorMessage = error.detail?.slice(0, 200);
      } else if (error instanceof Error) {
        errorMessage = error.message.slice(0, 200);
      }

      if (prevConnected === true) {
        await sendKISConnectionAlert("disconnected").catch(() => {});
      }
      prevConnected = false;

      return {
        status: {
          connected: false,
          lastChecked: now,
          latencyMs,
          brokerId: "kis",
          brokerLabel: "한국투자",
          ...diagnosticMeta,
          ...(errorCode && { errorCode }),
          ...(errorMessage && { errorMessage }),
        },
        httpStatus: 200,
      };
    }
  },
  async placeManualOrder(payload: BrokerManualOrderPayload): Promise<BrokerServiceResult<unknown>> {
    const normalizedProfileId = normalizeKisProfileId(payload.normalizedProfileId ?? undefined);
    const domesticProfileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
    const active = normalizedProfileId
      ? await getActiveKisConfig(normalizedProfileId)
      : payload.marketType === "us"
        ? await getActiveKisConfigForAssetClass("us_stock")
        : await getActiveKisConfig(domesticProfileId);

    if (!active) {
      return {
        ok: false,
        status: 400,
        body: {
          error: payload.marketType === "us"
            ? "미국 KIS 설정이 없습니다"
            : `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 설정이 없습니다`,
        },
      };
    }

    let token: string;
    try {
      token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "KIS 토큰 발급 실패";
      return {
        ok: false,
        status: 500,
        body: {
          error: `${payload.marketType === "us" ? "미국" : "국내"} KIS 토큰 오류 (${active.source}/${active.profileId}): ${message}`,
        },
      };
    }

    if (payload.marketType === "us") {
      if ((payload.orderType ?? "00") !== "00") {
        return { ok: false, status: 400, body: { error: "해외주식 주문은 현재 지정가(00)만 지원합니다" } };
      }

      const normalizedExchange = payload.exchangeCode === "NYSE" || payload.exchangeCode === "AMEX" ? payload.exchangeCode : "NASD";
      const data = await placeOverseasOrder(
        {
          appKey: active.config.appKey,
          appSecret: active.config.appSecret,
          accountNo: active.config.accountNo,
          accountProductCode: active.config.accountProductCode,
          token,
        },
        {
          side: payload.side,
          symbol: payload.stockCode.toUpperCase(),
          quantity: payload.qty,
          price: payload.px,
          exchangeCode: normalizedExchange,
          orderDiv: "00",
        },
      );

      if (String(data?.rt_cd ?? "") === "0") {
        await recordEngineEvent({
          eventType: payload.side === "buy" ? "manual_buy_executed" : "manual_sell_executed",
          stockCode: payload.stockCode.toUpperCase(),
          entityTable: "operations",
          entityId: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
          payload: {
            market: "us",
            exchangeCode: normalizedExchange,
            qty: payload.qty,
            price: payload.px,
            order_no: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
            side: payload.side,
            profileId: active.profileId,
            success: true,
            currency: "USD",
            stock_name: payload.normalizedStockName || null,
            note: payload.normalizedNote || null,
          },
        });
      }

      return {
        ok: true,
        status: 200,
        body: { ...data, profileId: active.profileId, market: "us", exchangeCode: normalizedExchange },
      };
    }

    const data = await placeOrder(
      {
        appKey: active.config.appKey,
        appSecret: active.config.appSecret,
        accountNo: active.config.accountNo,
        accountProductCode: active.config.accountProductCode,
        token,
      },
      payload.side,
      payload.stockCode,
      payload.qty,
      payload.px,
      (payload.orderType ?? "00") as "00" | "01",
    );

    if (String(data?.rt_cd ?? "") === "0") {
      await recordEngineEvent({
        eventType: payload.side === "buy" ? "manual_buy_executed" : "manual_sell_executed",
        stockCode: payload.stockCode,
        entityTable: "operations",
        entityId: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
        payload: {
          market: "kr",
          qty: payload.qty,
          price: payload.px,
          order_no: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
          side: payload.side,
          profileId: active.profileId,
          success: true,
          currency: "KRW",
          stock_name: payload.normalizedStockName || null,
          note: payload.normalizedNote || null,
        },
      });
    }

    return {
      ok: true,
      status: 200,
      body: { ...data, profileId: active.profileId, market: "kr" },
    };
  },
  async resolveDomesticExecutionContext(): Promise<DomesticExecutionContextResult> {
    const domesticProfileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
    const active = await getActiveKisConfig(domesticProfileId);
    if (!active) {
      return {
        ok: false,
        status: 400,
        error: `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 설정이 없습니다`,
      };
    }

    let token: string;
    try {
      token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "국내 KIS 토큰 발급 실패";
      return {
        ok: false,
        status: 500,
        error: `국내 KIS 토큰 오류 (${active.source}/${active.profileId}): ${message}`,
      };
    }

    return {
      ok: true,
      brokerId: "kis",
      brokerLabel: "한국투자",
      profileId: active.profileId,
      source: active.source,
      engineConfig: {
        appKey: active.config.appKey,
        appSecret: active.config.appSecret,
        accountNo: active.config.accountNo,
        accountProductCode: active.config.accountProductCode,
        token,
        stopLoss: -2,
        trailingStop: -3,
        maxPerTrade: 0,
        maxDailyTrades: 1,
        partialExitRatio: 50,
        dailyLossLimit: -3,
        maxHoldDays: 1,
        dynamicRisk: true,
      },
    };
  },
  fetchClientPrice: fetchKisClientPrice,
  fetchClientPrices: fetchKisClientPrices,
  fetchClientBalance: fetchKisClientBalance,
};
