/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // small Docker image for Azure Container Apps
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.blob.core.windows.net' }],
  },
};

export default nextConfig;
