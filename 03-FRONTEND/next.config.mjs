import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the shared workspace types package so its CJS output is consumable
  // by the Next.js bundler (shared types across the monorepo).
  transpilePackages: ['@priora/shared-types'],
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default withNextIntl(nextConfig);