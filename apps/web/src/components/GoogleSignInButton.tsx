"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth-context";

interface GoogleSignInButtonProps {
  readonly text?: "signin_with" | "signup_with" | "continue_with";
  readonly onSuccess?: () => void;
  readonly onError?: (errorMessage: string) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (momentListener?: (notification: unknown) => void) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
              locale?: string;
            }
          ) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({
  text = "continue_with",
  onSuccess,
  onError
}: GoogleSignInButtonProps): React.JSX.Element {
  const router = useRouter();
  const { loginWithGoogle } = useAuth();
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSandboxModal, setShowSandboxModal] = useState(false);
  const [sandboxEmail, setSandboxEmail] = useState("");
  const [sandboxName, setSandboxName] = useState("");

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Decodifica JWT payload sem dependências externas
  const decodeJwtPayload = (token: string): { email?: string; name?: string; picture?: string; sub?: string } => {
    try {
      const base64Url = token.split(".")[1];
      if (!base64Url) return {};
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  };

  const handleCredentialResponse = async (response: { credential: string }) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const payload = decodeJwtPayload(response.credential);
      const email = payload.email;

      if (!email) {
        throw new Error("Não foi possível obter o e-mail da sua Conta Google.");
      }

      const res = await loginWithGoogle({
        idToken: response.credential,
        email,
        name: payload.name,
        picture: payload.picture,
        googleId: payload.sub
      });

      if (res.ok) {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/minha-conta");
        }
      } else {
        const msg = res.problem?.detail || "Erro ao autenticar com o Google. Tente novamente.";
        setErrorMessage(msg);
        if (onError) onError(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido ao entrar com o Google.";
      setErrorMessage(msg);
      if (onError) onError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Carrega Google Identity Services SDK oficial se houver Client ID configurado
  useEffect(() => {
    if (!clientId) return;

    const loadGisScript = () => {
      if (window.google?.accounts?.id) {
        initGis();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => initGis();
      document.body.appendChild(script);
    };

    const initGis = () => {
      if (!window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse
      });

      if (buttonContainerRef.current) {
        window.google.accounts.id.renderButton(buttonContainerRef.current, {
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          logo_alignment: "left",
          width: "100%",
          locale: "pt-BR"
        });
      }
    };

    loadGisScript();
  }, [clientId, text]);

  const handleButtonClick = () => {
    if (clientId && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      // Quando Client ID não está configurado, abre modal intuitivo para desenvolvimento/testes
      setShowSandboxModal(true);
    }
  };

  const handleSandboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxEmail.trim()) {
      setErrorMessage("Informe o e-mail da Conta Google.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await loginWithGoogle({
        email: sandboxEmail.trim(),
        name: sandboxName.trim() || undefined
      });

      if (res.ok) {
        setShowSandboxModal(false);
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/minha-conta");
        }
      } else {
        const msg = res.problem?.detail || "Erro ao autenticar com o Google.";
        setErrorMessage(msg);
        if (onError) onError(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado ao autenticar com o Google.";
      setErrorMessage(msg);
      if (onError) onError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const labelText =
    text === "signup_with"
      ? "Cadastrar com o Google"
      : text === "signin_with"
        ? "Entrar com o Google"
        : "Continuar com o Google";

  return (
    <div style={{ width: "100%", marginBottom: "16px" }}>
      {errorMessage && (
        <div
          role="alert"
          style={{
            marginBottom: "12px",
            padding: "10px 14px",
            borderRadius: "6px",
            backgroundColor: "#FEE2E2",
            color: "#991B1B",
            fontSize: "13px",
            lineHeight: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#991B1B",
              fontSize: "16px",
              cursor: "pointer",
              fontWeight: 700,
              padding: "0 4px"
            }}
            title="Fechar"
          >
            ×
          </button>
        </div>
      )}

      {/* Se o GIS estiver carregado e renderizou o botão nativo do Google */}
      {clientId ? (
        <div ref={buttonContainerRef} style={{ width: "100%", minHeight: "44px" }} />
      ) : (
        /* Botão estilizado oficial com logotipo do Google */
        <button
          type="button"
          onClick={handleButtonClick}
          disabled={isLoading}
          style={{
            width: "100%",
            height: "44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            backgroundColor: "#FFFFFF",
            color: "#1F2937",
            border: "1px solid #D1D5DB",
            borderRadius: "6px",
            fontSize: "15px",
            fontWeight: 500,
            cursor: isLoading ? "not-allowed" : "pointer",
            transition: "background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = "#F9FAFB";
              e.currentTarget.style.borderColor = "#9CA3AF";
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
              e.currentTarget.style.borderColor = "#D1D5DB";
            }
          }}
        >
          {isLoading ? (
            <span style={{ fontSize: "14px", color: "#6B7280" }}>Conectando ao Google...</span>
          ) : (
            <>
              {/* Google G Logo SVG oficial */}
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{labelText}</span>
            </>
          )}
        </button>
      )}

      {/* Modal Sandbox para testes rápidos quando NEXT_PUBLIC_GOOGLE_CLIENT_ID não está configurado */}
      {showSandboxModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px"
          }}
          onClick={() => setShowSandboxModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                Acesso com Conta Google
              </h3>
            </div>

            <p style={{ fontSize: "14px", color: "#475569", lineHeight: "20px", marginBottom: "16px" }}>
              Ambiente de testes ativo. Informe seus dados Google para testar o login ou cadastro instantâneo:
            </p>

            <form onSubmit={handleSandboxSubmit}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  E-mail do Google *
                </label>
                <input
                  type="email"
                  required
                  placeholder="ex: usuario@gmail.com"
                  value={sandboxEmail}
                  onChange={(e) => setSandboxEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #CBD5E1",
                    fontSize: "14px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Nome de Exibição
                </label>
                <input
                  type="text"
                  placeholder="ex: Carlos Silva"
                  value={sandboxName}
                  onChange={(e) => setSandboxName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #CBD5E1",
                    fontSize: "14px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowSandboxModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "#F8FAFC",
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: "#2563EB",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: isLoading ? "not-allowed" : "pointer"
                  }}
                >
                  {isLoading ? "Entrando..." : "Confirmar e Entrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
