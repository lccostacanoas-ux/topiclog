"use client";

import React, { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallAppPrompt(): React.JSX.Element | null {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    // Verificar se já está rodando em modo standalone (PWA instalado)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      return;
    }

    // Verificar se o usuário já dispensou nos últimos 3 dias
    const dismissedAt = localStorage.getItem("topiclog_pwa_dismissed_at");
    if (dismissedAt) {
      const daysSinceDismiss = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismiss < 3) {
        return;
      }
    }

    // Detectar iOS (iPhone / iPad)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);

    if (isAppleDevice) {
      setIsIos(true);
      setIsVisible(true);
      return;
    }

    // Capturar evento de instalação nativo no Android / Chrome / Edge
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("topiclog_pwa_dismissed_at", Date.now().toString());
    setIsVisible(false);
    setShowIosInstructions(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <div
        className="topiclog-install-prompt"
        style={{
          position: "fixed",
          bottom: "76px",
          left: "16px",
          right: "16px",
          maxWidth: "480px",
          margin: "0 auto",
          backgroundColor: "#1E293B",
          color: "#F8FAFC",
          borderRadius: "12px",
          padding: "14px 16px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
          border: "1px solid #334155",
          zIndex: 998,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          animation: "slideUp 0.3s ease-out"
        }}
        role="dialog"
        aria-label="Instalação do Aplicativo Topic Log"
      >
        <img
          src="/icons/icon-192.png"
          alt="Ícone Topic Log"
          style={{ width: "44px", height: "44px", borderRadius: "10px", flexShrink: 0 }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#FFFFFF" }}>
            Instalar Topic Log
          </div>
          <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "2px", lineHeight: "1.3" }}>
            Acesso rápido direto da tela inicial do seu celular.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={handleInstallClick}
            style={{
              backgroundColor: "#2563EB",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            {isIos ? "Como Instalar" : "Instalar"}
          </button>

          <button
            onClick={handleDismiss}
            aria-label="Fechar aviso"
            style={{
              backgroundColor: "transparent",
              color: "#64748B",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {showIosInstructions && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "16px"
          }}
          onClick={() => setShowIosInstructions(false)}
        >
          <div
            style={{
              backgroundColor: "#1E293B",
              color: "#F8FAFC",
              borderRadius: "16px",
              padding: "20px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
              border: "1px solid #334155"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", fontWeight: 700, color: "#FFFFFF" }}>
              Como instalar no iPhone (iOS):
            </h3>
            <ol style={{ margin: "0 0 16px 0", paddingLeft: "20px", fontSize: "13px", lineHeight: "1.6", color: "#CBD5E1" }}>
              <li>
                Toque no botão de <strong>Compartilhar</strong> (ícone do quadrado com a seta para cima ⎋ na barra inferior do Safari).
              </li>
              <li>
                Role as opções e toque em <strong>"Adicionar à Tela de Início"</strong> (ícone ➕).
              </li>
              <li>
                Toque em <strong>"Adicionar"</strong> no canto superior direito.
              </li>
            </ol>
            <button
              onClick={() => {
                setShowIosInstructions(false);
                setIsVisible(false);
              }}
              style={{
                width: "100%",
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "10px",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer"
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
