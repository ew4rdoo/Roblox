/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.rbxcdn.com" },
      { protocol: "https", hostname: "tr.rbxcdn.com" },
    ],
  },
};

module.exports = nextConfig;
