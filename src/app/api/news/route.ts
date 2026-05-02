import { NextResponse } from "next/server";

interface NewsItem {
  title: string;
  source: string;
  time: string;
  url: string;
  sentiment?: "positive" | "negative" | "neutral";
  score?: number;
  summary?: string;
}

// 긍정/부정 키워드 사전
const POSITIVE = ["급등", "상승", "신고가", "호실적", "흑자", "상향", "매수", "성장", "수주", "호재", "반등", "돌파", "최고", "강세", "확대", "개선", "증가", "배당"];
const NEGATIVE = ["급락", "하락", "폭락", "적자", "손실", "하향", "매도", "감소", "리스크", "악재", "부진", "위기", "하한가", "약세", "축소", "악화", "매각"];

function analyzeSentiment(title: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  let score = 0;
  for (const w of POSITIVE) { if (title.includes(w)) score += 1; }
  for (const w of NEGATIVE) { if (title.includes(w)) score -= 1; }
  return {
    sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral",
    score,
  };
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (isNaN(diff) || diff < 0) return "방금";
  if (diff < 1) return "방금";
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}

// Google News RSS 파싱 (CDATA 또는 plain text 모두 처리)
function parseGoogleRSS(xml: string, limit = 5): NewsItem[] {
  const allItems: Array<NewsItem & { _ts: number }> = [];

  // <item>...</item> 블록 추출
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // title: CDATA 또는 plain
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    if (!titleMatch) continue;
    let rawTitle = titleMatch[1].replace(/<[^>]+>/g, "").trim();

    // Google News 형식: "제목 - 출처" → 분리
    let source = "";
    const dashIdx = rawTitle.lastIndexOf(" - ");
    if (dashIdx > 0) {
      source = rawTitle.slice(dashIdx + 3).trim();
      rawTitle = rawTitle.slice(0, dashIdx).trim();
    }

    // source 태그가 있으면 우선 사용
    const sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>/);
    if (sourceMatch) source = sourceMatch[1].trim();

    // link
    const linkMatch = block.match(/<link>(.*?)<\/link>/);
    const url = linkMatch ? linkMatch[1].trim() : "#";

    // pubDate
    const dateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);
    const pubDate = dateMatch ? new Date(dateMatch[1].trim()) : new Date(0);
    const time = dateMatch ? getTimeAgo(pubDate) : "";

    if (rawTitle) {
      allItems.push({ title: rawTitle, source, time, url, _ts: pubDate.getTime() });
    }
  }

  // 최신순 정렬 후 limit 적용
  allItems.sort((a, b) => b._ts - a._ts);
  return allItems.slice(0, limit).map((item) => ({
    title: item.title,
    source: item.source,
    time: item.time,
    url: item.url,
    sentiment: item.sentiment,
    score: item.score,
    summary: item.summary,
  }));
}

// 네이버 금융 뉴스 (Google News RSS 경유)
async function fetchNaverNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      "https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC+%EC%A3%BC%EC%8B%9D&hl=ko&gl=KR&ceid=KR:ko",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 600 } },
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseGoogleRSS(xml, 6);
    return items.length > 0 ? items : [];
  } catch {
    return [];
  }
}

// 공시/실적 뉴스 (Google News RSS 경유)
async function fetchDisclosures(): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      "https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC+%EA%B3%B5%EC%8B%9C+%EC%8B%A4%EC%A0%81&hl=ko&gl=KR&ceid=KR:ko",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 600 } },
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseGoogleRSS(xml, 5);
    return items.length > 0 ? items : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const [naverNews, disclosures] = await Promise.all([
    fetchNaverNews(),
    fetchDisclosures(),
  ]);

  // AI 감성 분석
  const allNews = [...naverNews, ...disclosures];
  const aiSentiment: NewsItem[] = allNews.slice(0, 5).map((n) => {
    const { sentiment, score } = analyzeSentiment(n.title);
    return { ...n, sentiment, score, summary: sentiment === "positive" ? "매수 관점 긍정적" : sentiment === "negative" ? "리스크 주의 필요" : "중립적 시장 영향" };
  });

  return NextResponse.json({ naverNews, disclosures, aiSentiment });
}
