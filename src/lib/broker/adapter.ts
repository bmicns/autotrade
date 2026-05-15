import { kisBrokerAdapter } from "./adapters/kis";
import { createPlannedBrokerAdapter } from "./adapters/planned";
import type { BrokerAdapter } from "./adapter-contract";
import type { BrokerId } from "./types";

export const brokerAdapters: Record<BrokerId, BrokerAdapter> = {
  kis: kisBrokerAdapter,
  samsung: createPlannedBrokerAdapter("samsung"),
  kiwoom: createPlannedBrokerAdapter("kiwoom"),
  nh: createPlannedBrokerAdapter("nh"),
  kb: createPlannedBrokerAdapter("kb"),
  mirae: createPlannedBrokerAdapter("mirae"),
  ls: createPlannedBrokerAdapter("ls"),
};

export function getBrokerAdapter(brokerId: BrokerId): BrokerAdapter {
  return brokerAdapters[brokerId];
}
