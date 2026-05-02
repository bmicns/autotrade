"use client";

import { useState, useCallback } from "react";

export interface Position {
  id: string;
  code: string;
  name: string | null;
  qty: number;
  avgPrice: number;
  status: string;
  openedAt: string;
}

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/positions");
      if (res.ok) setPositions(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  return { positions, loading, fetchPositions };
}
