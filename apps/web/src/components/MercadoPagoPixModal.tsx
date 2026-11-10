"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  createMercadoPagoPix,
  checkMercadoPagoPixStatus,
  type MercadoPagoPixData
} from "../lib/mercadopago";

interface MercadoPagoPixModalProps {
  isOpen: boolean;
  onClose: () => void;
  amountReais: number;
  description: string;
  payerEmail?: string;
  payerName?: string;
  payerCpf?: string;
  orderId?: string;
  onPaymentSuccess: (paymentData: MercadoPagoPixData) => void;
}

export function MercadoPagoPixModal({
  isOpen,
  onClose,
  amountReais,
  description,
  payerEmail,
  payerName,
  payerCpf,
  orderId,
  onPaymentSuccess
}: MercadoPagoPixModalProps): React.JSX.Element | null {
  const [selectedAmount, setSelectedAmount] = useState<number>(amountReais);
  const [pixData, setPixData] = useState<MercadoPagoPixData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      const data = await createMercadoPagoPix({
        amountReais: targetAmount,
        description: description || "Frete TopicLog",
        payerEmail: payerEmail || "contato@topiclog.com.br",
        payerName: payerName || "Remetente TopicLog",
        payerCpf: payerCpf,
        orderId
      });
      setPixData(data);

      // Inicia verificação automática a cada 4 segundos
      pollTimerRef.current = setInterval(async () => {
        try {
          const check = await checkMercadoPagoPixStatus(data.id);
          if (check.isApproved) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setIsApproved(true);
            onPaymentSuccess({ ...data, status: "approved" });
          }
        } catch {
          // ignore polling network errors
        }
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar cobrança Pix.";
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
      const check = await checkMercadoPagoPixStatus(pixData.id);
      if (check.isApproved) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setIsApproved(true);
        onPaymentSuccess({ ...pixData, status: "approved" });
      } else {
        setErrorMsg("Pagamento ainda não identificado no sistema bancário. Se já pagou, aguarde alguns instantes.");
      }
    } catch {
      setErrorMsg("Não foi possível verificar no momento. Tentaremos automaticamente.");
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
            fontSize: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          aria-label="Fechar modal"
        >
          ✕
        </button>

        {isApproved ? (
          /* =========================================================================
             TELA DE SUCESSO DO PAGAMENTO PIX
             ========================================================================= */
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <div
              style={{
                width: "68px",
                height: "68px",
                borderRadius: "50%",
                backgroundColor: "#DCFCE7",
                color: "#16A34A",
                fontSize: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto"
              }}
            >
              ✓
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 6px 0" }}>
              Pagamento Confirmado!
            </h2>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#166534", backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", padding: "8px 12px", borderRadius: "8px", margin: "12px 0 16px 0" }}>
              R$ {selectedAmount.toFixed(2).replace(".", ",")} em custódia segura na Topic Log
            </div>
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.5", margin: "0 0 24px 0" }}>
              O valor do frete foi recebido com sucesso via Pix pelo Mercado Pago. O transportador já está autorizado e a coleta da encomenda foi liberada!
            </p>
            <button
              type="button"
              onClick={onClose}
              className="btn btn--primary"
              style={{ width: "100%", padding: "12px", fontSize: "15px", fontWeight: 700 }}
            >
              Concluir & Voltar
            </button>
          </div>
        ) : (
          /* =========================================================================
             TELA DE COBRANÇA PIX (QR CODE + COPIA E COLA)
             ========================================================================= */
          <div>
            {/* Cabeçalho */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "20px" }}>⚡</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#0284C7", backgroundColor: "#E0F2FE", padding: "2px 8px", borderRadius: "10px" }}>
                  Pix Mercado Pago Oficial
                </span>
              </div>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: 0 }}>
                Pagamento do Frete com Pix
              </h2>
              <p style={{ fontSize: "12px", color: "#64748B", margin: "4px 0 0 0" }}>
                O valor fica 100% protegido em custódia até a entrega do pacote com senha (PIN).
              </p>
            </div>

            {/* Alternância de Valor: Real vs R$ 1,00 para teste */}
            <div
              style={{
                backgroundColor: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: "10px",
                padding: "10px 12px",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px"
              }}
            >
              <div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", display: "block" }}>
                  Valor da Cobrança:
                </span>
                <span style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A" }}>
                  R$ {selectedAmount.toFixed(2).replace(".", ",")}
                </span>
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAmount(amountReais);
                    generatePix(amountReais);
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid",
                    borderColor: selectedAmount === amountReais ? "#2563EB" : "#CBD5E1",
                    backgroundColor: selectedAmount === amountReais ? "#EFF6FF" : "#FFFFFF",
                    color: selectedAmount === amountReais ? "#1D4ED8" : "#475569",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Valor Real
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedAmount(1.0);
                    generatePix(1.0);
                  }}
                  title="Gera cobrança real de R$ 1,00 para teste prático na sua conta bancária"
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid",
                    borderColor: selectedAmount === 1.0 ? "#059669" : "#CBD5E1",
                    backgroundColor: selectedAmount === 1.0 ? "#ECFDF5" : "#FFFFFF",
                    color: selectedAmount === 1.0 ? "#047857" : "#475569",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  🧪 Testar R$ 1,00
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <div style={{ fontSize: "28px", marginBottom: "10px" }}>⏳</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
                  Gerando cobrança Pix no Mercado Pago...
                </div>
                <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
                  Conectando à conta jurídica Topic Log
                </div>
              </div>
            ) : pixData ? (
              <div>
                {/* QR Code Imagem Base64 */}
                {pixData.qrCodeBase64 && (
                  <div style={{ textAlign: "center", marginBottom: "16px" }}>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "10px",
                        backgroundColor: "#FFFFFF",
                        border: "2px solid #E2E8F0",
                        borderRadius: "14px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)"
                      }}
                    >
                      <img
                        src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                        alt="QR Code Pix Mercado Pago"
                        style={{ width: "200px", height: "200px", display: "block" }}
                      />
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748B", marginTop: "6px" }}>
                      Abra o app do seu banco e aponte a câmera para pagar
                    </div>
                  </div>
                )}

                {/* Pix Copia e Cola */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    Pix Copia e Cola:
                  </label>
                  <div style={{ position: "relative" }}>
                    <textarea
                      readOnly
                      rows={3}
                      value={pixData.qrCode}
                      style={{
                        width: "100%",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        backgroundColor: "#F8FAFC",
                        color: "#334155",
                        resize: "none"
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyPix}
                    style={{
                      width: "100%",
                      marginTop: "6px",
                      padding: "10px",
                      backgroundColor: copied ? "#16A34A" : "#2563EB",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {copied ? "✓ Código Pix Copiado!" : "📋 Copiar Código Pix"}
                  </button>
                </div>

                {/* Status Pulsante & Botão de Verificação */}
                <div
                  style={{
                    backgroundColor: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    borderRadius: "10px",
                    padding: "12px",
                    textAlign: "center",
                    marginBottom: "16px"
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E40AF", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#3B82F6", animation: "pulse 1.5s infinite" }}></span>
                    Aguardando confirmação bancária...
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                    A tela atualiza automaticamente assim que o banco aprovar.
                  </div>

                  <button
                    type="button"
                    onClick={handleManualCheck}
                    disabled={checking}
                    style={{
                      marginTop: "8px",
                      padding: "6px 14px",
                      backgroundColor: "#FFFFFF",
                      border: "1px solid #93C5FD",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#1D4ED8",
                      cursor: checking ? "wait" : "pointer"
                    }}
                  >
                    {checking ? "Verificando..." : "🔄 Já paguei / Verificar agora"}
                  </button>
                </div>

                {errorMsg && (
                  <div style={{ fontSize: "12px", color: "#DC2626", backgroundColor: "#FEF2F2", padding: "8px 10px", borderRadius: "6px", border: "1px solid #FECACA", marginBottom: "14px" }}>
                    {errorMsg}
                  </div>
                )}

                {/* Link direto do comprovante */}
                {pixData.ticketUrl && (
                  <div style={{ textAlign: "center" }}>
                    <a
                      href={pixData.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "11px", color: "#2563EB", textDecoration: "underline" }}
                    >
                      Ver comprovante oficial no Mercado Pago ↗
                    </a>
                  </div>
                )}
              </div>
            ) : errorMsg ? (
              <div style={{ textAlign: "center", padding: "20px 8px" }}>
                <div style={{ color: "#DC2626", fontSize: "13px", marginBottom: "12px" }}>
                  {errorMsg}
                </div>
                <button
                  type="button"
                  onClick={() => generatePix(selectedAmount)}
                  className="btn btn--outline"
                  style={{ fontSize: "13px", padding: "6px 16px" }}
                >
                  Tentar Novamente
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
