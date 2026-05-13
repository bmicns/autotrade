#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const envFile = path.join(projectRoot, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function routeModulePath(relativePath) {
  return path.join(projectRoot, ".next", "server", "app", ...relativePath.split("/"), "route.js");
}

function getRouteHandler(relativePath, method) {
  const filePath = routeModulePath(relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing build artifact: ${filePath}. Run "npm run build" first.`);
  }
  const mod = require(filePath);
  const handler = mod.routeModule?.userland?.[method];
  if (typeof handler !== "function") {
    throw new Error(`Route handler not found: ${relativePath} ${method}`);
  }
  return handler;
}

async function invoke(relativePath, method, arg) {
  const handler = getRouteHandler(relativePath, method);
  const response = arg === undefined ? await handler() : await handler(arg);
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }
  return { status: response.status, body: parsed };
}

function summarize(value, maxLen = 1200) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxLen ? `${text.slice(0, maxLen)}\n...` : text;
}

function parseTimeoutMs() {
  const raw = Number(process.env.CHECK_ENGINE_TIMEOUT_MS ?? "15000");
  if (!Number.isFinite(raw) || raw <= 0) return 15000;
  return Math.floor(raw);
}

async function withTimeout(label, run, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function printSection(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`STATUS ${result.status}`);
  console.log(summarize(result.body));
}

function makeEngineLogRequest() {
  return makeRouteRequest("http://localhost/api/engine-log?limit=5&page=1");
}

function makeRouteRequest(url) {
  return {
    url,
    nextUrl: new URL(url),
  };
}

async function main() {
  loadEnvFile(envFile);
  const timeoutMs = parseTimeoutMs();

  const now = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).format(new Date());

  console.log(`KST ${now}`);
  console.log(`Route timeout ${timeoutMs}ms`);

  const checks = [
    ["engine", () => invoke("api/engine", "GET")],
    ["preflight", () => invoke("api/preflight", "GET")],
    ["engine-log", () => invoke("api/engine-log", "GET", makeEngineLogRequest())],
    ["pending-signals", () => invoke("api/pending-signals", "GET", makeRouteRequest("http://localhost/api/pending-signals?scope=active"))],
    ["positions", () => invoke("api/positions", "GET")],
  ];

  for (const [title, run] of checks) {
    try {
      printSection(title, await withTimeout(title, run, timeoutMs));
    } catch (error) {
      console.log(`\n=== ${title} ===`);
      console.log(String(error && error.stack ? error.stack : error));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
