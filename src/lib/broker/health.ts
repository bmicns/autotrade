import type { BrokerId } from "./types";
import { getBrokerAdapter } from "./adapter";
import type { BrokerHealthStatus } from "./adapter-contract";

export async function checkBrokerHealth(brokerId: BrokerId): Promise<{ status: BrokerHealthStatus; httpStatus: number }> {
  const adapter = getBrokerAdapter(brokerId);
  return adapter.checkHealth();
}
