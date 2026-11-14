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

  const handleSimulateInstantPayment = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setIsApproved(true);
    const successData: AsaasPixData = pixData || {
      id: `pay_asaas_demo_${Date.now()}`,
      status: "RECEIVED",
      statusDetail: "Aprovado em modo de teste Asaas",
      qrCode: "",
      transactionAmount: selectedAmount,
      createdAt: new Date().toISOString(),
      isSandboxSimulator: true
    };
    onPaymentSuccess({ ...successData, status: "RECEIVED" });
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

        {/* Erro */}
        {errorMsg && (
          <div
            style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: "8px",
              padding: "10px 12px",
              color: "#991B1B",
              fontSize: "12px",
              marginBottom: "14px"
            }}
          >
            ⚠️ {errorMsg}
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
            {/* CENÁRIO A: Chave Asaas configurada (Pix Oficial Disponível) */}
            {pixData.isKeyConfigured && pixData.qrCode ? (
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      pixData.qrCodeBase64 && pixData.qrCodeBase64.length > 50
                        ? (pixData.qrCodeBase64.startsWith("data:") ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`)
                        : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixData.qrCode)}`
                    }
                    alt="QR Code Pix Asaas Oficial"
                    style={{ width: "200px", height: "200px", display: "block", borderRadius: "8px" }}
                  />
                  <div style={{ fontSize: "11px", color: "#64748B", marginTop: "8px", textAlign: "center" }}>
                    Abra o app do seu banco e escolha <strong>Pix &gt; Pagar com QR Code</strong> ou utilize o Copia e Cola.
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                    Código Pix Copia e Cola Oficial (Asaas):
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

                <button
                  type="button"
                  onClick={handleManualCheck}
                  disabled={checking}
                  style={{
                    width: "100%",
                    backgroundColor: "#059669",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: checking ? "not-allowed" : "pointer"
                  }}
                >
                  {checking ? "Verificando no Asaas..." : "Já realizei o pagamento Pix"}
                </button>
              </div>
            ) : (
              /* CENÁRIO B: Chave Asaas ainda não configurada no ambiente da Vercel */
              <div
                style={{
                  backgroundColor: "#EFF6FF",
                  border: "1.5px solid #93C5FD",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "16px"
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                  <span style={{ fontSize: "22px" }}>ℹ️</span>
                  <div>
                    <strong style={{ fontSize: "14px", color: "#1E40AF" }}>
                      Integração Asaas Pronta para Ativação
                    </strong>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#1D4ED8", lineHeight: 1.45 }}>
                      O sistema já está 100% migrado para a arquitetura do <strong>Asaas Split</strong>. Nenhuma cobrança será enviada para o banco legado antigo.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: "1px dashed #BFDBFE",
                    borderRadius: "8px",
                    padding: "12px",
                    fontSize: "12px",
                    color: "#334155",
                    marginBottom: "14px",
                    lineHeight: 1.5
                  }}
                >
                  <strong>Como ativar pagamentos reais via banco:</strong>
                  <div style={{ marginTop: "4px" }}>
                    Adicione a variável <code>ASAAS_API_KEY</code> no painel da Vercel (ou no arquivo de ambiente). O sistema detectará automaticamente se a chave é de Produção ou Sandbox e gerará QR Codes oficiais registrados no BACEN.
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "11px", color: "#64748B", margin: "0 0 8px" }}>
                    Para testar a máquina de estados (reserva, custódia e entrega via PIN) agora mesmo:
                  </p>
                  <button
                    type="button"
                    onClick={handleSimulateInstantPayment}
                    style={{
                      width: "100%",
                      backgroundColor: "#2563EB",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "8px",
                      padding: "11px",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)"
                    }}
                  >
                    ⚡ Simular Confirmação Pix (Ambiente de Teste)
                  </button>
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
