/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@xegineer/renderer'],
  // Increase server timeout for slow sync/bootstrap API calls
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Proxy/DNS timeout for long-running API calls
  staticPageGenerationTimeout: 120,
}

export default nextConfig
