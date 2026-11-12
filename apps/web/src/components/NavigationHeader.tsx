"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import {
  getNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi
} from "../lib/api-client";
import { useAuth } from "../lib/auth-context";
import type { UserNotificationDto } from "../lib/types";

export function NavigationHeader(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<readonly UserNotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    const res = await getNotificationsApi(token);
    if (res.ok && res.data) {
      setNotifications(res.data.items);
      setUnreadCount(res.data.unreadCount);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    void loadNotifications();
    if (!isAuthenticated || !token) return;
    const timer = setInterval(() => {
      void loadNotifications();
    }, 8000);
    return () => clearInterval(timer);
  }, [loadNotifications, isAuthenticated, token]);

  const handleOpenNotification = async (item: UserNotificationDto) => {
    if (!item.isRead && token) {
      await markNotificationReadApi(item.id, token);
      void loadNotifications();
    }
    setNotificationsOpen(false);
    if (item.href) {
      router.push(item.href);
    }
  };

  const handleMarkAllRead = async () => {
    if (token) {
      await markAllNotificationsReadApi(token);
      void loadNotifications();
    }
    setNotificationsOpen(false);
  };
  const displayName: string = user?.displayName?.split(" ")[0] || "Topic Log";
  const isCarrier = Boolean(user?.roles?.includes("CARRIER"));
  const isSender = Boolean(user?.roles?.includes("SENDER"));
  const isCarrierOnly = isCarrier && !isSender;
  const isSenderOnly = isSender && !isCarrier;

  const isLinkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header
      style={{
        backgroundColor: "var(--color-brand-deep-navy)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        transition: "all 0.2s ease"
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 16px",
          minHeight: "56px"
        }}
      >
        {/* Barra Superior Mobile Nativa (Estilo CDT e Meu INSS) */}
        <div
          className="mobile-top-bar"
          style={{
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            height: "48px"
          }}
        >
          {/* Hambúrguer + Nome do Usuário */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "26px",
                cursor: "pointer",
                padding: "4px 6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1
              }}
              aria-label="Menu"
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
            <Link href="/" style={{ textDecoration: "none", color: "#FFFFFF" }}>
              <span style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.4px" }}>
                {displayName}
              </span>
            </Link>
          </div>

          {/* Notificações + Foto Avatar (Apenas se autenticado) */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isAuthenticated && user ? (
              <>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(true)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    padding: "6px",
                    display: "flex",
                    alignItems: "center"
                  }}
                  aria-label="Ver notificações"
                >
                  <span style={{ fontSize: "22px" }}>🔔</span>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: "2px",
                        right: "2px",
                        backgroundColor: "#EF4444",
                        color: "#FFFFFF",
                        fontSize: "10px",
                        fontWeight: 800,
                        borderRadius: "999px",
                        minWidth: "16px",
                        height: "16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 4px"
                      }}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                <Link
                  href="/minha-conta"
                  style={{
                    display: "block",
                    textDecoration: "none"
                  }}
                  aria-label="Meu Perfil"
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                      border: "2px solid #FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFFFFF",
                      fontWeight: 800,
                      fontSize: "14px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
                    }}
                  >
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                </Link>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Link
                  href="/entrar"
                  style={{
                    color: "#FFFFFF",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 700,
                    padding: "6px 12px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "rgba(255, 255, 255, 0.12)",
                    border: "1px solid rgba(255, 255, 255, 0.25)"
                  }}
                >
                  Entrar
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Conteúdo Desktop Original */}
        <div className="desktop-header-content" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        {/* Marca Topic Log */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #1D4ED8 0%, #059669 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontSize: "16px",
              fontWeight: 800,
              boxShadow: "0 2px 8px rgba(29, 78, 216, 0.3)"
            }}
            aria-hidden="true"
          >
            TL
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px" }}>
              Topic Log
            </span>
            <span
              style={{
                fontSize: "11px",
                color: "#94A3B8",
                fontWeight: 700,
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                padding: "2px 6px",
                borderRadius: "4px"
              }}
            >
              MG
            </span>
          </div>
        </Link>

        {/* Navegação Desktop Completa Adaptativa por Papel */}
        <nav
          aria-label="Navegação principal"
          className="desktop-nav"
          style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "nowrap" }}
        >
          <Link
            href="/"
            style={{
              color: isLinkActive("/") && pathname === "/" ? "#FFFFFF" : "#CBD5E1",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: isLinkActive("/") && pathname === "/" ? 700 : 500,
              padding: "6px 4px",
              whiteSpace: "nowrap",
              borderBottom: isLinkActive("/") && pathname === "/" ? "2px solid #38BDF8" : "2px solid transparent",
              transition: "color 0.15s ease, border-color 0.15s ease"
            }}
          >
            Início
          </Link>

          {isCarrierOnly ? (
            <>
              {/* Menu do Transportador: Leci */}
              <Link
                href="/feed"
                id="header-mural-fretes"
                style={{
                  color: isLinkActive("/feed") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/feed") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/feed") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Mural de Encomendas
              </Link>
              <Link
                href="/viagens"
                style={{
                  color: isLinkActive("/viagens") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/viagens") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/viagens") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Mural de Viagens
              </Link>
              <Link
                href="/propostas"
                style={{
                  color: isLinkActive("/propostas") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/propostas") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/propostas") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Minhas Propostas
              </Link>
            </>
          ) : isSenderOnly ? (
            <>
              {/* Menu do Remetente */}
              <Link
                href="/encomendas"
                style={{
                  color: isLinkActive("/encomendas") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/encomendas") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/encomendas") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Minhas Encomendas
              </Link>
              <Link
                href="/viagens"
                style={{
                  color: isLinkActive("/viagens") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/viagens") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/viagens") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Mural de Viagens
              </Link>
              <Link
                href="/minhas-atividades"
                style={{
                  color: isLinkActive("/minhas-atividades") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/minhas-atividades") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/minhas-atividades") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Rastrear Encomenda
              </Link>
              <Link
                href="/propostas"
                style={{
                  color: isLinkActive("/propostas") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/propostas") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/propostas") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Propostas
              </Link>
            </>
          ) : isCarrier && isSender ? (
            <>
              {/* Usuário com Ambos os Papéis */}
              <Link
                href="/encomendas"
                style={{
                  color: isLinkActive("/encomendas") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/encomendas") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/encomendas") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Minhas Encomendas
              </Link>
              <Link
                href="/feed"
                style={{
                  color: isLinkActive("/feed") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/feed") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/feed") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Mural de Encomendas
              </Link>
              <Link
                href="/viagens"
                style={{
                  color: isLinkActive("/viagens") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/viagens") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/viagens") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Mural de Viagens
              </Link>
              <Link
                href="/propostas"
                style={{
                  color: isLinkActive("/propostas") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/propostas") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/propostas") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Propostas
              </Link>
            </>
          ) : null}

          {isAuthenticated && user && (
            <>
              <Link
                href="/mensagens"
                style={{
                  color: isLinkActive("/mensagens") ? "#FFFFFF" : "#CBD5E1",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: isLinkActive("/mensagens") ? 700 : 500,
                  padding: "6px 4px",
                  whiteSpace: "nowrap",
                  borderBottom: isLinkActive("/mensagens") ? "2px solid #38BDF8" : "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease"
                }}
              >
                Mensagens
              </Link>
            </>
          )}
        </nav>

        {/* Ações Rápidas & Autenticação */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Botão Destaque Contextual (somente usuário conectado) */}
          {isAuthenticated && user && (
            isCarrierOnly ? (
              <Link
                href="/viagens/cadastrar"
                className="btn btn--primary header-cta-btn"
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 700,
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "#059669",
                  boxShadow: "0 2px 6px rgba(5, 150, 105, 0.3)"
                }}
              >
                + Cadastrar Viagem
              </Link>
            ) : (
              <Link
                href="/encomendas/publicar"
                className="btn btn--primary header-cta-btn"
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 700,
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "#2563EB",
                  boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)"
                }}
              >
                + Publicar Encomenda
              </Link>
            )
          )}

          {isAuthenticated && user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setNotificationsOpen(true)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "999px",
                  cursor: "pointer",
                  position: "relative",
                  padding: "6px 10px",
                  display: "flex",
                  alignItems: "center",
                  color: "#FFFFFF"
                }}
                aria-label="Notificações"
                title="Notificações"
              >
                <span style={{ fontSize: "16px" }}>🔔</span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      backgroundColor: "#EF4444",
                      color: "#FFFFFF",
                      fontSize: "10px",
                      fontWeight: 800,
                      borderRadius: "999px",
                      minWidth: "18px",
                      height: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px"
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <Link
                href="/minha-conta"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  textDecoration: "none",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  padding: "6px 12px",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid rgba(255, 255, 255, 0.15)"
                }}
                title="Minha Conta"
              >
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    backgroundColor: "#1D4ED8",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#FFFFFF" }}>
                  {user.displayName.split(" ")[0]}
                </span>
                {user.kycStatus === "VERIFIED" && (
                  <span style={{ color: "#10B981", fontSize: "13px", fontWeight: 800 }} title="KYC Aprovado">
                    ✓
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={logout}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94A3B8",
                  fontSize: "13px",
                  cursor: "pointer",
                  padding: "6px 8px"
                }}
                title="Encerrar sessão"
              >
                Sair
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Link
                href="/entrar"
                style={{
                  color: "#FFFFFF",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  padding: "6px 10px"
                }}
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                style={{
                  padding: "6px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "rgba(255, 255, 255, 0.12)",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center"
                }}
              >
                Cadastrar
              </Link>
            </div>
          )}

          {/* Botão Hambúrguer Mobile */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#FFFFFF",
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "18px",
              cursor: "pointer",
              minHeight: "44px",
              minWidth: "44px"
            }}
            className="mobile-menu-btn"
            aria-label="Abrir menu de navegação"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
        </div>
      </div>

      {/* Modal de Notificações Mobile */}
      {notificationsOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "16px"
          }}
          onClick={() => setNotificationsOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#1E293B",
              borderRadius: "20px",
              padding: "20px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              border: "1px solid #334155",
              color: "#FFFFFF"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>🔔</span>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>Notificações</h3>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                style={{ background: "transparent", border: "none", color: "#94A3B8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "340px", overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div
                  style={{
                    backgroundColor: "#0F172A",
                    padding: "18px 14px",
                    borderRadius: "12px",
                    border: "1px solid #334155",
                    textAlign: "center"
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#E2E8F0", marginBottom: "4px" }}>
                    Nenhuma notificação no momento
                  </div>
                  <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                    Novas propostas, pagamentos Pix e atualizações de entregas aparecerão aqui.
                  </div>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleOpenNotification(n)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      backgroundColor: n.isRead ? "#0F172A" : "#172554",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: `1px solid ${n.isRead ? "#334155" : "#3B82F6"}`,
                      cursor: "pointer",
                      color: "#F8FAFC"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#FFFFFF" }}>
                        {!n.isRead ? "● " : ""}{n.title}
                      </span>
                      <span style={{ fontSize: "10px", color: "#94A3B8", whiteSpace: "nowrap" }}>
                        {new Date(n.createdAtUtc).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#CBD5E1", lineHeight: 1.4 }}>{n.message}</div>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              style={{
                width: "100%",
                marginTop: "16px",
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "10px",
                padding: "10px",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer"
              }}
            >
              Marcar Todas como Lidas
            </button>
          </div>
        </div>
      )}

      {/* Drawer de Navegação Mobile */}
      {mobileMenuOpen && (
        <div
          style={{
            backgroundColor: "var(--color-brand-deep-navy)",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            padding: "16px 20px 88px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            maxHeight: "calc(100vh - 64px)",
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)"
          }}
        >
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              color: "#FFFFFF",
              textDecoration: "none",
              fontSize: "15px",
              fontWeight: 600,
              padding: "10px 0",
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
            }}
          >
            🏠 Início
          </Link>
          {isAuthenticated && user ? (
            <>
              {isCarrierOnly ? (
                <>
                  <Link
                    href="/feed"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#FFFFFF",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    🚚 Mural de Encomendas
                  </Link>
                  <Link
                    href="/viagens"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#FFFFFF",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    🛣️ Mural de Viagens
                  </Link>
                  <Link
                    href="/viagens/cadastrar"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#34D399",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 700,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    ➕ Cadastrar Nova Viagem
                  </Link>
                  <Link
                    href="/propostas"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#FFFFFF",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    🤝 Minhas Propostas
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/encomendas"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#FFFFFF",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    📦 Minhas Encomendas
                  </Link>
                  <Link
                    href="/encomendas/publicar"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#60A5FA",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 700,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    ➕ Publicar Encomenda
                  </Link>
                  <Link
                    href="/viagens"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#FFFFFF",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    🛣️ Mural de Viagens
                  </Link>
                  <Link
                    href="/minhas-atividades"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#FFFFFF",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    📍 Acompanhe sua Encomenda
                  </Link>
                  <Link
                    href="/propostas"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      color: "#FFFFFF",
                      textDecoration: "none",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                    }}
                  >
                    🤝 Propostas e Negociações
                  </Link>
                </>
              )}
              <Link
                href="/mensagens"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: "#FFFFFF",
                  textDecoration: "none",
                  fontSize: "15px",
                  fontWeight: 600,
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                }}
              >
                💬 Mensagens e Chat Seguro
              </Link>
              <Link
                href="/minha-conta"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: "#FFFFFF",
                  textDecoration: "none",
                  fontSize: "15px",
                  fontWeight: 600,
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                }}
              >
                👤 Minha Conta & Perfil
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void logout();
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "#EF4444",
                  fontSize: "15px",
                  fontWeight: 600,
                  padding: "10px 0",
                  textAlign: "left",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
                }}
              >
                🚪 Sair da Conta
              </button>
              <div style={{ paddingTop: "8px", display: "flex", gap: "10px" }}>
                <Link
                  href="/encomendas/publicar"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn btn--primary btn--touch"
                  style={{ flex: 1, fontSize: "14px", fontWeight: 700, textAlign: "center" }}
                >
                  + Publicar Encomenda
                </Link>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 0", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <Link
                href="/entrar"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: "#38BDF8",
                  textDecoration: "none",
                  fontSize: "15px",
                  fontWeight: 700
                }}
              >
                🔑 Entrar na Conta
              </Link>
              <Link
                href="/cadastro"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: "#34D399",
                  textDecoration: "none",
                  fontSize: "15px",
                  fontWeight: 700
                }}
              >
                ✨ Criar Conta Gratuita
              </Link>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @media (max-width: 768px) {
          :global(.header-cta-btn) {
            display: none !important;
          }
        }
        @media (max-width: 992px) {
          :global(.desktop-nav) {
            display: none !important;
          }
          :global(.mobile-menu-btn) {
            display: inline-flex !important;
          }
        }
        @media (min-width: 993px) {
          :global(.mobile-menu-btn) {
            display: none !important;
          }
        }
      `}</style>
    </header>
  );
}
