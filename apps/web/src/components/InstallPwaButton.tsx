"use client";

import React, { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallPwaButtonProps {
  readonly variant?: "menu" | "card" | "button";
  readonly onInstalled?: () => void;
}

export function InstallPwaButton({ variant = "menu", onInstalled }: InstallPwaButtonProps): React.JSX.Element | null {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Detecta se já está rodando como app standalone (PWA instalado)
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
      const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      return isStandaloneMedia || Boolean(isIosStandalone);
    };

    setIsStandalone(checkStandalone());

    // 2. Detecta iOS (iPhone, iPad, iPod)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIos(isIosDevice);

    // 3. Captura o evento nativo beforeinstallprompt (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // 4. Captura quando a instalação é concluída
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setInstalledSuccess(true);
      if (onInstalled) onInstalled();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [onInstalled]);

  const handleInstallClick = async () => {
    if (isStandalone) {
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstalledSuccess(true);
          setDeferredPrompt(null);
          if (onInstalled) onInstalled();
        }
      } catch (err) {
        console.warn("Erro ao abrir instalador nativo PWA:", err);
      }
      return;
    }

    if (isIos) {
      setShowIosModal(true);
      return;
    }

    // Caso o navegador não suporte ou não tenha disparado ainda o evento, exibe modal explicativo
    setShowIosModal(true);
  };

  if (isStandalone || installedSuccess) {
    if (variant === "menu") {
      return (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "#34D399",
            fontSize: "13px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span>✓</span>
          <span>Aplicativo TopicLog Instalado</span>
        </div>
      );
    }
    if (variant === "card") {
      return (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            backgroundColor: "#F0FDF4",
            border: "1px solid #86EFAC",
            color: "#166534",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >
          <span style={{ fontSize: "20px" }}>📱</span>
          <div>
            <strong>TopicLog em Modo Aplicativo</strong>
            <div style={{ fontSize: "12px", color: "#15803D" }}>
              Você já está utilizando a versão instalada em tela cheia.
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {variant === "menu" ? (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "10px",
            backgroundColor: "#1E3A8A",
            border: "1px solid #3B82F6",
            color: "#FFFFFF",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(30, 58, 138, 0.4)",
            textAlign: "left"
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📲</span>
            <span>Instalar Aplicativo TopicLog</span>
          </span>
          <span style={{ fontSize: "11px", backgroundColor: "#2563EB", padding: "2px 8px", borderRadius: "6px" }}>
            Grátis
          </span>
        </button>
      ) : variant === "card" ? (
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "16px",
            padding: "20px",
            border: "1.5px solid #BFDBFE",
            boxShadow: "0 4px 12px rgba(30, 58, 138, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                backgroundColor: "#1E3A8A",
                color: "#FFFFFF",
                fontSize: "18px",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 6px rgba(30, 58, 138, 0.3)"
              }}
            >
              TL
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                Instalar Aplicativo no Celular
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
                Acesse mais rápido em tela cheia com ícone na tela inicial
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#1E3A8A",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 2px 8px rgba(30, 58, 138, 0.25)"
            }}
          >
            <span>📲</span>
            <span>Instalar TopicLog Agora</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="btn btn--primary"
          style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <span>📲</span>
          <span>Instalar App</span>
        </button>
      )}

      {/* Modal Explicativo para iOS / Safari ou Navegadores com Instalação Manual */}
      {showIosModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }}
          onClick={() => setShowIosModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "20px",
              maxWidth: "400px",
              width: "100%",
              padding: "24px 20px",
              textAlign: "center",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              aria-label="Fechar"
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "#F1F5F9",
                border: "none",
                fontSize: "16px",
                fontWeight: 700,
                color: "#64748B",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              ✕
            </button>

            <div style={{ fontSize: "36px", marginBottom: "8px" }}>📲</div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
              Como Instalar no {isIos ? "iPhone / iPad" : "seu Celular"}
            </h3>

            {isIos ? (
              <div style={{ textAlign: "left", fontSize: "14px", color: "#334155", lineHeight: 1.6, margin: "16px 0" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "12px" }}>
                  <span style={{ backgroundColor: "#1E3A8A", color: "#FFFFFF", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 }}>
                    1
                  </span>
                  <span>
                    Toque no botão de <strong>Compartilhar</strong> (ícone do quadrado com a seta para cima <strong style={{ fontSize: "16px" }}>⎋</strong>) na barra inferior do Safari.
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "12px" }}>
                  <span style={{ backgroundColor: "#1E3A8A", color: "#FFFFFF", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 }}>
                    2
                  </span>
                  <span>
                    Role a lista para baixo e toque em <strong>&quot;Adicionar à Tela de Início&quot;</strong> (ícone <strong>➕</strong>).
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ backgroundColor: "#1E3A8A", color: "#FFFFFF", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 }}>
                    3
                  </span>
                  <span>
                    No canto superior direito, toque em <strong>&quot;Adicionar&quot;</strong>. Pronto! O TopicLog abrirá em tela cheia como um app nativo.
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "left", fontSize: "14px", color: "#334155", lineHeight: 1.6, margin: "16px 0" }}>
                <p style={{ margin: "0 0 10px 0" }}>
                  1. Toque nos <strong>três pontos (⋮)</strong> no canto superior direito do seu navegador (Chrome/Samsung).
                </p>
                <p style={{ margin: "0 0 10px 0" }}>
                  2. Selecione a opção <strong>&quot;Instalar aplicativo&quot;</strong> ou <strong>&quot;Adicionar à tela inicial&quot;</strong>.
                </p>
                <p style={{ margin: 0 }}>
                  3. Confirme em <strong>&quot;Instalar&quot;</strong> para ter acesso rápido e em tela cheia.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: "#1E3A8A",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                marginTop: "10px"
              }}
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
