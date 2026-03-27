import type { NextConfig } from 'next';

const securityHeaders = [
  // Force HTTPS for 2 years; include subdomains
  {
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Deny framing — API responses should never be embedded
  {
    key:   'X-Frame-Options',
    value: 'DENY',
  },
  // Prevent MIME-type sniffing
  {
    key:   'X-Content-Type-Options',
    value: 'nosniff',
  },
  // Referrer policy — don't leak URL on cross-origin requests
  {
    key:   'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Permissions policy — disable all browser features (API, so none needed)
  {
    key:   'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // Content Security Policy — API only, restrict everything
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',

  // Attach security headers to all /api/* responses
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
