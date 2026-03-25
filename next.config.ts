import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Engine is API-only — no static pages needed
  experimental: {
    // Enable server actions if needed later
  },
};

export default nextConfig;
