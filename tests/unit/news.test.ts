import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSentiment, buildHoldingNewsAlert, decodeResponseText, getMatchedNewsForName, isRiskNews, parseGoogleRSS, scoreNewsForStock, summarizeNewsKeywords } from "../../src/lib/news";

test("analyzeSentiment detects positive and negative headlines", () => {
  assert.deepEqual(analyzeSentiment("삼성전자 호실적에 신고가"), { sentiment: "positive", score: 2 });
  assert.deepEqual(analyzeSentiment("카카오 유상증자 우려에 급락"), { sentiment: "negative", score: -2 });
});

test("parseGoogleRSS normalizes rss items", () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title><![CDATA[삼성전자 호실적 - 연합뉴스]]></title>
          <link>https://example.com/a</link>
          <pubDate>Tue, 06 May 2026 01:00:00 GMT</pubDate>
          <source>연합뉴스</source>
        </item>
      </channel>
    </rss>
  `;

  const items = parseGoogleRSS(xml, 3, "google");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "삼성전자 호실적");
  assert.equal(items[0].source, "연합뉴스");
  assert.equal(items[0].provider, "google");
  assert.equal(items[0].sentiment, "positive");
});

test("decodeResponseText honors content-type charset", () => {
  const text = "시장 뉴스";
  const bytes = new TextEncoder().encode(text);
  const decoded = decodeResponseText(Buffer.from(bytes), "text/html; charset=utf-8");
  assert.equal(decoded, text);
});

test("scoreNewsForStock applies bonuses for matched positive news", () => {
  const result = scoreNewsForStock("삼성전자", [
    { title: "삼성전자 대형 수주 계약", source: "네이버 금융", time: "방금", url: "#", score: 2, sentiment: "positive" },
    { title: "코스피 상승 마감", source: "다음 뉴스", time: "방금", url: "#", score: 1, sentiment: "positive" },
  ]);

  assert.equal(result.matched.length, 1);
  assert.equal(result.bonus, 4);
  assert.match(result.label, /뉴스 \+4/);
});

test("scoreNewsForStock applies penalties for matched negative news", () => {
  const result = scoreNewsForStock("카카오", [
    { title: "카카오 유상증자 검토", source: "다음 뉴스", time: "방금", url: "#", score: -1, sentiment: "negative" },
  ]);

  assert.equal(result.matched.length, 1);
  assert.equal(result.bonus, -3);
  assert.match(result.label, /뉴스 -3/);
});

test("isRiskNews detects negative high impact headlines", () => {
  assert.equal(isRiskNews({ title: "카카오 유상증자 검토", source: "다음 뉴스", time: "방금", url: "#", score: -1, sentiment: "negative" }), true);
  assert.equal(isRiskNews({ title: "삼성전자 대형 수주 계약", source: "네이버 금융", time: "방금", url: "#", score: 2, sentiment: "positive" }), false);
});

test("summarizeNewsKeywords counts recurring market keywords", () => {
  const summary = summarizeNewsKeywords([
    { title: "삼성전자 반도체 호실적", source: "네이버 금융", time: "방금", url: "#", score: 2, sentiment: "positive" },
    { title: "SK하이닉스 반도체 공급 확대", source: "다음 뉴스", time: "방금", url: "#", score: 2, sentiment: "positive" },
    { title: "카카오 유상증자 검토", source: "다음 뉴스", time: "방금", url: "#", score: -1, sentiment: "negative" },
  ]);

  assert.equal(summary[0]?.keyword, "반도체");
  assert.equal(summary[0]?.count, 2);
  assert.equal(summary[0]?.sentiment, "neutral");
  assert.equal(summary.some((item) => item.keyword === "유상증자" && item.sentiment === "negative"), true);
});

test("buildHoldingNewsAlert returns matched and risk items for holdings", () => {
  const items = [
    { title: "카카오 유상증자 검토", source: "다음 뉴스", time: "방금", url: "#", score: -1, sentiment: "negative" as const },
    { title: "카카오 신규 서비스 출시", source: "네이버 금융", time: "방금", url: "#", score: 0, sentiment: "neutral" as const },
  ];

  assert.equal(getMatchedNewsForName("카카오", items).length, 2);
  const alert = buildHoldingNewsAlert("카카오", items);
  assert.ok(alert);
  assert.equal(alert?.matched.length, 2);
  assert.equal(alert?.riskItems.length, 1);
});
