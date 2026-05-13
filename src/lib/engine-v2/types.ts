import type { AssetClass } from "../market/types";

export interface EngineV2MarketSelection {
  assetClass: AssetClass;
  symbols?: string[];
}

export interface EngineV2RuntimeConfig {
  environment: "dev" | "paper" | "prod";
  dryRun: boolean;
  selections: EngineV2MarketSelection[];
}

export interface EngineV2RuntimeCheck {
  key: "environment" | "dryRun" | "appBaseUrl" | "cronSecret" | "sessionSecret" | "runtimeMode";
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface EngineV2RuntimeStatus {
  environment: EngineV2RuntimeConfig["environment"];
  dryRun: boolean;
  allowed: boolean;
  phase: "dev_lab" | "paper_dry_run" | "paper_candidate" | "blocked_prod";
  headline: string;
  detail: string;
  readyForPaperVerification: boolean;
  checks: EngineV2RuntimeCheck[];
}
