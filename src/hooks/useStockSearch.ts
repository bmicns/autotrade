"use client";

import { useState, useEffect } from "react";

export interface StockSearchResult {
  code: string;
  name: string;
  market: string;
}

export function useStockSearch(query: string) {
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/stock-search?q=${encodeURIComponent(query)}`);
        if (res.ok) setResults(await res.json());
        else setResults([]);
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return { results, searching };
}
