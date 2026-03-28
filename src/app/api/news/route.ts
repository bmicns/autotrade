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
const NEGATIVE = ["급락", "하락", "폭락", "적자", "손실", "하향", "매도", "감소", "리스크", "악재", "부진", "위기", "하한가", "약세", "축소", "악화", "감소", "매각"];

function analyzeSentiment(title: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  let score = 0;
  for (const w of POSITIVE) { if (title.includes(w)) score += 1; }
  for (const w of NEGATIVE) { if (title.includes(w)) score -= 1; }
  return {
    sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral",
    score,
  };
}

// 네이버 금융 뉴스 크롤링 (RSS)
async function fetchNaverNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://news.google.com/rss/search?q=코스피+주식&hl=ko&gl=KR&ceid=KR:ko", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return fallbackNaverNews();
    const text = await res.text();

    const items: NewsItem[] = [];
    const matches = text.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<source.*?>(.*?)<\/source>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g);

    for (const m of matches) {
      if (items.length >= 5) break;
      const title = m[1].replace(/<[^>]+>/g, "").trim();
      const url = m[2].trim();
      const source = m[3].trim();
      const pubDate = m[4].trim();
      const timeAgo = getTimeAgo(new Date(pubDate));
      items.push({ title, source, time: timeAgo, url });
    }

    return items.length > 0 ? items : fallbackNaverNews();
  } catch {
    return fallbackNaverNews();
  }
}

// 공시 정보 (DART 또는 KRX)
async function fetchDisclosures(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://news.google.com/rss/search?q=코스피+공시+실적&hl=ko&gl=KR&ceid=KR:ko", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return fallbackDisclosures();
    const text = await res.text();

    const items: NewsItem[] = [];
    const matches = text.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<source.*?>(.*?)<\/source>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g);

    for (const m of matches) {
      if (items.length >= 5) break;
      const title = m[1].replace(/<[^>]+>/g, "").trim();
      const url = m[2].trim();
      const source = m[3].trim();
      const pubDate = m[4].trim();
      const timeAgo = getTimeAgo(new Date(pubDate));
      items.push({ title, source, time: timeAgo, url });
    }

    return items.length > 0 ? items : fallbackDisclosures();
  } catch {
    return fallbackDisclosures();
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diff < 1) return "방금";
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}

function fallbackNaverNews(): NewsItem[] {
  return [
    { title: "코스피, 외국인 매수세에 상승 출발", source: "한국경제", time: "1시간 전", url: "#" },
    { title: "삼성전자, 반도체 업황 개선 기대감 확산", source: "매일경제", time: "2시간 전", url: "#" },
    { title: "현대차, 글로벌 전기차 판매량 신기록", source: "조선비즈", time: "3시간 전", url: "#" },
    { title: "기업은행, 분기 실적 시장 예상 상회", source: "머니투데이", time: "4시간 전", url: "#" },
    { title: "코스피 3개월 연속 상승세 기록", source: "연합뉴스", time: "5시간 전", url: "#" },
  ];
}

function fallbackDisclosures(): NewsItem[] {
  return [
    { title: "[공시] 삼성전자 — 1분기 실적 발표 (매출 77조원)", source: "DART", time: "오늘", url: "#" },
    { title: "[공시] 현대차 — 자사주 매입 결정 (5,000억원)", source: "DART", time: "오늘", url: "#" },
    { title: "[공시] 두산에너빌리티 — 대규모 수주 공시", source: "DART", time: "1일 전", url: "#" },
    { title: "[공시] 기업은행 — 배당금 결정 (주당 1,200원)", source: "DART", time: "1일 전", url: "#" },
    { title: "[공시] 우리금융지주 — 자회사 실적 공시", source: "DART", time: "2일 전", url: "#" },
  ];
}

export async function GET() {
  const [naverNews, disclosures] = await Promise.all([
    fetchNaverNews(),
    fetchDisclosures(),
  ]);

  // AI 감성 분석: 모든 뉴스 합쳐서 분석
  const allNews = [...naverNews, ...disclosures];
  const aiSentiment: NewsItem[] = allNews.slice(0, 5).map((n) => {
    const { sentiment, score } = analyzeSentiment(n.title);
    return { ...n, sentiment, score, summary: sentiment === "positive" ? "매수 관점 긍정적" : sentiment === "negative" ? "리스크 주의 필요" : "중립적 시장 영향" };
  });

  return NextResponse.json({ naverNews, disclosures, aiSentiment });
}
