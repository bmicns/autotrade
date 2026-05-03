type PollHandlers = {
  fetchHealth: () => Promise<Response>;
  onSuccess: (payload: { connected: boolean; lastChecked: string | null; latencyMs: number | null }) => void;
};

let pollHandle: ReturnType<typeof setInterval> | null = null;
let pollActive = false;

export function startKisHealthPolling(handlers: PollHandlers) {
  if (pollHandle !== null) return;
  pollActive = true;

  const poll = async () => {
    if (!pollActive) return;
    try {
      const res = await handlers.fetchHealth();
      if (!pollActive || !res.ok) return;
      const data = await res.json();
      if (!pollActive) return;
      handlers.onSuccess({
        connected: !!data.connected,
        lastChecked: data.lastChecked ?? null,
        latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : null,
      });
    } catch {
      // Ignore polling failures.
    }
  };

  void poll();
  pollHandle = setInterval(() => {
    void poll();
  }, 60_000);
}

export function stopKisHealthPolling() {
  pollActive = false;
  if (pollHandle !== null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}
