/** @type {import('next').NextConfig} */
const isVercel = Boolean(process.env.VERCEL);
const isExport = !isVercel && (process.env.NEXT_EXPORT === "true" || process.env.NETLIFY === "true");

// URL ativa do túnel Cloudflare que conecta a Vercel à API local (.NET 10 na porta 5080)
const ACTIVE_TUNNEL_URL = "https://restricted-shower-positioning-heat.trycloudflare.com";

let apiBaseUrl = (process.env.API_BASE_URL || "").trim();
// Se não configurado, ou se estiver apontando para o túnel antigo expirado ou localhost na Vercel:
if (
  !apiBaseUrl ||
  apiBaseUrl.includes("helmet-retreat-qui-pursuant") ||
  (isVercel && (apiBaseUrl.includes("127.0.0.1") || apiBaseUrl.includes("localhost")))
) {
  apiBaseUrl = isVercel ? ACTIVE_TUNNEL_URL : (process.env.API_BASE_URL || "http://127.0.0.1:5080");
}
apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");

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
