import { resolveActiveBrokerState } from "./config";
import { getBrokerAdapter } from "./adapter";
import type { DomesticExecutionContextResult } from "./adapter-contract";

export async function resolveActiveDomesticExecutionContext(): Promise<DomesticExecutionContextResult> {
  const brokerState = await resolveActiveBrokerState();
  const adapter = getBrokerAdapter(brokerState.brokerId);
  const result = await adapter.resolveDomesticExecutionContext();
  if (!result.ok) return result;
  return {
    ...result,
    brokerLabel: brokerState.brokerLabel,
  };
}
