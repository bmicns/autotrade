export interface NewsItem {
  title: string;
  source: string;
  time: string;
  url: string;
  publishedAt?: string;
  provider?: "naver" | "daum" | "google" | "dart";
  sentiment?: "positive" | "negative" | "neutral";
  score?: number;
  summary?: string;
}

export interface NewsSnapshot {
  naverNews: NewsItem[];
  daumNews: NewsItem[];
  disclosures: NewsItem[];
  aiSentiment: NewsItem[];
  latestNews: NewsItem[];
}

export type NewsMarket = "kr" | "us";

export interface NewsKeywordSummary {
  keyword: string;
  count: number;
  sentiment: "positive" | "negative" | "neutral";
}

export interface HoldingNewsAlert {
  name: string;
  matched: NewsItem[];
  riskItems: NewsItem[];
}

const POSITIVE = ["급등", "상승", "신고가", "호실적", "흑자", "상향", "매수", "성장", "수주", "호재", "반등", "돌파", "최고", "강세", "확대", "개선", "증가", "배당", "계약", "승인", "특허"];
const NEGATIVE = ["급락", "하락", "폭락", "적자", "손실", "하향", "매도", "감소", "리스크", "악재", "부진", "위기", "하한가", "약세", "축소", "악화", "매각", "소송", "유상증자", "횡령", "정지"];
const HIGH_IMPACT_POSITIVE = ["수주", "계약", "호실적", "흑자", "승인", "특허", "인수", "파트너십", "공급"];
const HIGH_IMPACT_NEGATIVE = ["유상증자", "횡령", "거래정지", "적자", "소송", "하향", "감자", "리콜"];
const NEUTRAL_KEYWORDS = ["공시", "실적", "정책", "금리", "반도체", "배터리", "바이오", "자동차", "로봇", "AI"];

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeCharset(charset: string | null | undefined): string | null {
  if (!charset) return null;
  const normalized = charset.trim().toLowerCase();
  if (!normalized) return null;
  if (["euc-kr", "euckr", "ks_c_5601-1987", "ksc5601", "cp949", "uhc"].includes(normalized)) return "euc-kr";
  if (normalized === "utf8") return "utf-8";
  return normalized;
}

function extractCharsetFromContentType(contentType: string | null): string | null {
  const match = contentType?.match(/charset=([^;]+)/i);
  return normalizeCharset(match?.[1] ?? null);
}

function extractCharsetFromHtml(buffer: Buffer): string | null {
  const head = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));
  const metaCharset = head.match(/<meta[^>]+charset=["']?\s*([^"'\s/>]+)/i);
  if (metaCharset) return normalizeCharset(metaCharset[1]);
  const httpEquiv = head.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s/>]+)/i);
  return normalizeCharset(httpEquiv?.[1] ?? null);
}

export function decodeResponseText(buffer: Buffer, contentType?: string | null): string {
  const candidates = [
    extractCharsetFromContentType(contentType ?? null),
    extractCharsetFromHtml(buffer),
    "utf-8",
  ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

  for (const charset of candidates) {
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch {
      // try next charset
    }
  }

  return buffer.toString("utf8");
}

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function normalizeNewsMatchValue(value: string): string {
  return normalizeForMatch(value);
}

export function analyzeSentiment(title: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  let score = 0;
  for (const word of POSITIVE) {
    if (title.includes(word)) score += 1;
  }
  for (const word of NEGATIVE) {
    if (title.includes(word)) score -= 1;
  }
  return {
    sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral",
    score,
  };
}

export function summarizeSentiment(sentiment: "positive" | "negative" | "neutral"): string {
  if (sentiment === "positive") return "매수 관점 긍정적";
  if (sentiment === "negative") return "리스크 주의 필요";
  return "중립적 시장 영향";
}

export function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (Number.isNaN(diff) || diff < 0) return "방금";
  if (diff < 1) return "방금";
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}

