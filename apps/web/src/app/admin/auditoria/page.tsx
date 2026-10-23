"use client";

import React, { useEffect, useState } from "react";
import { useAdminRole } from "../admin-context";
import { listAdminAuditEventsApi } from "@/lib/api-client";
import type { AdminAuditEventDto } from "@/lib/types";

export default function AdminAuditoriaPage(): React.JSX.Element {
  const { token } = useAdminRole();
  const [events, setEvents] = useState<AdminAuditEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAuditEvents = async () => {
    if (!token) return;
    setLoading(true);
    const cat = categoryFilter === "ALL" ? undefined : categoryFilter;
    const res = await listAdminAuditEventsApi({ category: cat, limit: 100 }, token);
    if (res.ok && res.data) {
      setEvents(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAuditEvents();
  }, [token, categoryFilter]);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 6px 0" }}>
          Trilha de Auditoria & Segurança Administrativa
        </h1>
        <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
          Registros imutáveis de todas as operações administrativas, parametrizações e moderações da plataforma Topic Log.
        </p>
      </div>

      {/* Filtros por Categoria */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { key: "ALL", label: "Todas as Categorias" },
          { key: "OPERATIONAL_SETTINGS", label: "⚙️ Configurações Operacionais" },
          { key: "FLEET_MODERATION", label: "🚗 Moderação de Frotas" },
          { key: "PAYMENT_GOVERNANCE", label: "💳 Governança de Pagamentos" },
          { key: "BOOTSTRAP", label: "🚀 Inicialização do Sistema" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setCategoryFilter(tab.key)}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: "1px solid",
              borderColor: categoryFilter === tab.key ? "#2563EB" : "#334155",
              backgroundColor: categoryFilter === tab.key ? "#2563EB" : "#1E293B",
              color: categoryFilter === tab.key ? "#FFFFFF" : "#94A3B8",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabela de Eventos */}
      <div style={panelCardStyle}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "36px 0", color: "#94A3B8" }}>
            Carregando eventos de auditoria...
          </div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 0", color: "#94A3B8" }}>
            Nenhum evento registrado nesta categoria.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {events.map((e) => {
              const isExpanded = expandedId === e.id;
              return (
                <div
                  key={e.id}
                  style={{
                    backgroundColor: "#0F172A",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    overflow: "hidden"
                  }}
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : e.id)}
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: "#1E293B",
                          color: "#38BDF8",
                          border: "1px solid #334155"
                        }}
                      >
                        {e.category}
                      </span>
                      <strong style={{ fontSize: "14px", color: "#FFFFFF" }}>{e.action}</strong>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>
                        Entidade: {e.entityId}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: e.actorRole.includes("ADMIN") ? "#10B981" : "#F59E0B"
                        }}
                      >
                        {e.actorRole}
                      </span>
                      <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                        {new Date(e.recordedAtUtc).toLocaleString("pt-BR")}
                      </span>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        padding: "16px 18px",
                        backgroundColor: "#080E1E",
                        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                        fontSize: "12px",
                        fontFamily: "monospace"
                      }}
                    >
                      <div style={{ marginBottom: "8px", color: "#94A3B8" }}>
                        <strong>ID do Evento:</strong> {e.id} | <strong>Usuário Autor:</strong> {e.actorUserId}
                      </div>

                      {e.payloadBefore && (
                        <div style={{ marginBottom: "12px" }}>
                          <span style={{ color: "#F87171", fontWeight: 700 }}>Estado Anterior (Before):</span>
                          <pre
                            style={{
                              margin: "4px 0 0 0",
                              padding: "10px",
                              backgroundColor: "#0F172A",
                              borderRadius: "6px",
                              color: "#CBD5E1",
                              overflowX: "auto"
                            }}
                          >
                            {formatJson(e.payloadBefore)}
                          </pre>
                        </div>
                      )}

                      <div>
                        <span style={{ color: "#34D399", fontWeight: 700 }}>Estado Resultante (After):</span>
                        <pre
                          style={{
                            margin: "4px 0 0 0",
                            padding: "10px",
                            backgroundColor: "#0F172A",
                            borderRadius: "6px",
                            color: "#CBD5E1",
                            overflowX: "auto"
                          }}
                        >
                          {formatJson(e.payloadAfter)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const panelCardStyle: React.CSSProperties = {
  backgroundColor: "#1E293B",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "24px"
};
