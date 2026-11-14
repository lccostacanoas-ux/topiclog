"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function GlobalErrorBoundary({
  error,
  reset
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("TopicLog Client Exception Capturada:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        backgroundColor: "#F8FAFC"
      }}
    >
      <div
        style={{
          maxWidth: "440px",
          width: "100%",
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          padding: "32px 24px",
          textAlign: "center",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
          border: "1px solid #E2E8F0"
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔄</div>
        <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
          Recuperação do Aplicativo
        </h2>
        <p style={{ fontSize: "13px", color: "#64748B", margin: "0 0 20px 0", lineHeight: 1.5 }}>
          Identificamos uma atualização em andamento ou instabilidade temporária na navegação. Clique abaixo para restabelecer a tela normalmente.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                reset();
              }
            }}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#2563EB",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            🔄 Recarregar e Atualizar
          </button>
          <Link
            href="/"
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              backgroundColor: "#F1F5F9",
              color: "#475569",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none"
            }}
          >
            Ir para a Página Inicial
          </Link>
        </div>
      </div>
    </div>
  );
}