function createNewsItem(item: Omit<NewsItem, "sentiment" | "score" | "summary" | "time"> & { publishedAt?: string }): NewsItem {
  const published = item.publishedAt ? new Date(item.publishedAt) : null;
  const { sentiment, score } = analyzeSentiment(item.title);
  return {
    ...item,
    time: published ? getTimeAgo(published) : "방금",
    sentiment,
    score,
    summary: summarizeSentiment(sentiment),
  };
}

export function parseGoogleRSS(xml: string, limit = 5, provider: NewsItem["provider"] = "google"): NewsItem[] {
  const allItems: Array<NewsItem & { _ts: number }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    if (!titleMatch) continue;
    let rawTitle = stripHtml(titleMatch[1]);

    let source = "";
    const dashIdx = rawTitle.lastIndexOf(" - ");
    if (dashIdx > 0) {
      source = rawTitle.slice(dashIdx + 3).trim();
      rawTitle = rawTitle.slice(0, dashIdx).trim();
    }

    const sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>/);
    if (sourceMatch) source = stripHtml(sourceMatch[1]);

    const linkMatch = block.match(/<link>(.*?)<\/link>/);
    const url = linkMatch ? linkMatch[1].trim() : "#";

    const dateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);
    const publishedAt = dateMatch ? new Date(dateMatch[1].trim()) : new Date();

    if (!rawTitle) continue;
    allItems.push({
      ...createNewsItem({
        title: rawTitle,
        source,
        url,
        provider,
        publishedAt: publishedAt.toISOString(),
      }),
      _ts: publishedAt.getTime(),
    });
  }

  allItems.sort((a, b) => b._ts - a._ts);
  return allItems.slice(0, limit).map((item) => {
    const { _ts, ...nextItem } = item;
    void _ts;
    return nextItem;
  });
}

function parseDirectMatches(params: {
  html: string;
  regex: RegExp;
  baseUrl: string;
  source: string;
  provider: NewsItem["provider"];
  limit: number;
}): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = params.regex.exec(params.html)) !== null && items.length < params.limit) {
    const href = stripHtml(match[1] || "");
    const title = stripHtml(match[2] || "");
    if (!title || title.length < 6) continue;
    const url = href.startsWith("http") ? href : `${params.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    items.push(createNewsItem({
      title,
      source: params.source,
      url,
      provider: params.provider,
      publishedAt: new Date().toISOString(),
    }));
  }

  return items;
}

async function fetchText(url: string, revalidate = 600): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: revalidate > 0 ? "force-cache" : "no-store",
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return decodeResponseText(buffer, res.headers.get("content-type"));
}

export async function fetchNaverNews(limit = 6): Promise<NewsItem[]> {
  try {
    const html = await fetchText("https://finance.naver.com/news/mainnews.naver");
    const items = parseDirectMatches({
      html,
      regex: /articleSubject[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g,
      baseUrl: "https://finance.naver.com",
      source: "네이버 금융",
      provider: "naver",
      limit,
    });
    if (items.length > 0) return items;
  } catch {
    // fall through
  }

  try {
    const xml = await fetchText(
      "https://news.google.com/rss/search?q=site%3Afinance.naver.com+%EC%A3%BC%EC%8B%9D&hl=ko&gl=KR&ceid=KR%3Ako",
    );
    return parseGoogleRSS(xml, limit, "naver").map((item) => ({ ...item, source: item.source || "네이버 금융" }));
  } catch {
    return [];
  }
}

export async function fetchDaumNews(limit = 6): Promise<NewsItem[]> {
  try {
    const html = await fetchText("https://search.daum.net/search?w=news&q=%EC%A3%BC%EC%8B%9D");
    const items = parseDirectMatches({
      html,
      regex: /<a[^>]+href="(https?:\/\/v\.daum\.net\/v\/[^"]+)"[^>]*>(.*?)<\/a>/g,
      baseUrl: "https://v.daum.net",
      source: "다음 뉴스",
      provider: "daum",
      limit,
    });
    if (items.length > 0) return items;
  } catch {
    // fall through
  }

  try {
    const xml = await fetchText(
      "https://news.google.com/rss/search?q=site%3Anews.daum.net+%EC%A3%BC%EC%8B%9D&hl=ko&gl=KR&ceid=KR%3Ako",
    );
    return parseGoogleRSS(xml, limit, "daum").map((item) => ({ ...item, source: item.source || "다음 뉴스" }));
  } catch {
    return [];
  }
}

export async function fetchDisclosureNews(limit = 5): Promise<NewsItem[]> {
  try {
    const xml = await fetchText(
      "https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC+%EA%B3%B5%EC%8B%9C+%EC%8B%A4%EC%A0%81&hl=ko&gl=KR&ceid=KR%3Ako",
    );
    return parseGoogleRSS(xml, limit, "dart");
  } catch {
    return [];
  }
}

async function fetchGoogleNewsByQuery(
  query: string,
  limit = 6,
  sourceFallback = "Google News",
  locale: { hl: string; gl: string; ceid: string } = { hl: "en-US", gl: "US", ceid: "US:en" },
): Promise<NewsItem[]> {
  try {
    const xml = await fetchText(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}&ceid=${encodeURIComponent(locale.ceid)}`,
    );
    return parseGoogleRSS(xml, limit, "google").map((item) => ({ ...item, source: item.source || sourceFallback }));
  } catch {
    return [];
  }
}

