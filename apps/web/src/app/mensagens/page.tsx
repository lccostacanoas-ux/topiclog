"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import {
  listMyContractsApi,
  listContractMessagesApi,
  sendContractMessageApi
} from "../../lib/api-client";
import type { ContractDto, ContractMessageDto } from "../../lib/types";

function ContractChatCard({
  contract,
  token,
  currentUserId
}: {
  contract: ContractDto;
  token: string;
  currentUserId: string;
}): React.JSX.Element {
  const [messages, setMessages] = useState<ContractMessageDto[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const loadMsgs = React.useCallback(async () => {
    const res = await listContractMessagesApi(contract.id, token);
    if (res.ok && res.data) {
      setMessages(res.data);
    }
  }, [contract.id, token]);

  useEffect(() => {
    void loadMsgs();
    const timer = window.setInterval(() => void loadMsgs(), 5000);
    return () => window.clearInterval(timer);
  }, [loadMsgs]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const res = await sendContractMessageApi(contract.id, trimmed, token);
    if (res.ok && res.data) {
      setMessages((prev) => [...prev, res.data!]);
      setText("");
    }
    setSending(false);
  };

  return (
    <div
      style={{
        padding: "16px",
        borderRadius: "10px",
        border: "1px solid #BFDBFE",
        backgroundColor: "#F8FAFC"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <div>
          <strong style={{ fontSize: "14px", color: "#0F172A", display: "block" }}>
            Encomenda #{contract.shipmentId.slice(0, 8)} • R$ {(contract.amountCents / 100).toFixed(2).replace(".", ",")}
          </strong>
          <span style={{ fontSize: "12px", color: "#475569" }}>
            Chat Privado ({contract.senderName} ↔ {contract.carrierName})
          </span>
        </div>
        <Link
          href="/minhas-atividades"
          className="btn btn--outline"
          style={{ padding: "5px 12px", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}
        >
          🗺️ Ver Entrega & Códigos
        </Link>
      </div>

      <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px", padding: "8px", backgroundColor: "#FFFFFF", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
        {messages.length === 0 ? (
          <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8", textAlign: "center" }}>
            Nenhuma mensagem trocada ainda. Combine detalhes de retirada ou entrega aqui.
          </p>
        ) : (
          messages.map((m) => {
            const isMine = m.senderUserId === currentUserId;
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isMine ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  backgroundColor: isMine ? "#2563EB" : "#F1F5F9",
                  color: isMine ? "#FFFFFF" : "#1E293B",
                  borderRadius: "8px",
                  padding: "7px 11px",
                  fontSize: "13px"
                }}
              >
                <div style={{ fontSize: "10px", fontWeight: 700, opacity: 0.85, marginBottom: "2px" }}>
                  {isMine ? "Você" : m.senderName} • {new Date(m.sentAtUtc).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div>{m.body}</div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={(e) => void handleSend(e)} style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enviar mensagem privada..."
          style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "13px" }}
        />
        <button type="submit" disabled={sending || !text.trim()} className="btn btn--primary" style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700 }}>
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}

export default function MensagensPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  // Estado do formulário de contato com a administração via e-mail
  const [subject, setSubject] = useState("Dúvida sobre Negociação e Pagamento");
  const [messageBody, setMessageBody] = useState("");
  const [protocol, setProtocol] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);

  // Somente contratos ativos com pagamento confirmado (viagens encerradas removem o chat da tela)
  const [paidContracts, setPaidContracts] = useState<ContractDto[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  useEffect(() => {
    if (!token || !user?.userId) {
      setPaidContracts([]);
      return;
    }

    let cancelled = false;
    setLoadingContracts(true);

    const loadPaidContracts = async () => {
      try {
        const res = await listMyContractsApi(token);
        if (!cancelled && res.ok && Array.isArray(res.data)) {
          setPaidContracts(
            res.data.filter(
              (c) =>
                c.status === "ACTIVE" &&
                (c.senderId === user.userId || c.carrierId === user.userId)
            )
          );
        }
      } catch {
        if (!cancelled) setPaidContracts([]);
      } finally {
        if (!cancelled) setLoadingContracts(false);
      }
    };

    void loadPaidContracts();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  if (!authLoading && !isAuthenticated) {
    return (
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", maxWidth: "560px" }}>
        <div className="card" style={{ textAlign: "center", padding: "40px 24px", borderRadius: "16px", boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>🔒</div>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-primary, #2563EB)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Acesso Restrito a Usuários Cadastrados
          </span>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-brand-deep-navy, #0F172A)", margin: "8px 0 12px 0" }}>
            Identificação Obrigatória
          </h1>
          <p style={{ color: "var(--color-muted, #64748B)", fontSize: "14px", lineHeight: "1.5", marginBottom: "28px" }}>
            O envio de mensagens para a administração da Topic Log e a comunicação sobre negociações são exclusivos para usuários cadastrados e identificados na plataforma.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link
              href="/entrar"
              className="btn btn--primary"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none", textAlign: "center" }}
            >
              Entrar na Minha Conta
            </Link>
            <Link
              href="/cadastro"
              className="btn btn--outline"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none", textAlign: "center" }}
            >
              Cadastrar Gratuitamente
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const handleSendAdminEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim()) return;

    const newProtocol = `TL-ADM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setProtocol(newProtocol);
    setSentSuccess(true);

    const emailSubject = encodeURIComponent(`[TopicLog Protocolo ${newProtocol}] ${subject} - ${user?.displayName || "Usuário"}`);
    const emailBody = encodeURIComponent(
      `Prezada Administração da Topic Log,\n\n` +
      `Identificação do Solicitante:\n` +
      `- Nome: ${user?.displayName || "Não informado"}\n` +
      `- E-mail: ${user?.email || "Não informado"}\n` +
      `- Telefone de Contato: ${user?.phoneMasked || "Não informado"}\n` +
      `- Protocolo: ${newProtocol}\n\n` +
      `Mensagem:\n${messageBody.trim()}\n\n` +
      `Enviado via Central Oficial de Atendimento Topic Log.`
    );

    window.location.href = `mailto:suporte@topiclog.com.br?subject=${emailSubject}&body=${emailBody}`;
  };

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "56px", maxWidth: "900px" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "var(--color-brand-deep-navy, #0F172A)" }}>
            Central de Mensagens e Atendimento
          </h1>
          <span style={{ fontSize: "11px", fontWeight: 700, backgroundColor: "#DCFCE7", color: "#166534", padding: "3px 10px", borderRadius: "12px" }}>
            ✓ Versão de Produção Oficial
          </span>
        </div>
        <p style={{ color: "var(--color-muted, #64748B)", margin: 0, fontSize: "15px" }}>
          Canal exclusivo para comunicação com a administração da plataforma via e-mail e acompanhamento de negociações fechadas.
        </p>
      </div>

      {/* Regra de Troca de Mensagens entre Usuários */}
      <div
        className="card"
        style={{
          backgroundColor: "#EFF6FF",
          border: "1px solid #BFDBFE",
          padding: "16px 20px",
          marginBottom: "24px",
          display: "flex",
          gap: "14px",
          alignItems: "flex-start",
          borderRadius: "12px"
        }}
      >
        <span style={{ fontSize: "24px", lineHeight: 1 }} aria-hidden="true">🔒</span>
        <div style={{ fontSize: "13px", color: "#1E40AF", lineHeight: 1.5, flex: 1 }}>
          <strong style={{ display: "block", fontSize: "14px", marginBottom: "4px" }}>
            Regra Oficial: Troca de Mensagens entre Usuários
          </strong>
          A troca de mensagens direta entre remetentes e transportadores só é permitida quando a negociação for formalmente fechada e o pagamento por parte do remetente for confirmado. Esta comunicação fica disponível na aba de negociação de ambos.
          <div style={{ marginTop: "10px" }}>
            <Link
              href="/propostas"
              className="btn btn--primary"
              style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 700, textDecoration: "none", display: "inline-block" }}
            >
              Ver Minhas Negociações em Aberto e Fechadas →
            </Link>
          </div>
        </div>
      </div>

      {/* Painel de Comunicação com a Administração */}
      <div className="card" style={{ padding: "28px", borderRadius: "14px", border: "1px solid #E2E8F0", marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <span style={{ fontSize: "22px" }}>✉️</span>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0, color: "#0F172A" }}>
              Falar com a Administração da Plataforma (Oficial via E-mail)
            </h2>
            <span style={{ fontSize: "12px", color: "#64748B" }}>
              Mensagens entre usuários e a Topic Log são tratadas formalmente por e-mail com protocolo de registro.
            </span>
          </div>
        </div>

        {sentSuccess && protocol && (
          <div
            style={{
              padding: "14px 18px",
              backgroundColor: "#ECFDF5",
              color: "#065F46",
              border: "1px solid #A7F3D0",
              borderRadius: "10px",
              marginBottom: "20px",
              fontSize: "14px"
            }}
          >
            <strong>✓ Solicitação Registrada com Sucesso! Protocolo: {protocol}</strong>
            <p style={{ margin: "6px 0 0 0", fontSize: "13px" }}>
              Sua mensagem foi preparada para o suporte oficial (<strong>suporte@topiclog.com.br</strong>). Se o seu cliente de e-mail não abriu automaticamente, você pode nos contatar diretamente citando o protocolo acima.
            </p>
          </div>
        )}

        <form onSubmit={handleSendAdminEmail}>
          <div style={{ marginBottom: "20px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: "10px" }}>
              Identificação do Cliente (Preenchimento Automático pelo Login)
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748B", marginBottom: "4px" }}>
                  Nome Cadastrado:
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={user?.displayName || "Usuário Identificado"}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "#F1F5F9",
                    color: "#334155",
                    fontSize: "13px",
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748B", marginBottom: "4px" }}>
                  E-mail de Contato:
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={user?.email || ""}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "#F1F5F9",
                    color: "#334155",
                    fontSize: "13px",
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748B", marginBottom: "4px" }}>
                  Telefone de Contato:
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={user?.phoneMasked || "(Não informado)"}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "#F1F5F9",
                    color: "#334155",
                    fontSize: "13px",
                    fontWeight: 600
                  }}
                />
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "#94A3B8", marginTop: "6px", display: "block" }}>
              🔒 Seus dados cadastrais são protegidos conforme a LGPD. A senha do usuário não é exposta nem solicitada.
            </span>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="admin-subject" style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#1E293B", marginBottom: "6px" }}>
              Assunto da Mensagem:
            </label>
            <select
              id="admin-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
                backgroundColor: "#FFFFFF",
                color: "#1E293B",
                outline: "none"
              }}
            >
              <option value="Dúvida sobre Negociação e Pagamento">Dúvida sobre Negociação e Pagamento</option>
              <option value="Comunicação de Cancelamento / Força Maior">Comunicação de Cancelamento / Força Maior</option>
              <option value="Cadastro de Veículo, Placa, Renavam ou CNH">Cadastro de Veículo, Placa, Renavam ou CNH</option>
              <option value="Suporte Operacional de Coleta e Entrega">Suporte Operacional de Coleta e Entrega</option>
              <option value="Divisão e Repasse Asaas Split">Divisão e Repasse Asaas Split</option>
              <option value="Outros Assuntos">Outros Assuntos</option>
            </select>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label htmlFor="admin-message" style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#1E293B", marginBottom: "6px" }}>
              Mensagem para a Administração:
            </label>
            <textarea
              id="admin-message"
              rows={5}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Descreva detalhadamente sua dúvida, solicitação ou relato para a administração da Topic Log..."
              required
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical"
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              className="btn btn--primary"
              style={{
                padding: "10px 22px",
                fontSize: "14px",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span>✉️</span> Enviar para a Administração via E-mail
            </button>
          </div>
        </form>
      </div>

      {/* Seção das Negociações Fechadas e Pagas */}
      <div className="card" style={{ padding: "24px", borderRadius: "14px", border: "1px solid #E2E8F0" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 12px 0", color: "#0F172A" }}>
          Chats Privados com Pagamento Confirmado
        </h3>
        {loadingContracts ? (
          <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
            Carregando chats dos contratos ativos...
          </p>
        ) : paidContracts.length > 0 && token && user?.userId ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {paidContracts.map((contract) => (
              <ContractChatCard
                key={contract.id}
                contract={contract}
                token={token}
                currentUserId={user.userId}
              />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
            Nenhuma negociação fechada com pagamento confirmado no momento. Quando o remetente efetuar o pagamento via Pix, o canal de chat direto exclusivo entre vocês será aberto aqui e na aba Propostas.
          </p>
        )}
      </div>
    </main>
  );
}
