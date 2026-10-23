import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google OAuth profile pictures
      },
      {
        protocol: 'https',
        hostname: 'graph.facebook.com', // Facebook OAuth profile pictures
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()'
          },
        ],
      },
    ];
  },

  // Development-only ngrok origins
  ...(process.env.NODE_ENV === 'development' && {
    experimental: {
      // @ts-expect-error - allowedDevOrigins not yet in Next.js type defs
      allowedDevOrigins: [
        "https://tamera-unpestered-undevastatingly.ngrok-free.dev",
        "http://localhost:3001",
      ],
    },
  }),
};

export default withNextIntl(nextConfig);
