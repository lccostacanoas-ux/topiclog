"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import {
  listShipmentsApi,
  updateShipmentApi,
  deleteShipmentApi
} from "../../lib/api-client";
import type { ShipmentSummaryDto } from "../../lib/types";
import StarRatingDisplay from "../../components/StarRatingDisplay";
import {
  getDemoShipments,
  removeDemoShipment,
  type DemoShipment
} from "../../lib/demo-marketplace-store";

interface UnifiedShipment {
  id: string;
  senderId: string;
  senderName: string;
  title: string;
  description?: string;
  category: string;
  weightGrams?: number | null;
  suggestedPriceCents: number;
  originCity: string;
  originNeighborhood: string;
  destinationCity: string;
  destinationNeighborhood: string;
  deliveryWindow: string;
  status: string;
  createdAt: string;
  isBackend: boolean;
}

function safeFormatDate(val?: string): string {
  if (!val) return new Date().toLocaleDateString("pt-BR");
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date().toLocaleDateString("pt-BR") : d.toLocaleDateString("pt-BR");
}

export default function MinhasEncomendasPage(): React.JSX.Element {
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [shipments, setShipments] = useState<UnifiedShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estado do Modal de Edição
  const [editingShipment, setEditingShipment] = useState<UnifiedShipment | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const unifiedList: UnifiedShipment[] = [];
    const seenIds = new Set<string>();

    // 1. Carrega do Backend API se autenticado
    if (token) {
      try {
        const res = await listShipmentsApi(undefined, token);
        if (res.ok && res.data) {
          const userShipments = res.data.filter(
            (s) => !user?.userId || s.senderId === user.userId || s.senderId === "00000000-0000-0000-0000-000000000001"
          );
          for (const s of userShipments) {
            seenIds.add(s.id);
            unifiedList.push({
              id: s.id,
              senderId: s.senderId,
              senderName: s.senderName,
              title: s.title || `Encomenda de ${s.originCity} para ${s.destinationCity}`,
              description: `Origem: ${s.originCity} (${s.originNeighborhood}) -> Destino: ${s.destinationCity} (${s.destinationNeighborhood}).`,
              category: s.category || "GERAL",
              weightGrams: s.weightGrams,
              suggestedPriceCents: s.suggestedPriceCents,
              originCity: s.originCity,
              originNeighborhood: s.originNeighborhood,
              destinationCity: s.destinationCity,
              destinationNeighborhood: s.destinationNeighborhood,
              deliveryWindow: s.deliveryWindow || "A combinar",
              status: s.status,
              createdAt: s.createdAtUtc,
              isBackend: !res.isFallback
            });
          }
        }
      } catch (err) {
        console.warn("Erro ao buscar encomendas da API:", err);
      }
    }

    // 2. Mescla com encomendas locais (demo / localStorage) eliminando duplicatas por ID
    const localDemos = getDemoShipments();
    for (const d of localDemos) {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        unifiedList.push({
          id: d.id,
          senderId: user?.userId || "local-user",
          senderName: d.senderName || user?.displayName || "Você",
          title: d.title,
          description: d.description,
          category: d.category,
          weightGrams: d.weightGrams,
          suggestedPriceCents: d.suggestedPriceCents,
          originCity: d.originCity,
          originNeighborhood: d.originNeighborhood,
          destinationCity: d.destinationCity,
          destinationNeighborhood: d.destinationNeighborhood,
          deliveryWindow: d.deadlineDate || "A combinar",
          status: d.status,
          createdAt: d.createdAt,
          isBackend: false
        });
      }
    }

    setShipments(unifiedList);
    setLoading(false);
  }, [token, user]);

  useEffect(() => {
    void loadShipments();
  }, [loadShipments]);

  // Abertura do Modal de Edição
  const handleOpenEdit = (shipment: UnifiedShipment) => {
    setEditingShipment(shipment);
    setEditTitle(shipment.title);
    setEditDescription(shipment.description || "");
    setEditPrice((shipment.suggestedPriceCents / 100).toFixed(2).replace(".", ","));
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Salvar Edição
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShipment) return;

    setIsSaving(true);
    setErrorMessage(null);

    const priceNum = parseFloat(editPrice.replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
    const priceCents = Math.round(priceNum * 100);

    try {
      if (editingShipment.isBackend && token) {
        const res = await updateShipmentApi(
          editingShipment.id,
          {
            title: editTitle.trim(),
            description: editDescription.trim(),
            suggestedPriceCents: priceCents > 0 ? priceCents : undefined
          },
          token
        );

        if (!res.ok && res.status !== 404 && res.status !== 0 && res.status !== 405) {
          setErrorMessage(res.problem?.detail || "Não foi possível atualizar a encomenda no servidor.");
          setIsSaving(false);
          return;
        }
      } else {
        // Atualiza no localStorage
        const stored = getDemoShipments();
        const updated = stored.map((s) => {
          if (s.id === editingShipment.id) {
            return {
              ...s,
              title: editTitle.trim(),
              description: editDescription.trim(),
              suggestedPriceCents: priceCents > 0 ? priceCents : s.suggestedPriceCents
            };
          }
          return s;
        });
        localStorage.setItem("topiclog_demo_shipments_v1", JSON.stringify(updated));
      }

      setSuccessMessage("✓ Encomenda atualizada com sucesso!");
      setEditingShipment(null);
      await loadShipments();
    } catch {
      setErrorMessage("Erro ao salvar alterações da encomenda.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteShipment = async (s: UnifiedShipment) => {
    if (!window.confirm("Deseja realmente excluir/cancelar esta encomenda publicada?")) {
      return;
    }
    try {
      if (s.isBackend && token) {
        await deleteShipmentApi(s.id, token);
      }
      removeDemoShipment(s.id);
      setSuccessMessage("✓ Encomenda excluída com sucesso!");
      await loadShipments();
    } catch {
      removeDemoShipment(s.id);
      await loadShipments();
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === "PUBLISHED" || s === "OPEN") {
      return (
        <span
          style={{
            backgroundColor: "#ECFDF5",
            color: "#047857",
            padding: "4px 10px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: "5px"
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#10B981" }} />
          Publicada • Aberta para Propostas
        </span>
      );
    }
    if (s === "NEGOTIATING" || s === "IN_NEGOTIATION" || s === "COUNTERED") {
      return (
        <span
          style={{
            backgroundColor: "#EFF6FF",
            color: "#1D4ED8",
            padding: "4px 10px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: "5px"
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#3B82F6" }} />
          Em Negociação de Frete
        </span>
      );
    }
    if (s === "CONTRACTED") {
      return (
        <span
          style={{
            backgroundColor: "#FEF3C7",
            color: "#B45309",
            padding: "4px 10px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: 700
          }}
        >
          Contrato Fechado
        </span>
      );
    }
    if (s === "IN_TRANSIT") {
      return (
        <span
          style={{
            backgroundColor: "#F3E8FF",
            color: "#7E22CE",
            padding: "4px 10px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: 700
          }}
        >
          🚚 Em Transporte
        </span>
      );
    }
    if (s === "DELIVERED") {
      return (
        <span
          style={{
            backgroundColor: "#F1F5F9",
            color: "#475569",
            padding: "4px 10px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: 700
          }}
        >
          ✓ Entregue
        </span>
      );
    }
    return (
      <span
        style={{
          backgroundColor: "#F1F5F9",
          color: "#475569",
          padding: "4px 10px",
          borderRadius: "9999px",
          fontSize: "12px",
          fontWeight: 700
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <main
      id="main-content"
      style={{
        backgroundColor: "#F8FAFC",
        minHeight: "calc(100vh - 56px)",
        paddingTop: "24px",
        paddingBottom: "80px"
      }}
    >
      <div className="container" style={{ maxWidth: "800px", padding: "0 16px" }}>
        {/* Cabeçalho da Página */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "20px"
          }}
        >
          <div>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#2563EB", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              PAINEL DO REMETENTE
            </span>
            <h1
              style={{
                fontSize: "26px",
                fontWeight: 800,
                color: "#0F172A",
                margin: "2px 0 0 0",
                letterSpacing: "-0.5px"
              }}
            >
              Minhas Encomendas
            </h1>
            <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#64748B" }}>
              Gerencie suas postagens, acompanhe o status e edite valores antes do aceite de propostas.
            </p>
          </div>

          <Link
            href="/encomendas/publicar"
            className="btn btn--primary"
            id="btn-nova-encomenda"
            style={{
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span>+ Publicar Nova Encomenda</span>
          </Link>
        </div>

        {/* Mensagens de Sucesso ou Alerta */}
        {successMessage && (
          <div
            style={{
              backgroundColor: "#ECFDF5",
              border: "1px solid #A7F3D0",
              color: "#065F46",
              padding: "12px 16px",
              borderRadius: "10px",
              marginBottom: "16px",
              fontSize: "14px",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              style={{ background: "none", border: "none", color: "#065F46", cursor: "pointer", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#991B1B",
              padding: "12px 16px",
              borderRadius: "10px",
              marginBottom: "16px",
              fontSize: "14px",
              fontWeight: 600
            }}
          >
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Conteúdo / Listagem */}
        {loading ? (
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              padding: "48px 24px",
              textAlign: "center",
              color: "#64748B",
              border: "1px solid #E2E8F0"
            }}
          >
            <span style={{ fontSize: "28px", display: "block", marginBottom: "8px" }}>📦</span>
            Carregando suas encomendas publicadas...
          </div>
        ) : shipments.length === 0 ? (
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              padding: "48px 24px",
              textAlign: "center",
              border: "1px solid #E2E8F0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
            }}
          >
            <div style={{ fontSize: "42px", marginBottom: "12px" }}>📦</div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: "0 0 8px 0" }}>
              Nenhuma encomenda cadastrada no momento
            </h3>
            <p style={{ fontSize: "14px", color: "#64748B", maxWidth: "420px", margin: "0 auto 20px auto" }}>
              Você ainda não publicou nenhuma carga para transporte. Publique agora e receba propostas de motoristas na sua rota!
            </p>
            <Link
              href="/encomendas/publicar"
              className="btn btn--primary"
              style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700 }}
            >
              Publicar Minha Primeira Encomenda
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {shipments.map((s) => {
              const canEdit = s.status === "PUBLISHED" || s.status === "OPEN" || s.status === "NEGOTIATING" || s.status === "IN_NEGOTIATION";
              return (
                <div
                  key={s.id}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "16px",
                    border: "1px solid #E2E8F0",
                    padding: "20px 22px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                    transition: "box-shadow 0.15s ease"
                  }}
                >
                  {/* Topo do Card: Título + Badge de Status */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginBottom: "12px"
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "#0F172A",
                          margin: "0 0 4px 0"
                        }}
                      >
                        {s.title}
                      </h2>
                      <span style={{ fontSize: "12px", color: "#94A3B8", display: "block" }}>
                        ID: #{s.id.slice(0, 8)} • Postada em: {safeFormatDate(s.createdAt)}
                      </span>
                      <div style={{ marginTop: "4px" }}>
                        <StarRatingDisplay size="sm" ratingAvg={null} ratingCount={0} label="Remetente:" />
                      </div>
                    </div>

                    <div>{getStatusBadge(s.status)}</div>
                  </div>

                  {/* Rota */}
                  <div
                    style={{
                      backgroundColor: "#F8FAFC",
                      border: "1px solid #EDF2F7",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      marginBottom: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "13px",
                      color: "#334155"
                    }}
                  >
                    <span style={{ color: "#10B981", fontWeight: 700 }}>● {s.originCity} ({s.originNeighborhood})</span>
                    <span style={{ color: "#94A3B8" }}>➔</span>
                    <span style={{ color: "#EF4444", fontWeight: 700 }}>● {s.destinationCity} ({s.destinationNeighborhood})</span>
                  </div>

                  {/* Detalhes de Peso e Valor */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px",
                      marginBottom: "16px",
                      paddingBottom: "14px",
                      borderBottom: "1px solid #F1F5F9"
                    }}
                  >
                    <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#64748B", flexWrap: "wrap" }}>
                      {s.weightGrams != null && s.weightGrams > 0 ? (
                        <span>⚖️ Peso: <strong style={{ color: "#1E293B" }}>{(s.weightGrams / 1000).toFixed(1)} kg</strong></span>
                      ) : (
                        <span>⚖️ <span style={{ color: "#94A3B8", fontStyle: "italic" }}>Peso não informado</span></span>
                      )}
                      <span>📦 Categoria: <strong style={{ color: "#1E293B" }}>{s.category}</strong></span>
                      <span>⏱️ Janela: <strong style={{ color: "#1E293B" }}>{s.deliveryWindow}</strong></span>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>
                        Valor Sugerido do Frete
                      </span>
                      <span style={{ fontSize: "20px", fontWeight: 800, color: "#1D4ED8" }}>
                        R$ {(s.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </div>

                  {/* Botões de Ação */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px"
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {/* Botão de Edição */}
                      {canEdit ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(s)}
                            style={{
                              padding: "6px 14px",
                              backgroundColor: "#EFF6FF",
                              border: "1px solid #BFDBFE",
                              borderRadius: "8px",
                              color: "#1D4ED8",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px"
                            }}
                          >
                            ✏️ Editar Encomenda
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteShipment(s)}
                            style={{
                              padding: "6px 14px",
                              backgroundColor: "#FEF2F2",
                              border: "1px solid #FECACA",
                              borderRadius: "8px",
                              color: "#DC2626",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px"
                            }}
                          >
                            🗑️ Excluir Encomenda
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#94A3B8", fontStyle: "italic" }}>
                          🔒 Edição bloqueada (contratada ou em trânsito)
                        </span>
                      )}

                      {/* Botão para ver Propostas */}
                      <Link
                        href="/propostas"
                        style={{
                          padding: "6px 14px",
                          backgroundColor: "#F1F5F9",
                          border: "1px solid #CBD5E1",
                          borderRadius: "8px",
                          color: "#334155",
                          fontSize: "13px",
                          fontWeight: 700,
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px"
                        }}
                      >
                        🤝 Ver Propostas
                      </Link>
                    </div>

                    {/* Botão Rastrear / Mapa */}
                    <Link
                      href="/minhas-atividades"
                      style={{
                        padding: "6px 14px",
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #CBD5E1",
                        borderRadius: "8px",
                        color: "#0F172A",
                        fontSize: "13px",
                        fontWeight: 600,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px"
                      }}
                    >
                      🗺️ Acompanhar Trajeto & PIN
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Edição de Encomenda */}
        {editingShipment && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "16px"
            }}
          >
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "16px",
                width: "100%",
                maxWidth: "520px",
                padding: "24px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                maxHeight: "90vh",
                overflowY: "auto"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px"
                }}
              >
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", margin: 0 }}>
                  ✏️ Editar Dados da Encomenda
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingShipment(null)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "20px",
                    color: "#94A3B8",
                    cursor: "pointer",
                    padding: "4px"
                  }}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: "13px", color: "#64748B", margin: "0 0 16px 0" }}>
                Você pode atualizar o título, a descrição e o valor sugerido do frete enquanto nenhuma proposta for formalmente aceita.
              </p>

              <form onSubmit={handleSaveEdit}>
                <div style={{ marginBottom: "14px" }}>
                  <label
                    htmlFor="edit-title"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}
                  >
                    Título / Resumo da Carga
                  </label>
                  <input
                    id="edit-title"
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "14px",
                      outline: "none"
                    }}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label
                    htmlFor="edit-description"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}
                  >
                    Descrição Detalhada / Instruções de Cuidado
                  </label>
                  <textarea
                    id="edit-description"
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "14px",
                      outline: "none",
                      resize: "vertical"
                    }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    htmlFor="edit-price"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}
                  >
                    Valor Sugerido para o Frete (R$)
                  </label>
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#64748B"
                      }}
                    >
                      R$
                    </span>
                    <input
                      id="edit-price"
                      type="text"
                      required
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px 8px 38px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                        fontWeight: 700,
                        outline: "none"
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setEditingShipment(null)}
                    disabled={isSaving}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#F1F5F9",
                      border: "1px solid #CBD5E1",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#475569",
                      cursor: "pointer"
                    }}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn btn--primary"
                    style={{
                      padding: "8px 18px",
                      fontSize: "13px",
                      fontWeight: 700
                    }}
                  >
                    {isSaving ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
