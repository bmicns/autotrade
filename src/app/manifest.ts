import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEXIO",
    short_name: "NEXIO",
    description: "KIS API 기반 국내 주식 자동매매 시스템",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0B0F",
    theme_color: "#0B0B0F",
    icons: [
      {
        src: "/icons/nexio-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/nexio-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/nexio-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
