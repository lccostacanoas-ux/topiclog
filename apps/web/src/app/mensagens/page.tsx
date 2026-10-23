"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  type DemoChatThread,
  getDemoChatThreads,
  sendDemoMessage
} from "../../lib/demo-marketplace-store";
import { useAuth } from "../../lib/auth-context";

const QUICK_REPLIES = [
  "Olá! Onde podemos combinar o ponto de coleta?",
  "O pacote já está embalado e lacrado.",
  "Posso coletar por volta das 08:30 da manhã.",
  "Estou a caminho do ponto combinado."
];

export default function MensagensPage(): React.JSX.Element {
  const { user } = useAuth();
  const [threads, setThreads] = useState<readonly DemoChatThread[]>(() => getDemoChatThreads());
  const [activeThreadId, setActiveThreadId] = useState<string>(threads[0]?.id || "");
  const [inputText, setInputText] = useState("");

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeThread) return;

    const sender = user?.displayName || "Você";
    const updated = sendDemoMessage(activeThread.id, inputText.trim(), sender);
    setThreads(updated);
    setInputText("");
  };

  const handleSendQuickReply = (text: string) => {
    if (!activeThread) return;
    const sender = user?.displayName || "Você";
    const updated = sendDemoMessage(activeThread.id, text, sender);
    setThreads(updated);
  };

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "56px" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "var(--color-brand-deep-navy)" }}>
            Mensagens e Chat Seguro
          </h1>
          <span className="status-pill status-pill--warning" style={{ fontSize: "11px", fontWeight: 700 }}>
            Comunicação Interativa
          </span>
        </div>
        <p style={{ color: "var(--color-muted)", margin: 0, fontSize: "15px", maxWidth: "680px" }}>
          Alinhe pontos de encontro, horários de coleta e particularidades das cargas diretamente com os viajantes da Topic Log.
        </p>
      </div>

      {/* Alerta de Privacidade e Proteção LGPD */}
      <div
        className="card"
        style={{
          backgroundColor: "#FEF2F2",
          border: "1px solid #FECACA",
          padding: "14px 18px",
          marginBottom: "24px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          boxShadow: "var(--shadow-sm)"
        }}
      >
        <span style={{ fontSize: "24px", lineHeight: 1 }} aria-hidden="true">🔒</span>
        <div style={{ fontSize: "13px", color: "#991B1B", lineHeight: 1.45 }}>
          <strong>Aviso de Segurança e Proteção LGPD:</strong> Para segurança jurídica mútua,
          nunca compartilhe dados bancários, números de cartão de crédito ou realize pagamentos por fora da plataforma.
          Toda contratação deve ocorrer no marketplace Topic Log, garantindo a liberação do pagamento via código de 4 dígitos no ato da entrega (D16).
        </div>
      </div>

      {/* Container Principal do Chat */}
      <div className="chat-container">
        {/* Barra Lateral: Lista de Conversas */}
        <aside className="chat-sidebar" aria-label="Lista de conversas ativas">
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid var(--color-border)",
              fontWeight: 800,
              fontSize: "14px",
              color: "var(--color-brand-deep-navy)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>Conversas Ativas</span>
            <span style={{ fontSize: "11px", backgroundColor: "#EFF6FF", color: "#1D4ED8", padding: "2px 8px", borderRadius: "var(--radius-full)", fontWeight: 700 }}>
              {threads.length}
            </span>
          </div>

          <div style={{ overflowY: "auto", flexGrow: 1 }}>
            {threads.map((t) => {
              const isActive = t.id === activeThreadId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveThreadId(t.id)}
                  className={`chat-thread-item ${isActive ? "chat-thread-item--active" : ""}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "14px", color: "var(--color-brand-deep-navy)" }}>
                      {t.counterpartName}
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                      {t.lastMessageTime}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", color: "var(--color-primary)", fontWeight: 700, marginBottom: "3px" }}>
                    {t.contextTitle}
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--color-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {t.lastMessage}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Painel Central: Thread de Mensagens */}
        {activeThread ? (
          <section className="chat-main" aria-label={`Conversa com ${activeThread.counterpartName}`}>
            {/* Header da Conversa Ativa */}
            <header
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "var(--color-surface)",
                flexWrap: "wrap",
                gap: "10px"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h2 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--color-brand-deep-navy)" }}>
                    {activeThread.counterpartName}
                  </h2>
                  <span
                    style={{
                      fontSize: "11px",
                      backgroundColor: "#F1F5F9",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      fontWeight: 700,
                      color: "#334155"
                    }}
                  >
                    {activeThread.counterpartRole}
                  </span>
                  {activeThread.counterpartKycVerified && (
                    <span style={{ fontSize: "12px", color: "var(--color-success)", fontWeight: 700 }} title="KYC Aprovado">
                      ✓ KYC Verificado
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-muted)", marginTop: "3px" }}>
                  📦 Contexto da Rota: <strong>{activeThread.contextTitle}</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <Link href="/propostas" className="btn btn--outline" style={{ fontSize: "12px", padding: "6px 12px" }}>
                  Ver Proposta
                </Link>
                <Link href="/minhas-atividades" className="btn btn--outline" style={{ fontSize: "12px", padding: "6px 12px" }}>
                  Acompanhamento
                </Link>
              </div>
            </header>

            {/* Lista de Mensagens da Thread */}
            <div className="chat-messages-area">
              {activeThread.messages.map((m) => {
                const isMine = m.isCurrentUser;
                return (
                  <div
                    key={m.id}
                    className={`chat-bubble ${isMine ? "chat-bubble--mine" : "chat-bubble--theirs"}`}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "2px", opacity: 0.8 }}>
                      {m.senderName}
                    </div>
                    <div>{m.text}</div>
                    <div style={{ fontSize: "10px", marginTop: "4px", textAlign: "right", opacity: 0.7 }}>
                      {m.timestamp}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Respostas Rápidas Sugeridas */}
            <div
              style={{
                padding: "8px 16px",
                backgroundColor: "#F8FAFC",
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                gap: "8px",
                overflowX: "auto"
              }}
            >
              {QUICK_REPLIES.map((reply, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendQuickReply(reply)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "#FFFFFF",
                    fontSize: "12px",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  💬 {reply}
                </button>
              ))}
            </div>

            {/* Formulário de Envio de Mensagem */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: "16px 20px",
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                gap: "12px",
                backgroundColor: "var(--color-surface)"
              }}
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Digite sua mensagem sobre a rota, horário ou embalagem..."
                className="form-control"
                style={{ flexGrow: 1 }}
              />
              <button
                type="submit"
                className="btn btn--primary"
                style={{ padding: "8px 20px", fontWeight: 700 }}
              >
                Enviar Mensagem
              </button>
            </form>
          </section>
        ) : (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--color-muted)" }}>
            Selecione uma conversa na lateral para visualizar as mensagens.
          </div>
        )}
      </div>
    </main>
  );
}
