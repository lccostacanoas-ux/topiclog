import type { Metadata, Viewport } from "next";
import React from "react";
import { NavigationHeader } from "../components/NavigationHeader";
import { AuthProvider } from "../lib/auth-context";
import { PwaRegister } from "../components/PwaRegister";
import { CapacitorInit } from "../components/CapacitorInit";
import { OfflineBanner } from "../components/OfflineBanner";
import { InstallAppPrompt } from "../components/InstallAppPrompt";
import { MobileBottomNav } from "../components/MobileBottomNav";
import "../styles/tokens.css";

export const metadata: Metadata = {
  title: "Topic Log — Marketplace de Pequenas Encomendas e Rotas em Minas Gerais (Ambiente de Testes)",
  description:
    "Protótipo técnico da plataforma Topic Log para todo o estado de Minas Gerais, com piloto prioritário em João Monlevade e Belo Horizonte.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Topic Log"
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="application-name" content="Topic Log" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Topic Log" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        <PwaRegister />
        <CapacitorInit />
        <OfflineBanner />
        <a href="#main-content" className="skip-link">
          Pular para o conteúdo principal
        </a>
        <div className="env-banner" role="region" aria-label="Aviso de ambiente de testes">
          <div className="container">
            <strong>Ambiente de Testes (Sandbox — D14):</strong> Nenhuma transação financeira real, apólice de seguro
            ou promessa comercial ativa está habilitada nesta fase. Nome de trabalho <strong>Topic Log</strong> (domínio
            pretendido <code>www.topiclog.com.br</code> sujeito a verificação de registro/INPI — D01).
          </div>
        </div>
        <AuthProvider>
          <NavigationHeader />
          <main id="main-content">{children}</main>
          <InstallAppPrompt />
          <MobileBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
