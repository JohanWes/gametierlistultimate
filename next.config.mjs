/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright drives the dev server over 127.0.0.1; allow it explicitly.
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.igdb.com' },
    ],
  },
};

export default nextConfig;
