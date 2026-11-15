"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  createAsaasPix,
  checkAsaasPixStatus,
  type AsaasPixData
} from "../lib/asaas";

interface AsaasPixModalProps {
  isOpen: boolean;
  onClose: () => void;
  amountReais: number;
  description: string;
  payerEmail?: string;
  payerName?: string;
  payerCpfCnpj?: string;
  orderId?: string;
  carrierWalletId?: string;
  marketplaceFeeReais?: number;
  expiresAtUtc?: string | null;
  onExpired?: () => void;
  onPaymentSuccess: (paymentData: AsaasPixData) => void;
}

export function AsaasPixModal({
  isOpen,
  onClose,
  amountReais,
  description,
  payerEmail,
  payerName,
  payerCpfCnpj,
  orderId,
  carrierWalletId,
  marketplaceFeeReais,
  expiresAtUtc,
  onExpired,
  onPaymentSuccess
}: AsaasPixModalProps): React.JSX.Element | null {
  const [selectedAmount, setSelectedAmount] = useState<number>(amountReais);
  const [pixData, setPixData] = useState<AsaasPixData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      return;
    }

    const computeRemaining = () => {
      if (expiresAtUtc) {
        const diff = Math.floor((new Date(expiresAtUtc).getTime() - Date.now()) / 1000);
        return Math.max(0, diff);
      }
      return 15 * 60;
    };

    setRemainingSeconds(computeRemaining());
    countdownTimerRef.current = setInterval(() => {
      const next = expiresAtUtc
        ? Math.max(0, Math.floor((new Date(expiresAtUtc).getTime() - Date.now()) / 1000))
        : undefined;
      setRemainingSeconds((prev) => {
        const val = next !== undefined ? next : Math.max(0, prev - 1);
        if (val <= 0 && !isApproved) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setErrorMsg("O prazo de 15 minutos para pagamento Pix expirou e a reserva foi devolvida ao mural.");
          if (onExpired) onExpired();
        }
        return val;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isOpen, expiresAtUtc, isApproved, onExpired]);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedAmount(amountReais);
      setPixData(null);
      setIsApproved(false);
      setErrorMsg(null);
      setCopied(false);
      generatePix(amountReais);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [isOpen, amountReais]);

  const generatePix = async (targetAmount: number) => {
    setLoading(true);
    setErrorMsg(null);
    setCopied(false);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    try {
      const data = await createAsaasPix({
        amountReais: targetAmount,
        description: description || "Frete TopicLog",
        payerEmail: payerEmail || "contato@topiclog.com.br",
        payerName: payerName || "Remetente TopicLog",
        payerCpfCnpj,
        orderId,
        carrierWalletId,
        marketplaceFeeReais
      });
      setPixData(data);

      // Verificação automática a cada 5 segundos caso seja cobrança real no Asaas
      if (data.isKeyConfigured && data.id) {
        pollTimerRef.current = setInterval(async () => {
          try {
            const check = await checkAsaasPixStatus(data.id);
            if (check.isApproved) {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              setIsApproved(true);
              onPaymentSuccess({ ...data, status: "RECEIVED" });
            }
          } catch {
            // Silencioso em caso de oscilação de rede
          }
        }, 5000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar cobrança Pix via Asaas.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheck = async () => {
    if (!pixData) return;
    setChecking(true);
    setErrorMsg(null);
    try {
      const check = await checkAsaasPixStatus(pixData.id);
      if (check.isApproved) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setIsApproved(true);
        onPaymentSuccess({ ...pixData, status: "RECEIVED" });
      } else {
        setErrorMsg("Pagamento ainda não identificado no Asaas. Se já efetuou a transferência, aguarde alguns instantes.");
      }
    } catch {
      setErrorMsg("Não foi possível verificar no momento. Tentaremos novamente automaticamente.");
    } finally {
      setChecking(false);
    }
  };

  const handleCopyPix = async () => {
    if (!pixData?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(true);
    }
  };

  const handleCopyKey = async (rawKey: string) => {
    try {
      await navigator.clipboard.writeText(rawKey.trim());
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 3000);
    } catch {
      setCopiedKey(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backdropFilter: "blur(4px)"
      }}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px 22px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          position: "relative"
        }}
      >
        {/* Botão Fechar */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "#F1F5F9",
            border: "none",
            borderRadius: "50%",
            width: "32px",
            height: "32px",
            cursor: "pointer",
            fontWeight: 700,
            color: "#64748B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          ✕
        </button>

        {/* Cabeçalho */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#EFF6FF",
              color: "#1E40AF",
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 700,
              marginBottom: "8px"
            }}
          >
            <span>⚡</span>
            <span>TopicLog • Split Nativo Asaas</span>
          </div>
          <h2 style={{ fontSize: "20px", margin: "4px 0", color: "#0F172A", fontWeight: 800 }}>
            Pagamento do Frete via Pix
          </h2>
          <p style={{ fontSize: "12px", color: "#64748B", margin: 0 }}>
            Custódia protegida pela plataforma. O valor só é liberado ao transportador após a entrega com código.
          </p>
        </div>

        {/* Cronômetro */}
        <div
          style={{
            backgroundColor: remainingSeconds < 180 ? "#FEF2F2" : "#F8FAFC",
            border: `1px solid ${remainingSeconds < 180 ? "#FCA5A5" : "#E2E8F0"}`,
            borderRadius: "10px",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⏱️</span>
            <span style={{ fontSize: "12px", color: remainingSeconds < 180 ? "#991B1B" : "#475569", fontWeight: 600 }}>
              Reserva garantida por:
            </span>
          </div>
          <span
            style={{
              fontSize: "15px",
              fontWeight: 800,
              fontFamily: "monospace",
              color: remainingSeconds < 180 ? "#DC2626" : "#0F172A"
            }}
          >
            {formatCountdown(remainingSeconds)}
          </span>
        </div>

        {/* Valor do Frete */}
        <div
          style={{
            backgroundColor: "#F0FDF4",
            border: "1.5px solid #86EFAC",
            borderRadius: "12px",
            padding: "12px 16px",
            textAlign: "center",
            marginBottom: "16px"
          }}
        >
          <div style={{ fontSize: "11px", color: "#15803D", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Valor Total do Frete
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, color: "#166534", marginTop: "2px" }}>
            R$ {selectedAmount.toFixed(2).replace(".", ",")}
          </div>
          <div style={{ fontSize: "11px", color: "#15803D", marginTop: "2px" }}>
            Pix Instantâneo • Sem taxas adicionais para o remetente
          </div>
        </div>

        {/* Erro com Botão de Refazer Envio do Pix */}
        {errorMsg && (
          <div
            style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: "10px",
              padding: "12px 14px",
              color: "#991B1B",
              fontSize: "13px",
              marginBottom: "14px"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div>{errorMsg}</div>
                {remainingSeconds > 0 ? (
                  <div style={{ marginTop: "10px" }}>
                    <button
                      type="button"
                      onClick={() => generatePix(selectedAmount)}
                      disabled={loading}
                      style={{
                        backgroundColor: "#DC2626",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "6px",
                        padding: "7px 14px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: loading ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      🔄 Refazer Envio do Pix / Tentar Novamente
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: "#991B1B" }}>
                    ⏰ O prazo programado expirou. A reserva foi cancelada.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>⏳</div>
            <div style={{ fontWeight: 700, color: "#1E293B", fontSize: "14px" }}>
              Conectando à API do Asaas...
            </div>
            <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
              Gerando cobrança Pix oficial com split nativo.
            </div>
          </div>
        )}

        {/* Aprovado */}
        {isApproved && (
          <div
            style={{
              textAlign: "center",
              padding: "24px 12px",
              backgroundColor: "#F0FDF4",
              borderRadius: "12px",
              border: "2px solid #22C55E",
              marginBottom: "16px"
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "6px" }}>🎉</div>
            <h3 style={{ color: "#15803D", margin: "4px 0", fontSize: "18px", fontWeight: 800 }}>
              Pagamento Confirmado! Códigos de Início e Entrega gerados.
            </h3>
            <p style={{ color: "#166534", fontSize: "12px", margin: "4px 0 0" }}>
              Valor retido em custódia segura na TopicLog. A viagem já pode ser iniciada pelo transportador!
            </p>
          </div>
        )}

        {/* Conteúdo do Pix quando carregado e não aprovado */}
        {!loading && pixData && !isApproved && (
          <div>
            {/* Pix Disponível com QR Code e Copia e Cola */}
            {pixData.qrCode ? (
              <div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#FFFFFF",
                    border: "2px dashed #CBD5E1",
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "14px"
                  }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, marginBottom: "10px" }}>
                    ⚡ Favorecido: Luiz C Costa (CNPJ: 11.776.398/0001-79) • Custódia TopicLog
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      pixData.qrCodeBase64 && pixData.qrCodeBase64.length > 50
                        ? (pixData.qrCodeBase64.startsWith("data:") ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`)
                        : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixData.qrCode)}`
                    }
                    alt="QR Code Pix TopicLog Custódia"
                    style={{ width: "200px", height: "200px", display: "block", borderRadius: "8px" }}
                  />
                  <div style={{ fontSize: "11px", color: "#64748B", marginTop: "8px", textAlign: "center" }}>
                    Abra o app do seu banco e escolha <strong>Pix &gt; Pagar com QR Code</strong> ou utilize o Copia e Cola.
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                    Código Pix Copia e Cola Oficial:
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      readOnly
                      value={pixData.qrCode}
                      style={{
                        flex: 1,
                        fontSize: "11px",
                        fontFamily: "monospace",
                        padding: "8px 10px",
                        backgroundColor: "#F8FAFC",
                        border: "1px solid #CBD5E1",
                        borderRadius: "6px",
                        color: "#334155"
                      }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      style={{
                        backgroundColor: copied ? "#16A34A" : "#1E40AF",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "6px",
                        padding: "0 14px",
                        fontWeight: 700,
                        fontSize: "11px",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {copied ? "✓ Código Copiado!" : "Copiar Código Pix"}
                    </button>
                  </div>
                </div>

                {/* Opção Alternativa: Chave Pix Direta (Caso o app do banco rejeite Copia e Cola) */}
                <div
                  style={{
                    backgroundColor: "#F8FAFC",
                    border: "1px dashed #94A3B8",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    marginBottom: "14px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                      🔑 Chave Pix Direta (CNPJ da Plataforma):
                    </span>
                    <span style={{ fontSize: "10px", color: "#64748B" }}>
                      Tipo: CNPJ (11.776.398/0001-79)
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      readOnly
                      value={pixData.pixKey || "11776398000179"}
                      style={{
                        flex: 1,
                        fontSize: "11px",
                        fontFamily: "monospace",
                        padding: "6px 8px",
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #CBD5E1",
                        borderRadius: "6px",
                        color: "#0F172A"
                      }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyKey(pixData.pixKey || "11776398000179")}
                      style={{
                        backgroundColor: copiedKey ? "#16A34A" : "#475569",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "6px",
                        padding: "0 10px",
                        fontWeight: 700,
                        fontSize: "11px",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {copiedKey ? "✓ Chave Copiada!" : "Copiar Chave"}
                    </button>
                  </div>
                  <div style={{ fontSize: "10px", color: "#64748B", marginTop: "4px" }}>
                    Favorecido: <strong>Luiz C Costa</strong> • Valor exato: <strong>R$ {selectedAmount.toFixed(2).replace(".", ",")}</strong>.
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={handleManualCheck}
                    disabled={checking || remainingSeconds <= 0}
                    style={{
                      flex: 1,
                      backgroundColor: "#059669",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: checking || remainingSeconds <= 0 ? "not-allowed" : "pointer"
                    }}
                  >
                    {checking ? "Verificando no Asaas..." : "Já realizei o pagamento Pix"}
                  </button>
                  {remainingSeconds > 0 && (
                    <button
                      type="button"
                      onClick={() => generatePix(selectedAmount)}
                      disabled={loading || checking}
                      title="Gerar novamente o código Pix caso queira refazer o envio"
                      style={{
                        backgroundColor: "#F1F5F9",
                        color: "#334155",
                        border: "1px solid #CBD5E1",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: loading || checking ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      🔄 Refazer Envio
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* CENÁRIO B: Chave Asaas ainda não configurada no ambiente da Vercel */
              <div
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1.5px solid #FCA5A5",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "16px"
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ fontSize: "22px" }}>⚠️</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: "14px", color: "#991B1B" }}>
                      Serviço de pagamento Asaas não configurado no servidor
                    </strong>
                    <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#B91C1C", lineHeight: 1.45 }}>
                      A cobrança Pix não pôde ser gerada. Configure a variável <code>ASAAS_API_KEY</code> no painel da Vercel para habilitar pagamentos bancários reais com split automático.
                    </p>
                    {remainingSeconds > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <button
                          type="button"
                          onClick={() => generatePix(selectedAmount)}
                          disabled={loading}
                          style={{
                            backgroundColor: "#DC2626",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: "6px",
                            padding: "8px 14px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: loading ? "not-allowed" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          🔄 Refazer Envio do Pix / Tentar Novamente
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé */}
        <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #F1F5F9", textAlign: "center" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#64748B",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Fechar janela
          </button>
        </div>
      </div>
    </div>
  );
}
