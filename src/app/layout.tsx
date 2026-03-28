import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXIO — 주식 자동매매",
  description: "KIS API 기반 국내 주식 자동매매 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
