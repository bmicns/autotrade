"use client";

import { COLORS } from "@/lib/constants";
import type { NewsItem } from "@/lib/news";
import type { EngineControlSnapshot } from "./home-types";

interface KeywordStat {
  keyword: string;
  count: number;
  sentiment: "positive" | "negative" | "neutral";
}

interface NewsSectionProps {
  isUsView: boolean;
  newsTab: "naver" | "daum" | "dart";
  setNewsTab: (tab: "naver" | "daum" | "dart") => void;
  newsLoading: boolean;
  naverNews: NewsItem[];
  daumNews: NewsItem[];
  disclosures: NewsItem[];
  marketKeywords: KeywordStat[];
  engineControl: EngineControlSnapshot | null;
  aiSentiment: NewsItem[];
}

export function NewsSection({
  isUsView,
  newsTab,
  setNewsTab,
  newsLoading,
  naverNews,
  daumNews,
  disclosures,
  marketKeywords,
  engineControl,
  aiSentiment,
}: NewsSectionProps) {
  const activeNews = newsTab === "naver" ? naverNews : newsTab === "daum" ? daumNews : disclosures;

  return (
    <>
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>시장 뉴스</span>
        <div style={{ display: "flex", gap: 4, background: COLORS.sub, borderRadius: 8, padding: 3 }}>
          {(["naver", "daum", "dart"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setNewsTab(tab)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: newsTab === tab ? 700 : 500,
                fontFamily: "inherit",
                background: newsTab === tab ? "#fff" : "transparent",
                color: newsTab === tab ? COLORS.ink : COLORS.dim,
                boxShadow: newsTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {isUsView
                ? tab === "naver"
                  ? "미국시장"
                  : tab === "daum"
                    ? "미국ETF"
                    : "SEC/실적"
                : tab === "naver"
                  ? "네이버"
                  : tab === "daum"
                    ? "다음"
                    : "공시"}
            </button>
          ))}
        </div>
      </div>

      {newsLoading ? (
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>뉴스 로딩 중...</span>
        </div>
      ) : (
        <div>
          {activeNews.map((item, index) => (
            <div key={index}>
              <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.title}
                  </span>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{item.source}</span>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{item.time}</span>
                    {item.provider && (
                      <span style={{ fontSize: 10, color: COLORS.dim, padding: "2px 6px", borderRadius: 999, background: COLORS.sub }}>
                        {item.provider.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: COLORS.line }} />
            </div>
          ))}
        </div>
      )}

      {marketKeywords.length > 0 && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, letterSpacing: "0.05em", textTransform: "uppercase" }}>시장 뉴스 키워드</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>
              최근 뉴스 기준
              {engineControl ? ` · 쿨다운 ${engineControl.surge_news_risk_cooldown_minutes ?? 90}분` : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {marketKeywords.map((item) => (
              <span
                key={item.keyword}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: item.sentiment === "positive" ? COLORS.riseL : item.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                  color: item.sentiment === "positive" ? COLORS.rise : item.sentiment === "negative" ? COLORS.fall : COLORS.ink,
                  border: `1px solid ${item.sentiment === "positive" ? COLORS.riseB : item.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                }}
              >
                {item.keyword}
                <span style={{ color: COLORS.dim }}>{item.count}</span>
              </span>
            ))}
          </div>
          {engineControl && (
            <div style={{ marginTop: 10, fontSize: 11, color: COLORS.dim }}>
              뉴스 보너스 +{engineControl.surge_news_positive_bonus ?? 8} / 악재 패널티 -{engineControl.surge_news_negative_penalty ?? 8}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "24px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>AI 감성 분석</span>
      </div>
      <div style={{ padding: "0 20px 30px" }}>
        <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", background: COLORS.sub, padding: "10px 16px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>뉴스</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>감성</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>판단</span>
          </div>
          {aiSentiment.map((item, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", padding: "12px 16px", borderTop: `1px solid ${COLORS.line}`, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              <div style={{ textAlign: "center" }}>
                <span style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  background: item.sentiment === "positive" ? COLORS.riseL : item.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                  color: item.sentiment === "positive" ? COLORS.rise : item.sentiment === "negative" ? COLORS.fall : COLORS.dim,
                  border: `1px solid ${item.sentiment === "positive" ? COLORS.riseB : item.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                }}>
                  {item.sentiment === "positive" ? "긍정" : item.sentiment === "negative" ? "부정" : "중립"}
                </span>
              </div>
              <span style={{ fontSize: 11, color: COLORS.mid, textAlign: "right" }}>{item.summary}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
