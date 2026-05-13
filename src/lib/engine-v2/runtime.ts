import type { AssetClass } from "../market/types";
import type { EngineV2RuntimeCheck, EngineV2RuntimeConfig, EngineV2MarketSelection, EngineV2RuntimeStatus } from "./types";

const DEFAULT_SELECTIONS: AssetClass[] = ["kr_stock"];
const VALID_ASSET_CLASSES = new Set<AssetClass>(["kr_stock", "us_stock", "kr_etf", "us_etf"]);

function parseEnvironment(value: string | undefined): "dev" | "paper" | "prod" {
  if (value === "paper" || value === "prod") return value;
  return "dev";
}

export function parseEngineV2Selections(value: string | undefined): EngineV2MarketSelection[] {
  const raw = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is AssetClass => VALID_ASSET_CLASSES.has(item as AssetClass));

  const selections = (raw.length ? raw : DEFAULT_SELECTIONS).map((assetClass) => ({ assetClass }));
  return selections;
}

export function overrideEngineV2Selections(
  config: EngineV2RuntimeConfig,
  value: string | undefined,
): EngineV2RuntimeConfig {
  return {
    ...config,
    selections: parseEngineV2Selections(value),
  };
}

export function readEngineV2RuntimeConfig(env: NodeJS.ProcessEnv = process.env): EngineV2RuntimeConfig {
  return {
    environment: parseEnvironment(env.NEXIO_ENV),
    dryRun: env.NEXIO_V2_DRY_RUN !== "false",
    selections: parseEngineV2Selections(env.NEXIO_V2_ASSET_CLASSES),
  };
}

function hasNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveEngineV2RuntimeStatus(env: NodeJS.ProcessEnv = process.env): EngineV2RuntimeStatus {
  const config = readEngineV2RuntimeConfig(env);
  const runtimeMode = String(env.KIS_RUNTIME_MODE ?? "").trim();
  const appBaseUrlPresent = hasNonEmpty(env.APP_BASE_URL);
  const cronSecretPresent = hasNonEmpty(env.CRON_SECRET);
  const sessionSecretPresent = hasNonEmpty(env.SESSION_SECRET);
  const runtimeModeValid = runtimeMode === "paper" || runtimeMode === "live";

  const checks: EngineV2RuntimeCheck[] = [
    {
      key: "environment",
      label: "Environment",
      status: config.environment === "prod" ? "fail" : "pass",
      detail: config.environment === "prod"
        ? "prod 환경에서는 engine-v2 실험선을 실행하면 안 됩니다."
        : `${config.environment} 환경에서 실험선이 분리되어 있습니다.`,
    },
    {
      key: "dryRun",
      label: "Dry Run",
      status: config.environment === "paper" && !config.dryRun ? "pass" : "warn",
      detail: config.dryRun
        ? "실주문 없이 preview 전용으로 실행됩니다."
        : "dryRun=false 상태입니다. paper 검증용으로만 사용해야 합니다.",
    },
    {
      key: "runtimeMode",
      label: "KIS Runtime",
      status: runtimeModeValid ? "pass" : "warn",
      detail: runtimeModeValid
        ? `KIS_RUNTIME_MODE=${runtimeMode}`
        : "KIS_RUNTIME_MODE가 비어 있거나 paper/live 값이 아닙니다.",
    },
    {
      key: "appBaseUrl",
      label: "APP_BASE_URL",
      status: appBaseUrlPresent ? "pass" : "warn",
      detail: appBaseUrlPresent ? "APP_BASE_URL configured" : "paper 승격 전 전용 APP_BASE_URL이 필요합니다.",
    },
    {
      key: "cronSecret",
      label: "CRON_SECRET",
      status: cronSecretPresent ? "pass" : "warn",
      detail: cronSecretPresent ? "CRON_SECRET configured" : "paper 승격 전 전용 CRON_SECRET이 필요합니다.",
    },
    {
      key: "sessionSecret",
      label: "SESSION_SECRET",
      status: sessionSecretPresent ? "pass" : "warn",
      detail: sessionSecretPresent ? "SESSION_SECRET configured" : "paper 승격 전 전용 SESSION_SECRET이 필요합니다.",
    },
  ];

  if (config.environment === "prod") {
    return {
      environment: config.environment,
      dryRun: config.dryRun,
      allowed: false,
      phase: "blocked_prod",
      headline: "engine-v2 blocked in prod",
      detail: "실험선은 prod 환경에서 비활성화되어야 합니다.",
      readyForPaperVerification: false,
      checks,
    };
  }

  const readyForPaperVerification = config.environment === "paper"
    && runtimeMode === "paper"
    && !config.dryRun
    && appBaseUrlPresent
    && cronSecretPresent
    && sessionSecretPresent;

  if (config.environment === "paper") {
    return {
      environment: config.environment,
      dryRun: config.dryRun,
      allowed: true,
      phase: readyForPaperVerification ? "paper_candidate" : "paper_dry_run",
      headline: readyForPaperVerification ? "paper verification candidate" : "paper environment not fully armed",
      detail: readyForPaperVerification
        ? "paper 검증선으로 올릴 최소 런타임 조건이 맞춰졌습니다."
        : "paper 환경이지만 dryRun 또는 전용 시크릿/URL 구성이 아직 부족합니다.",
      readyForPaperVerification,
      checks,
    };
  }

  return {
    environment: config.environment,
    dryRun: config.dryRun,
    allowed: true,
    phase: "dev_lab",
    headline: "local experiment line",
    detail: "현재는 dev 실험선입니다. paper 전용 시크릿과 경계를 분리한 뒤 승격해야 합니다.",
    readyForPaperVerification: false,
    checks,
  };
}
