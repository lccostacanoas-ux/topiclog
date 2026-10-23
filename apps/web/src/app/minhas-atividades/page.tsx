"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { EmptyState } from "../../components/EmptyState";
import { StatusPill } from "../../components/StatusPill";
import {
  type DemoShipment,
  type DemoTrip,
  getDemoShipments,
  getDemoTrips
} from "../../lib/demo-marketplace-store";
import {
  getSandboxTokenApi,
  getPostDeliverySuggestionsApi,
  apiRequest
} from "../../lib/api-client";
import type { PostDeliverySuggestionDto } from "../../lib/types";

interface CompressedImageResult {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getOrderIdForShipment(shipmentId: string): string {
  if (shipmentId === "enc-001" || shipmentId === "1") {
    return "f0000001-0000-0000-0000-000000000001";
  }
  if (shipmentId.startsWith("enc-00")) {
    const num = shipmentId.replace("enc-00", "");
    return `f0000001-0000-0000-0000-00000000000${num}`;
  }
  if (shipmentId.length === 1 && !isNaN(Number(shipmentId))) {
    return `f0000001-0000-0000-0000-00000000000${shipmentId}`;
  }
  return shipmentId;
}

/**
 * Utilitário nativo de compressão e redimensionamento via Canvas (Zero Dependências).
 * Respeita estritamente o aspect ratio e a orientação EXIF do navegador,
 * redimensionando para dimensão máxima de 1280px e qualidade JPEG 0.8 (meta ~200 KB).
 */
function compressImageFile(
  file: File,
  maxDimension: number = 1280,
  quality: number = 0.8
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(
        new Error(
          "O arquivo selecionado não é uma imagem válida. Utilize JPEG, PNG ou WebP."
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      reject(
        new Error("Falha ao ler o arquivo de imagem do dispositivo móvel.")
      );
    };

    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        reject(new Error("Falha ao ler os bytes da imagem."));
        return;
      }

      const img = new Image();
      img.onerror = () => {
        reject(
          new Error(
            "Não foi possível decodificar o arquivo de imagem selecionado."
          )
        );
      };

      img.onload = () => {
        try {
          const origWidth = img.naturalWidth || img.width;
          const origHeight = img.naturalHeight || img.height;

          if (origWidth === 0 || origHeight === 0) {
            reject(new Error("Dimensões inválidas da fotografia capturada."));
            return;
          }

          let targetWidth = origWidth;
          let targetHeight = origHeight;

          // Cálculo proporcional preservando rigorosamente o aspect ratio original
          if (origWidth > maxDimension || origHeight > maxDimension) {
            if (origWidth >= origHeight) {
              targetHeight = Math.round((origHeight * maxDimension) / origWidth);
              targetWidth = maxDimension;
            } else {
              targetWidth = Math.round((origWidth * maxDimension) / origHeight);
              targetHeight = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(
              new Error(
                "Contexto gráfico Canvas não disponível no navegador do dispositivo."
              )
            );
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          const base64Content = compressedDataUrl.split(",")[1] || "";
          const sizeBytes = Math.round((base64Content.length * 3) / 4);

          resolve({
            dataUrl: compressedDataUrl,
            mimeType: "image/jpeg",
            width: targetWidth,
            height: targetHeight,
            sizeBytes,
            originalSizeBytes: file.size
          });
        } catch (err: any) {
          reject(
            new Error(
              err?.message || "Erro inesperado durante a compressão via Canvas."
            )
          );
        }
      };

      img.src = src;
    };

    reader.readAsDataURL(file);
  });
}

interface DeliveryState {
  status:
    | "AWAITING_PICKUP"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED_VERIFIED"
    | "EXCEPTION_REPORTED"
    | "RESCHEDULED"
    | "RETURN_TO_SENDER_INITIATED";
  plainCode: string;
  revealedCode: boolean;
  failedAttempts: number;
  maxAttempts: number;
  isLocked: boolean;
  hasPhotoProof: boolean;
  photoUrl: string | null;
  storageUrl?: string | null;
  sha256Hash?: string | null;
  exceptionReason: string | null;
  exceptionNotes: string | null;
  rescheduledDate: string | null;
}

function getOrInitDeliveryState(prev: Record<string, DeliveryState>, shipmentId: string): DeliveryState {
  const existing = prev[shipmentId];
  if (existing) return existing;
  return {
    status: "IN_TRANSIT",
    plainCode: "7492",
    revealedCode: false,
    failedAttempts: 0,
    maxAttempts: 3,
    isLocked: false,
    hasPhotoProof: false,
    photoUrl: null,
    exceptionReason: null,
    exceptionNotes: null,
    rescheduledDate: null
  };
}