export async function fetchUsMarketNews(limit = 6): Promise<NewsItem[]> {
  return fetchGoogleNewsByQuery(
    "미국 증시 OR 나스닥 OR S&P500 OR 뉴욕증시",
    limit,
    "미국 시장",
    { hl: "ko", gl: "KR", ceid: "KR:ko" },
  );
}

export async function fetchUsEtfNews(limit = 6): Promise<NewsItem[]> {
  return fetchGoogleNewsByQuery(
    "미국 ETF OR SPY OR QQQ OR VTI OR 미국 ETF 시장",
    limit,
    "미국 ETF",
    { hl: "ko", gl: "KR", ceid: "KR:ko" },
  );
}

export async function fetchUsDisclosureNews(limit = 5): Promise<NewsItem[]> {
  return fetchGoogleNewsByQuery(
    "미국 실적 OR SEC 공시 OR 미국 가이던스 OR 미국 기업 실적",
    limit,
    "SEC / 실적",
    { hl: "ko", gl: "KR", ceid: "KR:ko" },
  );
}

export function dedupeNews(items: NewsItem[], limit?: number): NewsItem[] {
  const map = new Map<string, NewsItem>();
  for (const item of items) {
    const key = normalizeForMatch(item.title);
    if (!map.has(key)) map.set(key, item);
  }
  const deduped = Array.from(map.values()).sort((a, b) => {
    const aTs = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTs = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTs - aTs;
  });
  return typeof limit === "number" ? deduped.slice(0, limit) : deduped;
}

export function isRiskNews(item: NewsItem): boolean {
  const title = item.title;
  if (HIGH_IMPACT_NEGATIVE.some((word) => title.includes(word))) return true;
  return item.sentiment === "negative" && (item.score ?? 0) < 0;
}

export function getMatchedNewsForName(name: string, items: NewsItem[], limit = 2): NewsItem[] {
  const normalized = normalizeForMatch(name);
  return items.filter((item) => normalizeForMatch(item.title).includes(normalized)).slice(0, limit);
}

export function getMatchedNewsForAliases(aliases: string[], items: NewsItem[], limit = 2): NewsItem[] {
  const normalizedAliases = aliases
    .map((item) => normalizeForMatch(item))
    .filter(Boolean);
  if (normalizedAliases.length === 0) return [];
  return items.filter((item) =>
    normalizedAliases.some((alias) => normalizeForMatch(item.title).includes(alias))
  ).slice(0, limit);
}

