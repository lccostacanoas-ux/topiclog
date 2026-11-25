/** @type {import('next').NextConfig} */
const isVercel = Boolean(process.env.VERCEL);
const isExport = !isVercel && (process.env.NEXT_EXPORT === "true" || process.env.NETLIFY === "true");

// Backend API oficial em produção na VPS Linux (.NET 10 LTS na porta 5080)
const VPS_API_URL = "http://45.180.218.247:5080";

let apiBaseUrl = (process.env.API_BASE_URL || "").trim();
// Se não configurado, ou se estiver apontando para túnel antigo expirado ou localhost na Vercel:
if (
  !apiBaseUrl ||
  apiBaseUrl.includes("trycloudflare.com") ||
  apiBaseUrl.includes("helmet-retreat-qui-pursuant") ||
  (isVercel && (apiBaseUrl.includes("127.0.0.1") || apiBaseUrl.includes("localhost")))
) {
  apiBaseUrl = isVercel ? VPS_API_URL : (process.env.API_BASE_URL || "http://127.0.0.1:5080");
}
apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    ASAAS_ENVIRONMENT: process.env.ASAAS_ENVIRONMENT || "production",
    ASAAS_API_URL: process.env.ASAAS_API_URL || "https://api.asaas.com/v3"
  },
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
