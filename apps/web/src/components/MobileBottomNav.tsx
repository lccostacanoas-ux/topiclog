"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const NAV_ITEMS = [
  { href: "/", label: "Início", icon: "🏠" },
  { href: "/feed", label: "Encomendas", icon: "📦" },
  { href: "/encomendas/publicar", label: "Publicar", icon: "➕", isAccent: true },
  { href: "/minhas-atividades", label: "Atividades", icon: "⚡" },
  { href: "/minha-conta", label: "Perfil", icon: "👤" }
];

export function MobileBottomNav(): React.JSX.Element | null {
  const pathname = usePathname();

  // Ocultar a barra inferior mobile quando dentro do painel administrativo (/admin)
  if (pathname.startsWith("/admin")) {
    return null;
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      <nav
        className="topiclog-mobile-nav"
        aria-label="Navegação móvel principal"
        role="navigation"
      >
        <div className="topiclog-mobile-nav-container">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`topiclog-mobile-nav-item ${active ? "active" : ""} ${item.isAccent ? "accent-btn" : ""}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                  minWidth: "56px",
                  minHeight: "48px",
                  color: active ? "#38BDF8" : item.isAccent ? "#FFFFFF" : "#94A3B8",
                  fontSize: "11px",
                  fontWeight: active ? 700 : 600,
                  gap: "3px",
                  WebkitTapHighlightColor: "transparent"
                }}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={`topiclog-mobile-nav-icon ${item.isAccent ? "accent-icon" : ""}`}
                  style={
                    item.isAccent
                      ? {
                          background: "linear-gradient(135deg, #1D4ED8 0%, #059669 100%)",
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "18px",
                          color: "#FFFFFF",
                          marginTop: "-14px",
                          boxShadow: "0 2px 10px rgba(29, 78, 216, 0.45)"
                        }
                      : { fontSize: "20px", lineHeight: 1 }
                  }
                >
                  {item.icon}
                </span>
                <span
                  className="topiclog-mobile-nav-label"
                  style={{ lineHeight: 1, textDecoration: "none" }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <style jsx>{`
        .topiclog-mobile-nav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          min-height: 64px;
          background-color: #0B132B;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          z-index: 999;
          box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.35);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }

        .topiclog-mobile-nav-container {
          display: flex;
          height: 64px;
          align-items: center;
          justify-content: space-around;
          max-width: 600px;
          margin: 0 auto;
          padding: 0 8px;
        }

        .topiclog-mobile-nav-item:active {
          transform: scale(0.94);
        }

        @media (max-width: 768px) {
          .topiclog-mobile-nav {
            display: block;
          }
          :global(body) {
            padding-bottom: 72px;
          }
        }
      `}</style>
    </>
  );
}
