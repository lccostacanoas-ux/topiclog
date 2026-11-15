import type { Metadata, Viewport } from "next";
import React from "react";
import { NavigationHeader } from "../components/NavigationHeader";
import { AuthProvider } from "../lib/auth-context";
import { PwaRegister } from "../components/PwaRegister";
import { CapacitorInit } from "../components/CapacitorInit";
import { OfflineBanner } from "../components/OfflineBanner";
import { InstallAppPrompt } from "../components/InstallAppPrompt";
import { MobileBottomNav } from "../components/MobileBottomNav";
import "leaflet/dist/leaflet.css";
import "../styles/tokens.css";

export const metadata: Metadata = {
  title: "TopicLog — Logística e Fretes",
  description:
    "Plataforma inteligente de transporte, encomendas e fretes com custódia protegida.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TopicLog"
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: "#1E3A8A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <meta name="application-name" content="TopicLog" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TopicLog" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#1E3A8A" />
        <meta name="msapplication-TileColor" content="#0F172A" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>
        <PwaRegister />
        <CapacitorInit />
        <OfflineBanner />
        <a href="#main-content" className="skip-link">
          Pular para o conteúdo principal
        </a>
        <AuthProvider>
          <NavigationHeader />
          <main id="main-content">{children}</main>
          <MobileBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
