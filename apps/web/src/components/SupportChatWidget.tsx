"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../lib/auth-context";

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_type: "user" | "ai_agent" | "human_agent";
  content: string;
  created_at: string;
}

interface SupportTicket {
  id: string;
  user_id: string;
  crm_conversation_id: string | null;
  status: "open" | "human_handoff" | "closed";
  created_at: string;
  updated_at: string;
}

export function SupportChatWidget(): React.JSX.Element | null {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadTicketAndMessages = useCallback(async () => {
    if (!user?.userId) return;
    try {
      const res = await fetch(`/api/support/ticket?userId=${encodeURIComponent(user.userId)}`);
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.warn("[SupportChatWidget] Falha ao carregar mensagens:", err);
    }
  }, [user?.userId]);

  const handleClearChat = async () => {
    if (!user?.userId || isClearing || isSending || messages.length === 0) return;
    const confirmed = window.confirm(
      "Deseja limpar esta conversa e iniciar um novo atendimento com o suporte?",
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const res = await fetch(`/api/support/ticket?userId=${encodeURIComponent(user.userId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTicket(null);
        setMessages([]);
      } else {
        // Fallback via POST
        const resPost = await fetch("/api/support/ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.userId, action: "clear" }),
        });
        if (resPost.ok) {
          setTicket(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("[SupportChatWidget] Erro ao limpar conversa:", err);
    } finally {
      setIsClearing(false);
    }
  };

  // Carregar histórico ao abrir
  useEffect(() => {
    if (isOpen && user?.userId) {
      setIsLoadingHistory(true);
      loadTicketAndMessages().finally(() => {
        setIsLoadingHistory(false);
        scrollToBottom();
      });
    }
  }, [isOpen, user?.userId, loadTicketAndMessages]);

  // Polling leve enquanto o chat estiver aberto
  useEffect(() => {
    if (!isOpen || !user?.userId) return;
    const interval = setInterval(() => {
      void loadTicketAndMessages();
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen, user?.userId, loadTicketAndMessages]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Envio de nova mensagem
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending || !user?.userId) return;

    // Determinar o perfil ativo (ou papéis cadastrados)
    const isCarrier = Boolean(user.roles?.includes("CARRIER"));
    const isSender = Boolean(user.roles?.includes("SENDER"));
    let perfilUsuario = "Ambos / Indefinido";
    if (isCarrier && !isSender) perfilUsuario = "Transportador (Motorista)";
    else if (isSender && !isCarrier) perfilUsuario = "Embarcador (Remetente)";
    else if (isCarrier && isSender) perfilUsuario = "Transportador (Motorista)";

    const contextPayload = {
      perfil_usuario: perfilUsuario,
      documento_cpf_cnpj: user.cpfMasked || null,
      status_kyc: user.kycStatus === "VERIFIED" ? "Aprovado" : user.kycStatus === "REJECTED" ? "Reprovado" : "Pendente",
      tipo_veiculo: user.vehicleType || null,
      placa_veiculo: user.vehiclePlate || null,
      id_frete: null,
    };

    // Mensagem otimista na tela
    const tempMsg: SupportMessage = {
      id: `temp-${Date.now()}`,
      ticket_id: ticket?.id || "temp",
      sender_type: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    setInputText("");
    setIsSending(true);

    try {
      const res = await fetch("/api/support/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.userId,
          user_name: user.displayName || user.email || "Usuário Topiclog",
          user_email: user.email,
          user_phone: user.phoneMasked,
          message: trimmed,
          context: contextPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reply_message) {
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempMsg.id),
            data.user_message,
            data.reply_message,
          ]);
        } else {
          // Atualiza lista via fetch para garantir sincronia
          await loadTicketAndMessages();
        }
      } else {
        console.warn("[SupportChatWidget] Erro ao enviar mensagem:", res.status);
      }
    } catch (err) {
      console.error("[SupportChatWidget] Erro de rede:", err);
    } finally {
      setIsSending(false);
      scrollToBottom();
    }
  };

  // Se o usuário não estiver logado, não renderiza o botão flutuante
  if (!isAuthenticated || !user) {
    return null;
  }

  const isHumanHandoff = ticket?.status === "human_handoff";

  return (
    <>
      {/* Botão Flutuante Discreto no Canto Inferior Direito */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "84px",
            right: "20px",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#1E3A8A",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "50px",
            padding: "12px 20px",
            boxShadow: "0 4px 14px rgba(30, 58, 138, 0.35)",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "14px",
            transition: "all 0.2s ease-in-out",
          }}
          title="Falar com o Suporte Topiclog"
        >
          <span style={{ fontSize: "18px" }}>💬</span>
          <span>Suporte Topiclog</span>
        </button>
      )}

      {/* Drawer / Janela de Suporte */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            width: "380px",
            maxWidth: "calc(100vw - 40px)",
            height: "560px",
            maxHeight: "calc(100vh - 100px)",
            backgroundColor: "#FFFFFF",
            borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            border: "1px solid #E2E8F0",
          }}
        >
          {/* Cabeçalho */}
          <div
            style={{
              backgroundColor: "#1E3A8A",
              color: "#FFFFFF",
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🚚</span>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Suporte Operacional</h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: isHumanHandoff ? "#F59E0B" : "#10B981",
                  }}
                />
                <span style={{ fontSize: "12px", opacity: 0.9 }}>
                  {isHumanHandoff ? "Atendimento Humano em Fila" : "Assistente Virtual Topiclog"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  disabled={isClearing || isSending}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.16)",
                    border: "1px solid rgba(255, 255, 255, 0.25)",
                    borderRadius: "8px",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: isClearing || isSending ? "not-allowed" : "pointer",
                    padding: "4px 9px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.2s ease-in-out",
                  }}
                  title="Limpar conversa e iniciar novo atendimento"
                >
                  <span style={{ fontSize: "13px" }}>🗑️</span>
                  <span>{isClearing ? "Limpando..." : "Limpar"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  color: "#FFFFFF",
                  fontSize: "20px",
                  cursor: "pointer",
                  padding: "4px",
                  lineHeight: 1,
                }}
                title="Fechar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Contexto do Usuário (Badge) */}
          <div
            style={{
              backgroundColor: "#F8FAFC",
              padding: "8px 16px",
              borderBottom: "1px solid #E2E8F0",
              fontSize: "11px",
              color: "#64748B",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              <strong>{user.displayName || user.email}</strong> •{" "}
              {user.roles?.includes("CARRIER") ? "Transportador" : "Embarcador"}
            </span>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor: user.kycStatus === "VERIFIED" ? "#DCFCE7" : "#FEF3C7",
                color: user.kycStatus === "VERIFIED" ? "#166534" : "#92400E",
                fontWeight: 700,
              }}
            >
              KYC: {user.kycStatus === "VERIFIED" ? "Aprovado" : "Pendente"}
            </span>
          </div>

          {/* Feed de Mensagens */}
          <div
            style={{
              flex: 1,
              padding: "16px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              backgroundColor: "#F1F5F9",
            }}
          >
            {isLoadingHistory ? (
              <div style={{ textAlign: "center", color: "#94A3B8", marginTop: "40px", fontSize: "13px" }}>
                Carregando atendimento...
              </div>
            ) : messages.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#64748B",
                  marginTop: "60px",
                  padding: "0 20px",
                  fontSize: "13px",
                  lineHeight: "1.5",
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>👋</div>
                <strong>Olá! Como podemos ajudar você hoje?</strong>
                <p style={{ marginTop: "6px", fontSize: "12px", color: "#94A3B8" }}>
                  Tire dúvidas sobre aprovação de cadastro, repasses Pix, cotações ou reporte problemas operacionais.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender_type === "user";
                const isHuman = msg.sender_type === "human_agent";
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: isUser ? "flex-end" : "flex-start",
                      maxWidth: "100%",
                    }}
                  >
                    {!isUser && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: isHuman ? "#059669" : "#1E3A8A",
                          marginBottom: "3px",
                          marginLeft: "4px",
                        }}
                      >
                        {isHuman ? "👨‍💼 Atendente Topiclog" : "🤖 Assistente Topiclog"}
                      </span>
                    )}
                    <div
                      style={{
                        maxWidth: "85%",
                        padding: "10px 14px",
                        borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        backgroundColor: isUser ? "#2563EB" : isHuman ? "#ECFDF5" : "#FFFFFF",
                        color: isUser ? "#FFFFFF" : "#1E293B",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                        border: isUser ? "none" : isHuman ? "1px solid #A7F3D0" : "1px solid #E2E8F0",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}

            {isSending && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "4px" }}>
                <span style={{ fontSize: "12px", color: "#64748B" }}>🤖 Topiclog está digitando...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Campo de Entrada de Mensagem */}
          <form
            onSubmit={handleSendMessage}
            style={{
              padding: "12px",
              backgroundColor: "#FFFFFF",
              borderTop: "1px solid #E2E8F0",
              display: "flex",
              gap: "8px",
            }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Digite sua dúvida ou mensagem..."
              disabled={isSending}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "24px",
                border: "1px solid #CBD5E1",
                fontSize: "13px",
                outline: "none",
                backgroundColor: "#F8FAFC",
              }}
            />
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              style={{
                backgroundColor: isSending || !inputText.trim() ? "#94A3B8" : "#2563EB",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "50%",
                width: "38px",
                height: "38px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isSending || !inputText.trim() ? "not-allowed" : "pointer",
                fontSize: "16px",
                transition: "background-color 0.2s",
              }}
              title="Enviar"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
