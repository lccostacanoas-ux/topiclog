/** @type {import('next').NextConfig} */
const isVercel = Boolean(process.env.VERCEL);
const isExport = !isVercel && (process.env.NEXT_EXPORT === "true" || process.env.NETLIFY === "true");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true
  },
  ...(isExport ? { output: "export", trailingSlash: true } : {})
};

export default nextConfig;
