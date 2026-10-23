"use client";

import React, { useEffect, useState } from "react";

export function OfflineBanner(): React.JSX.Element | null {
  const [isOffline, setIsOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3500);
      return () => clearTimeout(timer);
    }

    function handleOffline() {
      setIsOffline(true);
      setShowReconnected(false);
    }

    // Estado inicial
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOffline) {
    return (
      <div
        role="alert"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
          backgroundColor: "#DC2626",
          color: "#FFFFFF",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          fontSize: "13px",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          textAlign: "center"
        }}
      >
        <span>📡</span>
        <span>
          <strong>Modo Offline Ativo:</strong> Você está sem conexão com a internet. A confirmação de entregas (D16) e a contratação exigem validação online no servidor.
        </span>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div
        role="status"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
          backgroundColor: "#059669",
          color: "#FFFFFF",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          fontSize: "13px",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          textAlign: "center",
          transition: "opacity 0.3s ease"
        }}
      >
        <span>✓</span>
        <span>Conexão restabelecida! A Topic Log está sincronizada com o servidor.</span>
      </div>
    );
  }

  return null;
}
