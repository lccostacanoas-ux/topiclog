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

      // Verificação automática a cada 4 segundos
      pollTimerRef.current = setInterval(async () => {
        try {
          const check = await checkAsaasPixStatus(data.id);
          if (check.isApproved) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setIsApproved(true);
            onPaymentSuccess({ ...data, status: "RECEIVED" });
          }
        } catch {
          // Erro transitório de rede
        }
      }, 4000);
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
        setErrorMsg("Pagamento ainda não identificado no sistema bancário do Asaas. Se já pagou, aguarde alguns instantes.");
      }
    } catch {
      setErrorMsg("Não foi possível verificar no momento. O sistema continuará checando automaticamente.");
    } finally {
      setChecking(false);
    }
  };

  const handleCopyPix = async () => {
    if (!pixData?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
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
      id: `pay_asaas_sim_${Date.now()}`,
      status: "RECEIVED",
      statusDetail: "Aprovado em modo de teste Asaas",
      qrCode: "",
      transactionAmount: selectedAmount,
      createdAt: new Date().toISOString()
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
        {/* Botão de Fechar */}
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

        {/* Alerta de Modo de Teste Asaas caso a chave real não esteja inserida */}
        {pixData?.isSandboxSimulator && (
          <div
            style={{
              backgroundColor: "#EFF6FF",
              border: "1px dashed #3B82F6",
              borderRadius: "8px",
              padding: "8px 12px",
              marginBottom: "12px",
              fontSize: "11px",
              color: "#1E40AF",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px"
            }}
          >
            <div>
              <strong>Ambiente Asaas Integrado:</strong> Nenhum valor vai para o banco legado. Transição para chave definitiva pronta.
            </div>
          </div>
        )}

        {/* Cronômetro de Expiração */}
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

        {/* Card de Valor do Frete */}
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

        {/* Feedback de Erro */}
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

        {/* Estado de Carregamento */}
        {loading && (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>⏳</div>
            <div style={{ fontWeight: 700, color: "#1E293B", fontSize: "14px" }}>
              Gerando cobrança Pix Asaas...
            </div>
            <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
              Conectando ao sistema bancário integrado da TopicLog.
            </div>
          </div>
        )}

        {/* Sucesso / Aprovado */}
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
              Pagamento Pix Confirmado!
            </h3>
            <p style={{ color: "#166534", fontSize: "12px", margin: "4px 0 0" }}>
              Valor retido em custódia segura. Os códigos de início e entrega já estão liberados!
            </p>
          </div>
        )}

        {/* Dados do Pix (QR Code e Copia e Cola) */}
        {!loading && pixData && !isApproved && (
          <div>
            {/* Box do QR Code */}
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
              {pixData.qrCodeBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pixData.qrCodeBase64}
                  alt="QR Code Pix Asaas"
                  style={{ width: "200px", height: "200px", display: "block" }}
                />
              ) : (
                <div
                  style={{
                    width: "180px",
                    height: "180px",
                    backgroundColor: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px",
                    textAlign: "center"
                  }}
                >
                  <span style={{ fontSize: "36px" }}>📱</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", marginTop: "4px" }}>
                    Pix Copia e Cola Asaas
                  </span>
                  <span style={{ fontSize: "10px", color: "#64748B", marginTop: "2px" }}>
                    Copie a chave no botão abaixo
                  </span>
                </div>
              )}
              <div style={{ fontSize: "11px", color: "#64748B", marginTop: "8px", textAlign: "center" }}>
                Abra o app do seu banco e escolha <strong>Pix &gt; Pagar com QR Code</strong> ou utilize o Copia e Cola.
              </div>
            </div>

            {/* Input Copia e Cola */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                Código Pix Copia e Cola:
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
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  {copied ? "✓ Copiado!" : "Copiar"}
                </button>
              </div>
            </div>

            {/* Ações de Verificação */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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

              {/* Botão de Simulação Instantânea em Ambiente de Teste */}
              <button
                type="button"
                onClick={handleSimulateInstantPayment}
                style={{
                  width: "100%",
                  backgroundColor: "#EFF6FF",
                  color: "#1E40AF",
                  border: "1px dashed #93C5FD",
                  borderRadius: "8px",
                  padding: "8px",
                  fontWeight: 700,
                  fontSize: "11px",
                  cursor: "pointer"
                }}
              >
                ⚡ Simular Confirmação Instantânea (Ambiente de Testes)
              </button>
            </div>
          </div>
        )}

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
