import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { supabase } from "@/lib/supabase/api-client";
import { getBalance, getTokenDetails, KISError } from "@/lib/kis/api";
import { sendKISConnectionAlert } from "@/lib/engine/notify";
import type { KISHealthStatus } from "@/lib/engine/types";
import type { BrokerId } from "./types";
import { getBrokerLabel } from "./registry";

let prevConnected: boolean | null = null;

export type BrokerHealthStatus = KISHealthStatus & {
  brokerId: BrokerId;
  brokerLabel: string;
  profileId?: string;
  source?: string;
  recovered?: boolean;
};

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

export async function checkBrokerHealth(brokerId: BrokerId): Promise<{ status: BrokerHealthStatus; httpStatus: number }> {
  const now = kstNow();
  const brokerLabel = getBrokerLabel(brokerId);

  if (brokerId !== "kis") {
    return {
      status: {
        connected: false,
        lastChecked: now,
        latencyMs: 0,
        brokerId,
        brokerLabel,
        errorMessage: `${brokerLabel} 헬스체크는 아직 구현되지 않았습니다`,
      },
      httpStatus: 501,
    };
  }

  const active = await getActiveKisConfig();
  if (!active) {
    return {
      status: {
        connected: false,
        lastChecked: now,
        latencyMs: 0,
        brokerId,
        brokerLabel,
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
    await getBalance({ ...active.config, token });
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
        brokerId,
        brokerLabel,
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
        await getBalance({ ...active.config, token: fresh.token });
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
            brokerId,
            brokerLabel,
            ...diagnosticMeta,
          },
          httpStatus: 200,
        };
      } catch {
        // fall through to disconnected response
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
        brokerId,
        brokerLabel,
        ...diagnosticMeta,
        ...(errorCode && { errorCode }),
        ...(errorMessage && { errorMessage }),
      },
      httpStatus: 200,
    };
  }
}
