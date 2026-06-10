/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@xegineer/renderer'],
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  staticPageGenerationTimeout: 120,
}

export default nextConfig
