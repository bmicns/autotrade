"use client";

import { useState, useCallback } from "react";

export interface WatchlistItem {
  id: string;
  code: string;
  name: string | null;
  active: boolean;
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) setWatchlist(await res.json());
    } catch { /* ignore */ }
  }, []);

  const addItem = useCallback(async (code: string, name: string) => {
    setLoading(true);
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      await fetchWatchlist();
    } catch { /* ignore */ }
    setLoading(false);
  }, [fetchWatchlist]);

  const removeItem = useCallback(async (code: string) => {
    setLoading(true);
    try {
      await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      await fetchWatchlist();
    } catch { /* ignore */ }
    setLoading(false);
  }, [fetchWatchlist]);

  return { watchlist, loading, fetchWatchlist, addItem, removeItem };
}