export function buildHoldingNewsAlert(name: string, items: NewsItem[]): HoldingNewsAlert | null {
  const matched = getMatchedNewsForName(name, items, 3);
  if (matched.length === 0) return null;
  const riskItems = matched.filter((item) => isRiskNews(item));
  return { name, matched, riskItems };
}

export function buildHoldingNewsAlertForAliases(name: string, aliases: string[], items: NewsItem[]): HoldingNewsAlert | null {
  const matched = getMatchedNewsForAliases(aliases, items, 3);
  if (matched.length === 0) return null;
  const riskItems = matched.filter((item) => isRiskNews(item));
  return { name, matched, riskItems };
}

export function summarizeNewsKeywords(items: NewsItem[], limit = 6): NewsKeywordSummary[] {
  const keywordMap = new Map<string, { count: number; score: number }>();
  const keywordPool: Array<{ keyword: string; sentiment: "positive" | "negative" | "neutral" }> = [
    ...HIGH_IMPACT_POSITIVE.map((keyword) => ({ keyword, sentiment: "positive" as const })),
    ...HIGH_IMPACT_NEGATIVE.map((keyword) => ({ keyword, sentiment: "negative" as const })),
    ...NEUTRAL_KEYWORDS.map((keyword) => ({ keyword, sentiment: "neutral" as const })),
  ];

  for (const item of items) {
    for (const entry of keywordPool) {
      if (!item.title.includes(entry.keyword)) continue;
      const current = keywordMap.get(entry.keyword) ?? { count: 0, score: 0 };
      current.count += 1;
      current.score += entry.sentiment === "positive" ? 1 : entry.sentiment === "negative" ? -1 : 0;
      keywordMap.set(entry.keyword, current);
    }
  }

  return Array.from(keywordMap.entries())
    .map(([keyword, value]) => {
      const sentiment: NewsKeywordSummary["sentiment"] =
        value.score > 0 ? "positive" : value.score < 0 ? "negative" : "neutral";
      return {
        keyword,
        count: value.count,
        sentiment,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function fetchNewsSnapshot(market: NewsMarket = "kr"): Promise<NewsSnapshot> {
  const [naverNews, daumNews, disclosures] = await (market === "us"
    ? Promise.all([
        fetchUsMarketNews(),
        fetchUsEtfNews(),
        fetchUsDisclosureNews(),
      ])
    : Promise.all([
        fetchNaverNews(),
        fetchDaumNews(),
        fetchDisclosureNews(),
      ]));

  const latestNews = dedupeNews([...naverNews, ...daumNews], 10);
  const aiSentiment = dedupeNews([...latestNews, ...disclosures], 5);

  return {
    naverNews,
    daumNews,
    disclosures,
    aiSentiment,
    latestNews,
  };
}

export function scoreNewsForStock(
  stockName: string,
  items: NewsItem[],
  options?: { positiveBonus?: number; negativePenalty?: number }
): { bonus: number; label: string; matched: NewsItem[] } {
  const positiveBonus = options?.positiveBonus ?? 8;
  const negativePenalty = options?.negativePenalty ?? 8;
  const normalizedName = normalizeForMatch(stockName);
  const matched = items.filter((item) => normalizeForMatch(item.title).includes(normalizedName));
  if (matched.length === 0) return { bonus: 0, label: "", matched: [] };

  let rawBonus = 0;
  for (const item of matched) {
    const sentimentScore = item.score ?? 0;
    rawBonus += sentimentScore;
    if (HIGH_IMPACT_POSITIVE.some((word) => item.title.includes(word))) rawBonus += 2;
    if (HIGH_IMPACT_NEGATIVE.some((word) => item.title.includes(word))) rawBonus -= 2;
  }

  const bonus = rawBonus > 0
    ? Math.min(positiveBonus, rawBonus)
    : rawBonus < 0
      ? Math.max(-negativePenalty, rawBonus)
      : 0;
  const label = bonus === 0
    ? `뉴스 ${matched.length}건`
    : `뉴스 ${bonus > 0 ? "+" : ""}${bonus}`;

  return { bonus, label, matched: matched.slice(0, 3) };
}
