import type { NextConfig } from 'next';
const basePath = process.env.PAGES_BASE_PATH || '';
const config: NextConfig = { output: 'export', basePath, images: { unoptimized: true }, poweredByHeader: false, devIndicators: false };
export default config;
