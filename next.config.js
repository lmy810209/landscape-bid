/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pdf-parse는 Node 전용 native dep이라 Next 번들링에서 제외해야 함
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

module.exports = nextConfig;
