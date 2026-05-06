/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker standalone — Synology Container Manager용 최적화 빌드 (이미지 크기 ↓)
  output: "standalone",
  experimental: {
    // pdf-parse는 Node 전용 native dep이라 Next 번들링에서 제외해야 함
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

module.exports = nextConfig;
