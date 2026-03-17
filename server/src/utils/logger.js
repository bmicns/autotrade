const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" };
const RESET = "\x1b[0m";

export function log(level, message, data = null) {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const color = COLORS[level] || "";
  const prefix = `${color}[${now}] [${level.toUpperCase()}]${RESET}`;
  console.log(`${prefix} ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}
