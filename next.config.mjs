/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // allow larger uploads via server actions if needed (episodes can be big)
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
