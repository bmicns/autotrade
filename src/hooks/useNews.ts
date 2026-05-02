"use client";

import { useState, useCallback } from "react";

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

export function useNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news");
      if (res.ok) setNews(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  return { news, loading, fetchNews };
}
