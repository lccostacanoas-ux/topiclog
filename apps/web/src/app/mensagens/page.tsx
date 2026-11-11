"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import { listProposalsForSenderApi, listProposalsByCarrierApi } from "../../lib/api-client";
import type { ProposalDto } from "../../lib/types";

export default function MensagensPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  // Estado do formulário de contato com a administração via e-mail
  const [subject, setSubject] = useState("Dúvida sobre Negociação e Pagamento");
  const [messageBody, setMessageBody] = useState("");
  const [protocol, setProtocol] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);

  // Somente negociações reais fechadas (ACCEPTED) vindas da API oficial
  const [closedPaidProposals, setClosedPaidProposals] = useState<ProposalDto[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);

  useEffect(() => {
    if (!token || !user?.userId) {
      setClosedPaidProposals([]);
      return;
    }

    let cancelled = false;
    setLoadingProposals(true);

    const loadAccepted = async () => {
      try {
        const requests: Promise<Awaited<ReturnType<typeof listProposalsForSenderApi>>>[] = [
          listProposalsForSenderApi(user.userId, token)
        ];
        if (user.roles?.includes("CARRIER")) {
          requests.push(listProposalsByCarrierApi(user.userId, token));
        }

        const results = await Promise.all(requests);
        const byId = new Map<string, ProposalDto>();
        for (const res of results) {
          if (res.ok && !res.isFallback && Array.isArray(res.data)) {
            for (const p of res.data) {
              if (p.status === "ACCEPTED") {
                byId.set(p.id, p);
              }
            }
          }
        }
        if (!cancelled) {
          setClosedPaidProposals(Array.from(byId.values()));
        }
      } catch {
        if (!cancelled) {
          setClosedPaidProposals([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingProposals(false);
        }
      }
    };

    void loadAccepted();
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
              <option value="Divisão e Repasse Mercado Pago">Divisão e Repasse Mercado Pago</option>
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
          Suas Negociações com Pagamento Confirmado
        </h3>
        {loadingProposals ? (
          <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
            Verificando negociações fechadas...
          </p>
        ) : closedPaidProposals.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {closedPaidProposals.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  backgroundColor: "#F8FAFC",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px"
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px", color: "#1E293B", display: "block" }}>
                    Encomenda #{p.shipmentId.slice(0, 8)} • R$ {(p.amountCents / 100).toFixed(2).replace(".", ",")}
                  </strong>
                  <span style={{ fontSize: "12px", color: "#64748B" }}>
                    Participantes: {p.senderName} e {p.carrierName}
                  </span>
                </div>
                <Link
                  href="/propostas"
                  className="btn btn--outline"
                  style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}
                >
                  Abrir Chat na Aba de Negociação →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
            Nenhuma negociação fechada com pagamento confirmado no momento. Quando o remetente efetuar o pagamento via Mercado Pago, o canal de chat direto será automaticamente aberto na aba de propostas.
          </p>
        )}
      </div>
    </main>
  );
}
