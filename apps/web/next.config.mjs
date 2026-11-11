/** @type {import('next').NextConfig} */
const isVercel = Boolean(process.env.VERCEL);
const isExport = !isVercel && (process.env.NEXT_EXPORT === "true" || process.env.NETLIFY === "true");
const apiBaseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:5080").replace(/\/+$/, "");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true
  },
  ...(!isExport
    ? {
        async rewrites() {
          return [
            {
              source: "/api/v1/:path*",
              destination: `${apiBaseUrl}/api/v1/:path*`
            }
          ];
        }
      }
    : {}),
  ...(isExport ? { output: "export", trailingSlash: true } : {})
};

export default nextConfig;