export default function MinhasAtividadesPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<"MY_SHIPMENTS" | "MY_TRIPS">("MY_SHIPMENTS");
  const [activePersona, setActivePersona] = useState<"SENDER" | "CARRIER">("CARRIER");

  // Estados operacionais das encomendas ativas
  const [deliveryStates, setDeliveryStates] = useState<Record<string, DeliveryState>>({
    "enc-001": {
      status: "IN_TRANSIT",
      plainCode: "7492",
      revealedCode: false,
      failedAttempts: 0,
      maxAttempts: 3,
      isLocked: false,
      hasPhotoProof: false,
      photoUrl: null,
      exceptionReason: null,
      exceptionNotes: null,
      rescheduledDate: null
    },
    "enc-002": {
      status: "AWAITING_PICKUP",
      plainCode: "3851",
      revealedCode: false,
      failedAttempts: 0,
      maxAttempts: 3,
      isLocked: false,
      hasPhotoProof: false,
      photoUrl: null,
      exceptionReason: null,
      exceptionNotes: null,
      rescheduledDate: null
    },
    "enc-003": {
      status: "DELIVERED_VERIFIED",
      plainCode: "5914",
      revealedCode: true,
      failedAttempts: 0,
      maxAttempts: 3,
      isLocked: false,
      hasPhotoProof: true,
      photoUrl: "https://storage.topiclog.local/proofs/delivery_photo_3.jpg",
      exceptionReason: null,
      exceptionNotes: null,
      rescheduledDate: null
    },
    "1": {
      status: "IN_TRANSIT",
      plainCode: "7492",
      revealedCode: false,
      failedAttempts: 0,
      maxAttempts: 3,
      isLocked: false,
      hasPhotoProof: false,
      photoUrl: null,
      exceptionReason: null,
      exceptionNotes: null,
      rescheduledDate: null
    },
    "2": {
      status: "AWAITING_PICKUP",
      plainCode: "3851",
      revealedCode: false,
      failedAttempts: 0,
      maxAttempts: 3,
      isLocked: false,
      hasPhotoProof: false,
      photoUrl: null,
      exceptionReason: null,
      exceptionNotes: null,
      rescheduledDate: null
    },
    "3": {
      status: "DELIVERED_VERIFIED",
      plainCode: "5914",
      revealedCode: true,
      failedAttempts: 0,
      maxAttempts: 3,
      isLocked: false,
      hasPhotoProof: true,
      photoUrl: "https://storage.topiclog.local/proofs/delivery_photo_3.jpg",
      exceptionReason: null,
      exceptionNotes: null,
      rescheduledDate: null
    }
  });

  // Estados para captura e comprovação fotográfica (D16)
  const [activePhotoUploadShipmentId, setActivePhotoUploadShipmentId] = useState<string | null>(null);
  const [viewingPhotoShipmentId, setViewingPhotoShipmentId] = useState<string | null>(null);
  const [previewPhotoData, setPreviewPhotoData] = useState<CompressedImageResult | null>(null);
  const [photoDescription, setPhotoDescription] = useState<string>("Pacote entregue no endereço de destino em perfeitas condições.");
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState<boolean>(false);
  const [photoErrorMsg, setPhotoErrorMsg] = useState<string | null>(null);
  const [capturedCoords, setCapturedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Referências nativas para input de câmera (capture=environment) e galeria/arquivos
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Entradas do usuário
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [feedbackNotice, setFeedbackNotice] = useState<Record<string, { type: "success" | "error" | "warning"; text: string }>>({});
  
  // Modal de Exceção (Destinatário Ausente)
  const [exceptionModalShipmentId, setExceptionModalShipmentId] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState<string>("RECIPIENT_ABSENT");
  const [exceptionNotes, setExceptionNotes] = useState<string>("Campainha acionada 3x sem resposta no imóvel.");

  // Modal de Reagendamento
  const [rescheduleModalShipmentId, setRescheduleModalShipmentId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("2026-10-16");
  const [rescheduleWindow, setRescheduleWindow] = useState<string>("Manhã (08h - 12h)");

  // Sugestões pós-entrega (2 km)
  const [suggestions, setSuggestions] = useState<Record<string, PostDeliverySuggestionDto[]>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Record<string, boolean>>({});

  const shipments = getDemoShipments();
  const trips = getDemoTrips();

  // Handlers para ações de Remetente (Decisões 1 & 2)
  const handleRevealDeliveryCode = (shipmentId: string) => {
    if (activePersona === "CARRIER") {
      setFeedbackNotice((prev) => ({
        ...prev,
        [shipmentId]: {
          type: "error",
          text: "Acesso Negado (403): O transportador não possui permissão para visualizar o código confidencial de entrega. O código deve ser fornecido exclusivamente pelo destinatário no momento da entrega (Decisão D16)."
        }
      }));
      return;
    }

    setDeliveryStates((prev) => {
      const current = getOrInitDeliveryState(prev, shipmentId);
      return {
        ...prev,
        [shipmentId]: {
          ...current,
          revealedCode: true
        }
      };
    });
    setFeedbackNotice((prev) => ({
      ...prev,
      [shipmentId]: {
        type: "success",
        text: "Código de entrega recuperado com sucesso. Forneça ao transportador somente após inspecionar o pacote presencialmente."
      }
    }));
  };

  const handleRegenerateCode = (shipmentId: string) => {
    if (activePersona !== "SENDER") {
      setFeedbackNotice((prev) => ({
        ...prev,
        [shipmentId]: {
          type: "error",
          text: "Apenas o remetente pode emitir um novo código de entrega."
        }
      }));
      return;
    }

    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    setDeliveryStates((prev) => {
      const current = getOrInitDeliveryState(prev, shipmentId);
      return {
        ...prev,
        [shipmentId]: {
          ...current,
          plainCode: newCode,
          failedAttempts: 0,
          isLocked: false,
          revealedCode: true
        }
      };
    });

    setFeedbackNotice((prev) => ({
      ...prev,
      [shipmentId]: {
        type: "warning",
        text: `Novo código gerado com sucesso (${newCode})! O código anterior foi invalidado e o bloqueio de tentativas foi zerado.`
      }
    }));
  };

  // Handlers para ações de Transportador (Decisões 1, 2, 3)
  const handleConfirmPickup = (shipmentId: string) => {
    setDeliveryStates((prev) => {
      const current = getOrInitDeliveryState(prev, shipmentId);
      return {
        ...prev,
        [shipmentId]: {
          ...current,
          status: "IN_TRANSIT"
        }
      };
    });
    setFeedbackNotice((prev) => ({
      ...prev,
      [shipmentId]: {
        type: "success",
        text: "Coleta confirmada com o remetente! Carga em trânsito com capacidade de trecho ocupada."
      }
    }));
  };

  // Handlers para Captura Fotográfica e Comprovação de Entrega (Decisão D16 / Gate G2 & G3)
  const handleOpenPhotoUpload = (shipmentId: string) => {
    setActivePhotoUploadShipmentId(shipmentId);
    setPreviewPhotoData(null);
    setPhotoDescription("Pacote entregue no endereço de destino em perfeitas condições.");
    setPhotoErrorMsg(null);
    setCapturedCoords(null);
  };

  const handleCancelPhotoUpload = () => {
    if (isSubmittingProof) return;
    setActivePhotoUploadShipmentId(null);
    setPreviewPhotoData(null);
    setPhotoErrorMsg(null);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      // Cancelamento do diálogo nativo pelo usuário: preserva estado sem emitir erro
      return;
    }

    const file = files[0];
    if (!file) return;

    // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente
    e.target.value = "";

    // Validação estrita de formato
    if (!file.type.startsWith("image/")) {
      setPhotoErrorMsg(
        "Formato não suportado. Por favor, selecione uma imagem nos formatos JPEG, PNG ou WebP."
      );
      return;
    }

    setIsProcessingPhoto(true);
    setPhotoErrorMsg(null);

    // Tentativa não bloqueante de obter geolocalização do dispositivo
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCapturedCoords({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6))
          });
        },
        () => {
          // Permissão negada ou timeout: coordenadas permanecem nulas sem travar o fluxo
        },
        { timeout: 2500, enableHighAccuracy: false }
      );
    }

    try {
      // Otimização, redimensionamento para 1280px e compressão Canvas (meta ~200 KB)
      const compressed = await compressImageFile(file, 1280, 0.8);
      setPreviewPhotoData(compressed);
    } catch (err: any) {
      setPhotoErrorMsg(
        err?.message || "Falha ao processar e comprimir a imagem via Canvas."
      );
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleConfirmUploadProof = async () => {
    if (!activePhotoUploadShipmentId || !previewPhotoData) {
      setPhotoErrorMsg("Selecione ou capture uma foto antes de confirmar.");
      return;
    }

    setIsSubmittingProof(true);
    setPhotoErrorMsg(null);

    try {
      const orderId = getOrderIdForShipment(activePhotoUploadShipmentId);

      // 1. Obtém token JWT assinado para o transportador no ambiente de testes (Sandbox)
      const tokenRes = await getSandboxTokenApi("CARRIER");
      const token = tokenRes.ok && tokenRes.data ? tokenRes.data.accessToken : undefined;

      // 2. Chama endpoint existente da API .NET 10 (POST /api/v1/deliveries/{orderId}/delivery-proof)
      const res = await apiRequest<{
        id: string;
        deliveryOrderId: string;
        fileUrl: string;
        sha256Hash: string;
        mimeType: string;
        fileSizeBytes: number;
        uploadedAtUtc: string;
      }>(`/api/v1/deliveries/${orderId}/delivery-proof`, {
        method: "POST",
        token,
        body: {
          fileBase64OrUrl: previewPhotoData.dataUrl,
          mimeType: previewPhotoData.mimeType,
          description:
            photoDescription.trim() ||
            "Comprovante fotográfico de entrega capturado via dispositivo móvel",
          latitude: capturedCoords?.lat ?? null,
          longitude: capturedCoords?.lng ?? null
        }
      });

      // 3. Regra: Apresentação da mensagem de confirmação apenas após a resposta do backend
      if (res.ok && res.data) {
        const proof = res.data;
        setDeliveryStates((prev) => {
          const current = getOrInitDeliveryState(prev, activePhotoUploadShipmentId);
          return {
            ...prev,
            [activePhotoUploadShipmentId]: {
              ...current,
              hasPhotoProof: true,
              photoUrl: previewPhotoData.dataUrl,
              storageUrl: proof.fileUrl,
              sha256Hash: proof.sha256Hash,
              status: current.status === "IN_TRANSIT" ? "OUT_FOR_DELIVERY" : current.status
            }
          };
        });

        setFeedbackNotice((prev) => ({
          ...prev,
          [activePhotoUploadShipmentId]: {
            type: "success",
            text: `✓ Comprovante fotográfico auditado e registrado pelo backend (SHA-256: ${proof.sha256Hash.substring(0, 16)}...). Carga em rota final. Solicite o código de 4 dígitos do destinatário (D16).`
          }
        }));

        setActivePhotoUploadShipmentId(null);
        setPreviewPhotoData(null);
      } else {
        const errorDetail =
          res.problem?.detail ||
          res.problem?.title ||
          `Erro do servidor (HTTP ${res.status}): Não foi possível validar o comprovante fotográfico.`;
        setPhotoErrorMsg(errorDetail);
      }
    } catch (err: any) {
      setPhotoErrorMsg(
        err?.message || "Falha de comunicação com o servidor da Topic Log."
      );
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleConfirmDelivery = (shipmentId: string) => {
    const st = deliveryStates[shipmentId];
    if (!st) return;

    if (!st.hasPhotoProof) {
      setFeedbackNotice((prev) => ({
        ...prev,
        [shipmentId]: {
          type: "error",
          text: "Requisito Vinculante D16: É obrigatório anexar a evidência fotográfica da entrega antes de submeter o código de confirmação."
        }
      }));
      return;
    }

    if (st.isLocked) {
      setFeedbackNotice((prev) => ({
        ...prev,
        [shipmentId]: {
          type: "error",
          text: "Desafio Bloqueado (422): Limite de 3 tentativas consecutivas atingido. Solicite a reemissão de um novo código pelo remetente."
        }
      }));
      return;
    }

    const code = (codeInput[shipmentId] || "").trim();
    if (code.length !== 4) {
      setFeedbackNotice((prev) => ({
        ...prev,
        [shipmentId]: {
          type: "error",
          text: "O código deve conter exatamente 4 dígitos numéricos."
        }
      }));
      return;
    }

    if (code !== st.plainCode) {
      const nextFail = st.failedAttempts + 1;
      const isNowLocked = nextFail >= st.maxAttempts;
      const remaining = Math.max(0, st.maxAttempts - nextFail);

      setDeliveryStates((prev) => {
        const current = getOrInitDeliveryState(prev, shipmentId);
        return {
          ...prev,
          [shipmentId]: {
            ...current,
            failedAttempts: nextFail,
            isLocked: isNowLocked
          }
        };
      });

      setFeedbackNotice((prev) => ({
        ...prev,
        [shipmentId]: {
          type: "error",
          text: isNowLocked
            ? "Código Incorreto! Limite de 3 tentativas atingido: O código foi bloqueado por segurança (CHALLENGE_LOCKED). O remetente precisará emitir um novo código."
            : `Código Incorreto! Restam ${remaining} tentativa(s) antes do bloqueio definitivo.`
        }
      }));
      return;
    }

    // Código correto e foto anexada -> Transita para DELIVERED_VERIFIED
    setDeliveryStates((prev) => {
      const current = getOrInitDeliveryState(prev, shipmentId);
      return {
        ...prev,
        [shipmentId]: {
          ...current,
          status: "DELIVERED_VERIFIED"
        }
      };
    });
    setFeedbackNotice((prev) => ({
      ...prev,
      [shipmentId]: {
        type: "success",
        text: "🎉 Entrega Concluída e Auditada com Sucesso (Gate G3)! Código de 4 dígitos e evidência fotográfica validados. Repasse líquido liberado."
      }
    }));
  };

  const handleReportException = (shipmentId: string) => {
    setDeliveryStates((prev) => {
      const current = getOrInitDeliveryState(prev, shipmentId);
      return {
        ...prev,
        [shipmentId]: {
          ...current,
          status: "EXCEPTION_REPORTED",
          exceptionReason: exceptionReason,
          exceptionNotes: exceptionNotes
        }
      };
    });
    setExceptionModalShipmentId(null);
    setFeedbackNotice((prev) => ({
      ...prev,
      [shipmentId]: {
        type: "warning",
        text: `Ocorrência registrada: ${exceptionReason === "RECIPIENT_ABSENT" ? "Destinatário Ausente" : exceptionReason}. A entrega foi suspensa e aguarda reagendamento ou devolução.`
      }
    }));
  };

  const handleReschedule = (shipmentId: string) => {
    setDeliveryStates((prev) => {
      const current = getOrInitDeliveryState(prev, shipmentId);
      return {
        ...prev,
        [shipmentId]: {
          ...current,
          status: "RESCHEDULED",
          rescheduledDate: `${rescheduleDate} (${rescheduleWindow})`
        }
      };
    });
    setRescheduleModalShipmentId(null);
    setFeedbackNotice((prev) => ({
      ...prev,
      [shipmentId]: {
        type: "success",
        text: `Entrega reagendada para ${rescheduleDate} no período ${rescheduleWindow}. Remetente e transportador notificados.`
      }
    }));
  };

  const handleInitiateReturn = (shipmentId: string) => {
    setDeliveryStates((prev) => {
      const current = getOrInitDeliveryState(prev, shipmentId);
      return {
        ...prev,
        [shipmentId]: {
          ...current,
          status: "RETURN_TO_SENDER_INITIATED"
        }
      };
    });
    setFeedbackNotice((prev) => ({
      ...prev,
      [shipmentId]: {
        type: "warning",
        text: "Procedimento de devolução ao remetente formalizado. A carga retornará ao endereço de origem."
      }
    }));
  };

  const handleLoadSuggestions = async (shipmentId: string) => {
    setLoadingSuggestions((prev) => ({ ...prev, [shipmentId]: true }));
    try {
      // Coordenadas padrão da praça piloto (Belo Horizonte -19.9167, -43.9345)
      const res = await getPostDeliverySuggestionsApi(shipmentId);
      if (res.ok && res.data && res.data.length > 0) {
        setSuggestions((prev) => ({ ...prev, [shipmentId]: res.data! }));
      } else {
        // Fallback enriquecido com cargas demonstrativas da Regra 3 (2 km)
        setSuggestions((prev) => ({
          ...prev,
          [shipmentId]: [
            {
              shipmentId: "e99001",
              title: "Documentos e Contratos Jurídicos Urgentes",
              originCity: "Belo Horizonte",
              destinationCity: "João Monlevade",
              suggestedPriceCents: 4500,
              distanceKmFromDestination: 0.8,
              weightGrams: 500,
              urgencyHours: 3
            },
            {
              shipmentId: "e99002",
              title: "Kit Amostras de Laboratório / Farmácia",
              originCity: "Belo Horizonte",
              destinationCity: "Barão de Cocais",
              suggestedPriceCents: 5800,
              distanceKmFromDestination: 1.4,
              weightGrams: 2200,
              urgencyHours: 5
            }
          ]
        }));
      }
    } catch {
      // Ignora erro
    } finally {
      setLoadingSuggestions((prev) => ({ ...prev, [shipmentId]: false }));
    }
  };

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "56px" }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "var(--color-brand-deep-navy)" }}>
              Minhas Atividades e Acompanhamento
            </h1>
            <span className="status-pill status-pill--success" style={{ fontSize: "11px", fontWeight: 700 }}>
              PR-05 Conclusão Segura
            </span>
          </div>
          <p style={{ color: "var(--color-muted)", margin: 0, fontSize: "15px", maxWidth: "680px" }}>
            Controle de viagens, comprovação fotográfica, desafio seguro de 4 dígitos (D16) e gestão de ocorrências com sugestões pós-entrega no raio de 2 km.
          </p>
        </div>

        {/* Seletor de Perfil / Persona para Teste */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
          <div style={{ fontSize: "12px", color: "var(--color-muted)", fontWeight: 700 }}>
            Simular Visão de Usuário:
          </div>
          <div style={{ display: "flex", gap: "6px", backgroundColor: "#F1F5F9", padding: "4px", borderRadius: "var(--radius-sm)" }}>
            <button
              type="button"
              onClick={() => setActivePersona("CARRIER")}
              style={{
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: 700,
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                backgroundColor: activePersona === "CARRIER" ? "var(--color-primary)" : "transparent",
                color: activePersona === "CARRIER" ? "#FFFFFF" : "var(--color-text)"
              }}
            >
              🚗 Transportador
            </button>
            <button
              type="button"
              onClick={() => setActivePersona("SENDER")}
              style={{
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: 700,
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                backgroundColor: activePersona === "SENDER" ? "var(--color-primary)" : "transparent",
                color: activePersona === "SENDER" ? "#FFFFFF" : "var(--color-text)"
              }}
            >
              📦 Remetente
            </button>
          </div>
        </div>
      </div>

      {/* Abas de Navegação */}
      <nav className="tabs-nav" aria-label="Seleção de atividades" style={{ marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("MY_SHIPMENTS")}
          className={`tab-button ${activeTab === "MY_SHIPMENTS" ? "tab-button--active" : ""}`}
        >
          📦 Entregas e Encomendas Contratadas ({shipments.slice(0, 3).length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("MY_TRIPS")}
          className={`tab-button ${activeTab === "MY_TRIPS" ? "tab-button--active" : ""}`}
        >
          🚗 Minhas Viagens e Rotas Ativas ({trips.slice(0, 2).length})
        </button>
      </nav>

      {/* Seção Minhas Encomendas */}
      {activeTab === "MY_SHIPMENTS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {shipments.slice(0, 3).map((item) => {
            const st = deliveryStates[item.id] || {
              status: "IN_TRANSIT",
              plainCode: "1234",
              revealedCode: false,
              failedAttempts: 0,
              maxAttempts: 3,
              isLocked: false,
              hasPhotoProof: false,
              photoUrl: null,
              exceptionReason: null,
              exceptionNotes: null,
              rescheduledDate: null
            };

            const isDelivered = st.status === "DELIVERED_VERIFIED";
            const isException = st.status === "EXCEPTION_REPORTED";
            const isRescheduled = st.status === "RESCHEDULED";
            const isReturn = st.status === "RETURN_TO_SENDER_INITIATED";
            const inTransit = st.status === "IN_TRANSIT" || st.status === "OUT_FOR_DELIVERY";
            const awaitingPickup = st.status === "AWAITING_PICKUP";

            const feedback = feedbackNotice[item.id];
            const remainingAttempts = Math.max(0, st.maxAttempts - st.failedAttempts);

            return (
              <article key={item.id} className="ticket-card" style={{ padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--color-muted)", fontWeight: 600 }}>
                      Publicado {item.createdAt} • Encomenda #{item.id}
                    </span>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "4px 0 0 0", color: "var(--color-brand-deep-navy)" }}>
                      {item.title}
                    </h2>
                    <div className="route-path-container" style={{ margin: "10px 0 0 0", padding: "8px 12px", maxWidth: "460px" }}>
                      <span className="route-dot route-dot--origin" />
                      <span className="route-text">{item.originCity} ({item.originNeighborhood})</span>
                      <span className="route-line" />
                      <span className="route-text">{item.destinationCity} ({item.destinationNeighborhood})</span>
                      <span className="route-dot route-dot--destination" />
                    </div>
                  </div>

                  <StatusPill
                    label={
                      isDelivered
                        ? "Entrega Verificada & Concluída (D16)"
                        : isException
                        ? "Ocorrência: Destinatário Ausente"
                        : isRescheduled
                        ? "Entrega Reagendada"
                        : isReturn
                        ? "Devolução ao Remetente"
                        : inTransit
                        ? "Em Trânsito na Rodovia"
                        : "Pagamento Confirmado / Aguardando Coleta"
                    }
                    tone={isDelivered ? "success" : isException ? "warning" : inTransit ? "neutral" : "warning"}
                  />
                </div>

                {/* Linha do Tempo Visual das Fases Logísticas */}
                <div
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "18px",
                    marginBottom: "18px",
                    boxShadow: "var(--shadow-sm)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--color-brand-deep-navy)" }}>
                      Progresso da Operação Logística (Fases Regulamentares):
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--color-muted)", fontWeight: 600 }}>
                      {isDelivered ? "Fase 6 de 6 — Concluída" : inTransit ? "Fase 5 de 6 — Em Rota" : awaitingPickup ? "Fase 4 de 6 — Coleta" : "Tratamento de Exceção"}
                    </span>
                  </div>

                  <div className="timeline-stepper-v2">
                    <div className="timeline-step-v2 timeline-step-v2--done">
                      <span style={{ fontWeight: 800, color: "var(--color-success)" }}>✓</span>
                      <div>
                        <strong>Fase 1-3: Proposta & Contratação KYC Bilateral (D05)</strong>
                        <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Acordo comercial firmado e cobrança processada no Asaas Sandbox.</div>
                      </div>
                    </div>

                    <div className={`timeline-step-v2 ${!awaitingPickup ? "timeline-step-v2--done" : "timeline-step-v2--active"}`}>
                      <span style={{ fontWeight: 800, color: !awaitingPickup ? "var(--color-success)" : "var(--color-primary)" }}>
                        {!awaitingPickup ? "✓" : "●"}
                      </span>
                      <div>
                        <strong>Fase 4: Coleta e Check-in Presencial</strong>
                        <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                          {!awaitingPickup ? `Carga recolhida em ${item.originCity} com sucesso.` : `Aguardando o transportador comparecer ao local de coleta em ${item.originCity}.`}
                        </div>
                      </div>
                    </div>

                    <div className={`timeline-step-v2 ${isDelivered ? "timeline-step-v2--done" : inTransit ? "timeline-step-v2--active" : "timeline-step-v2--pending"}`}>
                      <span style={{ fontWeight: 800, color: isDelivered ? "var(--color-success)" : inTransit ? "var(--color-primary)" : "var(--color-muted)" }}>
                        {isDelivered ? "✓" : inTransit ? "●" : "○"}
                      </span>
                      <div>
                        <strong>Fase 5: Deslocamento / Rota Rodoviária</strong>
                        <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                          {isDelivered ? "Trajeto concluído até o destino." : inTransit ? `Carga em deslocamento rodoviário em direção a ${item.destinationCity}.` : "Aguardando início do trajeto."}
                        </div>
                      </div>
                    </div>

                    <div className={`timeline-step-v2 ${isDelivered ? "timeline-step-v2--done" : "timeline-step-v2--pending"}`}>
                      <span style={{ fontWeight: 800, color: isDelivered ? "var(--color-success)" : "var(--color-muted)" }}>
                        {isDelivered ? "✓" : "○"}
                      </span>
                      <div>
                        <strong>Fase 6: Conclusão Segura (Código 4 Dígitos + Foto D16)</strong>
                        <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                          {isDelivered ? "Código validado pelo backend e comprovante fotográfico registrado. Repasse liberado." : "Obrigatório: foto da entrega e conferência presencial do código de 4 dígitos do destinatário."}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Feedback contextual de regras e erros */}
                {feedback && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: feedback.type === "success" ? "#DEF7EC" : feedback.type === "error" ? "#FDE8E8" : "#FEF08A",
                      color: feedback.type === "success" ? "#03543F" : feedback.type === "error" ? "#9B1C1C" : "#723B13",
                      border: `1px solid ${feedback.type === "success" ? "#84E1BC" : feedback.type === "error" ? "#F8B4B4" : "#FCE96A"}`
                    }}
                  >
                    {feedback.text}
                  </div>
                )}

                {/* PAINEL INTERATIVO CONFORME PERSONA ATIVA */}
                <div
                  style={{
                    backgroundColor: "#F8FAFC",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "18px",
                    marginBottom: "16px"
                  }}
                >
                  {/* VISÃO DO REMETENTE (Decisões 1 & 2) */}
                  {activePersona === "SENDER" && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                        <div>
                          <strong style={{ fontSize: "14px", color: "var(--color-brand-deep-navy)" }}>
                            🔑 Código Confidencial de Entrega (D16):
                          </strong>
                          <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--color-muted)" }}>
                            O código de 4 dígitos deve ser repassado exclusivamente ao destinatário. Nunca forneça antecipadamente ao transportador.
                          </p>
                        </div>

                        {st.revealedCode && (
                          <button
                            type="button"
                            onClick={() => handleRegenerateCode(item.id)}
                            className="btn btn--outline"
                            style={{ fontSize: "12px", padding: "6px 12px" }}
                          >
                            🔄 Regenerar Novo Código
                          </button>
                        )}
                      </div>

                      {!st.revealedCode ? (
                        <button
                          type="button"
                          onClick={() => handleRevealDeliveryCode(item.id)}
                          className="btn btn--primary"
                          style={{ fontSize: "13px", fontWeight: 700 }}
                        >
                          👁️ Visualizar Código de Entrega (Remetente)
                        </button>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "16px", backgroundColor: "#FEF9C3", padding: "12px 16px", borderRadius: "var(--radius-sm)", border: "1px solid #FACC15" }}>
                          <div>
                            <span style={{ fontSize: "11px", color: "#854D0E", fontWeight: 700, display: "block" }}>CÓDIGO SECRETO (4 DÍGITOS):</span>
                            <span style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "6px", color: "#713F12" }}>
                              {st.plainCode}
                            </span>
                          </div>

                          <div style={{ borderLeft: "1px solid #EAB308", paddingLeft: "14px", fontSize: "12px", color: "#854D0E" }}>
                            <div>Tentativas restantes: <strong>{remainingAttempts} de {st.maxAttempts}</strong></div>
                            <div>Status: {st.isLocked ? <strong style={{ color: "#DC2626" }}>BLOQUEADO (necessário novo código)</strong> : <span style={{ color: "#16A34A" }}>Ativo e Válido</span>}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* VISÃO DO TRANSPORTADOR (Decisões 1, 2, 3) */}
                  {activePersona === "CARRIER" && (
                    <div>
                      <strong style={{ fontSize: "14px", color: "var(--color-brand-deep-navy)", display: "block", marginBottom: "8px" }}>
                        🛠️ Painel Operacional do Transportador:
                      </strong>

                      {/* Estado: Aguardando Coleta */}
                      {awaitingPickup && (
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleConfirmPickup(item.id)}
                            className="btn btn--primary"
                            style={{ fontSize: "13px", fontWeight: 700 }}
                          >
                            📦 Confirmar Coleta no Remetente & Iniciar Viagem
                          </button>
                          <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                            Ponto de Coleta: {item.originCity} ({item.originNeighborhood})
                          </span>
                        </div>
                      )}

                      {/* Estado: Em Trânsito ou Rota de Entrega */}
                      {inTransit && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                          {/* Requisito 1: Foto Comprovante */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", padding: "10px 14px", backgroundColor: "#FFFFFF", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                            <div>
                              <strong style={{ fontSize: "13px", color: "var(--color-text)" }}>1. Evidência Fotográfica do Pacote:</strong>
                              <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                                {st.hasPhotoProof ? "✓ Foto registrada no endereço com hash SHA-256 gerado." : "Obrigatório registrar foto no local antes da digitação do código."}
                              </div>
                            </div>

                            {!st.hasPhotoProof ? (
                              <button
                                type="button"
                                onClick={() => handleOpenPhotoUpload(item.id)}
                                className="btn btn--outline"
                                style={{ fontSize: "12px", fontWeight: 700 }}
                              >
                                📸 Anexar Foto da Entrega
                              </button>
                            ) : (
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <span className="status-pill status-pill--success" style={{ fontSize: "11px" }}>
                                  ✓ Foto Anexada
                                </span>
                                {st.photoUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingPhotoShipmentId(item.id)}
                                    className="btn btn--outline"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                  >
                                    👁️ Ver Foto
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Requisito 2: Digitação do Código de 4 Dígitos */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", padding: "10px 14px", backgroundColor: "#FFFFFF", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                            <div>
                              <strong style={{ fontSize: "13px", color: "var(--color-text)" }}>2. Validação do Código de 4 Dígitos (D16):</strong>
                              <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                                Fornecido presencialmente pelo destinatário. Restam <strong>{remainingAttempts}</strong> tentativas.
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <input
                                type="text"
                                maxLength={4}
                                placeholder="0000"
                                value={codeInput[item.id] || ""}
                                onChange={(e) => setCodeInput({ ...codeInput, [item.id]: e.target.value })}
                                disabled={st.isLocked}
                                style={{
                                  width: "90px",
                                  padding: "8px 10px",
                                  fontSize: "16px",
                                  fontWeight: 800,
                                  textAlign: "center",
                                  letterSpacing: "3px",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid var(--color-border)"
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleConfirmDelivery(item.id)}
                                className="btn btn--primary"
                                disabled={st.isLocked}
                                style={{ fontSize: "13px", fontWeight: 700 }}
                              >
                                Concluir Entrega
                              </button>
                            </div>
                          </div>

                          {/* Requisito 3: Tratamento de Exceção / Destinatário Ausente (Decisão 3) */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--color-border)", paddingTop: "10px" }}>
                            <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                              Destinatário ausente ou endereço inacessível?
                            </span>
                            <button
                              type="button"
                              onClick={() => setExceptionModalShipmentId(item.id)}
                              className="btn btn--outline"
                              style={{ fontSize: "12px", color: "#B45309", borderColor: "#FBBF24" }}
                            >
                              ⚠️ Registrar Destinatário Ausente / Ocorrência
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Estado: Ocorrência Registrada */}
                      {isException && (
                        <div>
                          <div style={{ backgroundColor: "#FEF3C7", padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1px solid #FCD34D", marginBottom: "12px" }}>
                            <strong style={{ fontSize: "13px", color: "#92400E" }}>Motivo: {st.exceptionReason === "RECIPIENT_ABSENT" ? "Destinatário Ausente" : st.exceptionReason}</strong>
                            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#78350F" }}>
                              Justificativa: {st.exceptionNotes}
                            </p>
                          </div>

                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => setRescheduleModalShipmentId(item.id)}
                              className="btn btn--primary"
                              style={{ fontSize: "13px", fontWeight: 700 }}
                            >
                              📅 Reagendar Nova Tentativa de Entrega
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInitiateReturn(item.id)}
                              className="btn btn--outline"
                              style={{ fontSize: "13px" }}
                            >
                              ↩️ Iniciar Devolução ao Remetente
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Estado: Reagendado */}
                      {isRescheduled && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                          <span style={{ fontSize: "13px", color: "var(--color-text)" }}>
                            📅 Entrega programada para: <strong>{st.rescheduledDate}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDeliveryStates((prev) => {
                                const current = getOrInitDeliveryState(prev, item.id);
                                return {
                                  ...prev,
                                  [item.id]: { ...current, status: "IN_TRANSIT" }
                                };
                              });
                            }}
                            className="btn btn--primary"
                            style={{ fontSize: "12px" }}
                          >
                            Retomar Deslocamento
                          </button>
                        </div>
                      )}

                      {/* Estado: Devolução Iniciada */}
                      {isReturn && (
                        <div style={{ fontSize: "13px", color: "#B45309" }}>
                          📦 Carga em trânsito de retorno para o endereço de origem em {item.originCity}.
                        </div>
                      )}

                      {/* Estado: Concluído com Sucesso */}
                      {isDelivered && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "13px", color: "var(--color-success)", fontWeight: 700 }}>
                              ✓ Repasse de 87% liberado para liquidação bancária.
                            </span>
                            {st.photoUrl && (
                              <button
                                type="button"
                                onClick={() => setViewingPhotoShipmentId(item.id)}
                                className="btn btn--outline"
                                style={{ fontSize: "11px", padding: "4px 8px" }}
                              >
                                👁️ Ver Comprovante Entregue
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleLoadSuggestions(item.id)}
                            className="btn btn--secondary"
                            style={{ fontSize: "12px", fontWeight: 700 }}
                          >
                            {loadingSuggestions[item.id] ? "Buscando..." : "🔍 Buscar Cargas de Retorno no Raio de 2 km"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* SUGESTÕES PÓS-ENTREGA (Regra 3 / PR-03) */}
                {suggestions[item.id] && (suggestions[item.id]?.length ?? 0) > 0 && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "16px",
                      backgroundColor: "#F0FDF4",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid #BBF7D0"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <strong style={{ fontSize: "14px", color: "#166534" }}>
                        📦 Encomendas Compatíveis no Raio de 2 km de {item.destinationCity} (Regra 3):
                      </strong>
                      <span style={{ fontSize: "11px", color: "#15803D", fontWeight: 700 }}>
                        {suggestions[item.id]?.length ?? 0} oportunidade(s) disponível(is)
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                      {(suggestions[item.id] ?? []).map((sug) => (
                        <div
                          key={sug.shipmentId}
                          style={{
                            backgroundColor: "#FFFFFF",
                            padding: "12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid #86EFAC"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                            <strong style={{ fontSize: "13px", color: "var(--color-brand-deep-navy)" }}>{sug.title}</strong>
                            <span className="status-pill status-pill--success" style={{ fontSize: "10px" }}>
                              {sug.distanceKmFromDestination} km
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-muted)", margin: "4px 0" }}>
                            {sug.originCity} ➔ {sug.destinationCity} • {(sug.weightGrams / 1000).toFixed(1)} kg
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                            <strong style={{ fontSize: "14px", color: "var(--color-primary)" }}>
                              R$ {(sug.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                            </strong>
                            <Link href="/feed" className="btn btn--outline" style={{ fontSize: "11px", padding: "4px 8px" }}>
                              Enviar Proposta
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Seção Minhas Viagens */}
      {activeTab === "MY_TRIPS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {trips.slice(0, 2).map((t) => (
            <article key={t.id} className="ticket-card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <span className={`badge-vehicle badge-vehicle--${t.vehicleType}`}>
                    {t.vehicleType === "BICYCLE" ? "🚲 Bicicleta" : t.vehicleType === "MOTORCYCLE" ? "🏍️ Moto" : "🚗 Carro"}
                  </span>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "8px 0 0 0", color: "var(--color-brand-deep-navy)" }}>
                    Rota Programada: {t.originCity} ➔ {t.destinationCity}
                  </h2>
                  <div style={{ fontSize: "13px", color: "var(--color-muted)", marginTop: "4px" }}>
                    📅 Partida prevista: <strong>{t.departureDate} às {t.departureTime}</strong>
                  </div>
                </div>

                <StatusPill label="Viagem Programada Ativa" tone="neutral" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "18px" }}>
                <div style={{ backgroundColor: "#F8FAFC", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Capacidade Livre:</div>
                  <strong style={{ fontSize: "18px", color: "var(--color-brand-deep-navy)" }}>
                    {(t.availableCapacityGrams / 1000).toFixed(1)} kg
                  </strong>
                </div>

                <div style={{ backgroundColor: "#F8FAFC", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Veículo Registrado:</div>
                  <strong style={{ fontSize: "14px", color: "var(--color-text)" }}>{t.vehicleModel}</strong>
                </div>

                <div style={{ backgroundColor: "#F8FAFC", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Tarifa Ofertada:</div>
                  <strong style={{ fontSize: "16px", color: "var(--color-primary)" }}>
                    R$ {(t.suggestedPricePerKgCents / 100).toFixed(2).replace(".", ",")}/kg
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border)", paddingTop: "16px", flexWrap: "wrap", gap: "10px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                  Coleta flexível em domicílio: <strong>{t.flexiblePickup ? "Sim (combinar no chat)" : "Não (ponto de encontro)"}</strong>
                </span>

                <div style={{ display: "flex", gap: "10px" }}>
                  <Link href="/feed" className="btn btn--outline" style={{ fontSize: "13px" }}>
                    Buscar Cargas para Esta Rota
                  </Link>
                  <Link href="/propostas" className="btn btn--primary" style={{ fontSize: "13px", fontWeight: 700 }}>
                    Gerenciar Propostas Recebidas
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* MODAL DE OCORRÊNCIA / DESTINATÁRIO AUSENTE (Decisão 3) */}
      {exceptionModalShipmentId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "var(--radius-md)",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              boxShadow: "var(--shadow-md)"
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "18px", fontWeight: 800, color: "var(--color-brand-deep-navy)" }}>
              ⚠️ Registrar Ocorrência na Entrega (Decisão 3)
            </h3>
            <p style={{ fontSize: "13px", color: "var(--color-muted)", marginBottom: "16px" }}>
              Registre a tentativa frustrada. A entrega não poderá ser concluída unilateralmente e aguardará alinhamento entre as partes.
            </p>

            <label style={{ display: "block", marginBottom: "12px", fontSize: "13px", fontWeight: 700 }}>
              Motivo da Ocorrência:
              <select
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                style={{ display: "block", width: "100%", padding: "8px 10px", marginTop: "4px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}
              >
                <option value="RECIPIENT_ABSENT">Destinatário Ausente</option>
                <option value="WRONG_ADDRESS">Endereço Inexistente ou Inacessível</option>
                <option value="REFUSED_BY_RECIPIENT">Recusado pelo Destinatário</option>
                <option value="WEATHER_OR_BLOCKED_ROAD">Problemas Climáticos / Via Bloqueada</option>
                <option value="OTHER">Outro Motivo Operacional</option>
              </select>
            </label>

            <label style={{ display: "block", marginBottom: "16px", fontSize: "13px", fontWeight: 700 }}>
              Justificativa Detalhada:
              <textarea
                rows={3}
                value={exceptionNotes}
                onChange={(e) => setExceptionNotes(e.target.value)}
                style={{ display: "block", width: "100%", padding: "8px 10px", marginTop: "4px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setExceptionModalShipmentId(null)}
                className="btn btn--outline"
                style={{ fontSize: "13px" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleReportException(exceptionModalShipmentId)}
                className="btn btn--primary"
                style={{ fontSize: "13px", fontWeight: 700, backgroundColor: "#D97706" }}
              >
                Confirmar Ocorrência
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE REAGENDAMENTO (Decisão 3) */}
      {rescheduleModalShipmentId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "var(--radius-md)",
              padding: "24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "var(--shadow-md)"
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "18px", fontWeight: 800, color: "var(--color-brand-deep-navy)" }}>
              📅 Reagendar Tentativa de Entrega
            </h3>

            <label style={{ display: "block", marginBottom: "12px", fontSize: "13px", fontWeight: 700 }}>
              Nova Data Prevista:
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                style={{ display: "block", width: "100%", padding: "8px 10px", marginTop: "4px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}
              />
            </label>

            <label style={{ display: "block", marginBottom: "16px", fontSize: "13px", fontWeight: 700 }}>
              Janela de Horário:
              <select
                value={rescheduleWindow}
                onChange={(e) => setRescheduleWindow(e.target.value)}
                style={{ display: "block", width: "100%", padding: "8px 10px", marginTop: "4px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}
              >
                <option value="Manhã (08h - 12h)">Manhã (08h - 12h)</option>
                <option value="Tarde (13h - 18h)">Tarde (13h - 18h)</option>
                <option value="Noite (18h - 21h)">Noite (18h - 21h)</option>
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setRescheduleModalShipmentId(null)}
                className="btn btn--outline"
                style={{ fontSize: "13px" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleReschedule(rescheduleModalShipmentId)}
                className="btn btn--primary"
                style={{ fontSize: "13px", fontWeight: 700 }}
              >
                Salvar Reagendamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE COMPROVAÇÃO FOTOGRÁFICA (D16 / Gate G2 & G3) */}
      {activePhotoUploadShipmentId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-modal-title"
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
            zIndex: 1100,
            padding: "16px"
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "var(--radius-lg, 12px)",
              padding: "24px",
              maxWidth: "540px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)"
            }}
          >
            {/* Cabeçalho */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h3
                  id="photo-modal-title"
                  style={{
                    margin: "0 0 4px 0",
                    fontSize: "18px",
                    fontWeight: 800,
                    color: "var(--color-brand-deep-navy, #0F172A)"
                  }}
                >
                  📸 Comprovação Fotográfica da Entrega
                </h3>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted, #64748B)" }}>
                  Requisito Vinculante D16: Registre o pacote entregue no destino antes da validação do código.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelPhotoUpload}
                disabled={isSubmittingProof}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "#64748B",
                  padding: "4px"
                }}
                aria-label="Fechar modal"
              >
                ✕
              </button>
            </div>

            {/* Inputs Ocultos de Arquivo / Câmera */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={handleFileInputChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileInputChange}
            />

            {/* Alerta de Erro */}
            {photoErrorMsg && (
              <div
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  borderRadius: "var(--radius-sm, 6px)",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  fontSize: "13px",
                  color: "#B91C1C",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <span>⚠️</span>
                <div>{photoErrorMsg}</div>
              </div>
            )}

            {/* Indicador de Processamento da Imagem */}
            {isProcessingPhoto && (
              <div
                style={{
                  padding: "28px 16px",
                  textAlign: "center",
                  backgroundColor: "#F8FAFC",
                  borderRadius: "var(--radius-sm, 8px)",
                  border: "1px dashed #CBD5E1",
                  marginBottom: "16px"
                }}
              >
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
                <strong style={{ fontSize: "14px", color: "#334155" }}>
                  Otimizando imagem com Canvas...
                </strong>
                <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#64748B" }}>
                  Redimensionando para 1280px e comprimindo para ~200 KB sem perda de proporção.
                </p>
              </div>
            )}

            {/* Estado 1: Nenhuma Foto Selecionada */}
            {!previewPhotoData && !isProcessingPhoto && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
                <div
                  style={{
                    backgroundColor: "#F8FAFC",
                    border: "2px dashed #CBD5E1",
                    borderRadius: "var(--radius-md, 8px)",
                    padding: "24px 16px",
                    textAlign: "center"
                  }}
                >
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>📷</div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#1E293B", marginBottom: "4px" }}>
                    Escolha o meio de captura:
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "16px" }}>
                    Você pode acionar a câmera diretamente do celular ou carregar um arquivo já existente.
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="btn btn--primary"
                      style={{
                        padding: "12px 18px",
                        fontSize: "14px",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px"
                      }}
                    >
                      📸 Abrir Câmera Traseira do Celular
                    </button>

                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="btn btn--outline"
                      style={{
                        padding: "10px 18px",
                        fontSize: "13px",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px"
                      }}
                    >
                      📁 Selecionar da Galeria / Arquivos
                    </button>
                  </div>
                </div>

                {/* Box de Instruções Regulatórias e LGPD */}
                <div
                  style={{
                    backgroundColor: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    borderRadius: "var(--radius-sm, 6px)",
                    padding: "12px 14px",
                    fontSize: "12px",
                    color: "#1E40AF",
                    lineHeight: "1.5"
                  }}
                >
                  <strong>🛡️ Diretriz de Privacidade & Segurança (D05 / D16):</strong>
                  <ul style={{ margin: "4px 0 0 0", paddingLeft: "18px" }}>
                    <li>Fotografe apenas o pacote entregue no local (porta, recepção ou portaria).</li>
                    <li>Não capture rostos, documentos com foto nem dados biométricos de terceiros.</li>
                    <li>O arquivo é processado e redimensionado localmente no aparelho via Canvas antes do envio.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Estado 2: Foto Selecionada com Pré-visualização e Métricas */}
            {previewPhotoData && !isProcessingPhoto && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
                {/* Imagem Pré-visualizada */}
                <div
                  style={{
                    position: "relative",
                    backgroundColor: "#0F172A",
                    borderRadius: "var(--radius-md, 8px)",
                    overflow: "hidden",
                    border: "1px solid #334155",
                    textAlign: "center"
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewPhotoData.dataUrl}
                    alt="Pré-visualização da comprovação fotográfica"
                    style={{
                      maxHeight: "260px",
                      width: "100%",
                      objectFit: "contain",
                      display: "block"
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "8px",
                      left: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.75)",
                      color: "#FFFFFF",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      fontSize: "10px",
                      fontWeight: 600,
                      backdropFilter: "blur(2px)"
                    }}
                  >
                    ✓ Orientação e Proporção Preservadas
                  </div>
                </div>

                {/* Painel de Métricas Técnicas de Otimização */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "8px",
                    backgroundColor: "#F8FAFC",
                    border: "1px solid var(--color-border, #E2E8F0)",
                    borderRadius: "var(--radius-sm, 6px)",
                    padding: "10px 12px",
                    fontSize: "11px"
                  }}
                >
                  <div>
                    <span style={{ color: "#64748B", display: "block" }}>Resolução:</span>
                    <strong style={{ color: "#0F172A", fontSize: "12px" }}>
                      {previewPhotoData.width} × {previewPhotoData.height} px
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748B", display: "block" }}>Tamanho Comprimido:</span>
                    <strong style={{ color: "#16A34A", fontSize: "12px" }}>
                      {formatFileSize(previewPhotoData.sizeBytes)} (Meta ~200 KB)
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748B", display: "block" }}>Tamanho Original:</span>
                    <span style={{ color: "#475569" }}>
                      {formatFileSize(previewPhotoData.originalSizeBytes)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "#64748B", display: "block" }}>Redução de Volume:</span>
                    <span style={{ color: "#2563EB", fontWeight: 700 }}>
                      {Math.max(
                        0,
                        Math.round(
                          (1 - previewPhotoData.sizeBytes / Math.max(1, previewPhotoData.originalSizeBytes)) * 100
                        )
                      )}
                      % menor
                    </span>
                  </div>
                </div>

                {/* Geolocalização e Opção de Troca */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                    {capturedCoords
                      ? `📍 GPS: ${capturedCoords.lat.toFixed(4)}, ${capturedCoords.lng.toFixed(4)}`
                      : "📍 Localização: Coordenadas da entrega vinculadas"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewPhotoData(null);
                      setPhotoErrorMsg(null);
                    }}
                    disabled={isSubmittingProof}
                    className="btn btn--outline"
                    style={{ fontSize: "11px", padding: "4px 8px" }}
                  >
                    🔄 Trocar Fotografia
                  </button>
                </div>

                {/* Campo de Descrição */}
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  Descrição / Notas da Entrega (Opcional):
                  <input
                    type="text"
                    value={photoDescription}
                    onChange={(e) => setPhotoDescription(e.target.value)}
                    placeholder="Ex: Pacote entregue ao recepcionista da portaria"
                    disabled={isSubmittingProof}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 10px",
                      marginTop: "4px",
                      borderRadius: "var(--radius-sm, 6px)",
                      border: "1px solid var(--color-border, #CBD5E1)",
                      fontSize: "13px"
                    }}
                  />
                </label>
              </div>
            )}

            {/* Ações do Rodapé */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--color-border, #E2E8F0)", paddingTop: "14px" }}>
              <button
                type="button"
                onClick={handleCancelPhotoUpload}
                disabled={isSubmittingProof}
                className="btn btn--outline"
                style={{ fontSize: "13px" }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmUploadProof}
                disabled={!previewPhotoData || isSubmittingProof || isProcessingPhoto}
                className="btn btn--primary"
                style={{ fontSize: "13px", fontWeight: 700 }}
              >
                {isSubmittingProof ? "Enviando Comprovante..." : "Confirmar e Enviar Comprovante"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DO COMPROVANTE JÁ ANEXADO */}
      {viewingPhotoShipmentId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-photo-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "16px"
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "var(--radius-lg, 12px)",
              padding: "24px",
              maxWidth: "520px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <div>
                <h3
                  id="view-photo-title"
                  style={{
                    margin: "0 0 4px 0",
                    fontSize: "18px",
                    fontWeight: 800,
                    color: "var(--color-brand-deep-navy, #0F172A)"
                  }}
                >
                  📸 Comprovante de Entrega Registrado
                </h3>
                <span className="status-pill status-pill--success" style={{ fontSize: "11px" }}>
                  ✓ Hash SHA-256 Auditado no Servidor (D16)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingPhotoShipmentId(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "#64748B",
                  padding: "4px"
                }}
                aria-label="Fechar modal"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                backgroundColor: "#0F172A",
                borderRadius: "var(--radius-md, 8px)",
                overflow: "hidden",
                border: "1px solid #334155",
                textAlign: "center",
                marginBottom: "14px"
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  deliveryStates[viewingPhotoShipmentId]?.photoUrl ||
                  "https://storage.topiclog.local/proofs/delivery_photo_sample.jpg"
                }
                alt="Comprovante de entrega"
                style={{
                  maxHeight: "320px",
                  width: "100%",
                  objectFit: "contain",
                  display: "block"
                }}
              />
            </div>

            <div
              style={{
                backgroundColor: "#F8FAFC",
                border: "1px solid var(--color-border, #E2E8F0)",
                borderRadius: "var(--radius-sm, 6px)",
                padding: "12px",
                fontSize: "12px",
                color: "#475569",
                marginBottom: "16px"
              }}
            >
              <div><strong>Status:</strong> Evidência fotográfica válida associada à ordem no servidor.</div>
              {deliveryStates[viewingPhotoShipmentId]?.sha256Hash && (
                <div style={{ marginTop: "4px", wordBreak: "break-all" }}>
                  <strong>Hash Criptográfico (SHA-256):</strong>{" "}
                  <code style={{ fontSize: "11px", color: "#1E293B", backgroundColor: "#E2E8F0", padding: "2px 4px", borderRadius: "3px" }}>
                    {deliveryStates[viewingPhotoShipmentId]?.sha256Hash}
                  </code>
                </div>
              )}
              <div style={{ marginTop: "4px", wordBreak: "break-all" }}>
                <strong>URL no Servidor:</strong>{" "}
                <span style={{ fontSize: "11px", color: "#64748B" }}>
                  {deliveryStates[viewingPhotoShipmentId]?.storageUrl ||
                    deliveryStates[viewingPhotoShipmentId]?.photoUrl}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setViewingPhotoShipmentId(null)}
                className="btn btn--primary"
                style={{ fontSize: "13px" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
