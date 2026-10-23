"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { AdminRole, AdminRoleContext } from "./admin-context";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Visão Geral & Indicadores", icon: "📊" },
  { href: "/admin/politicas", label: "Planos, Comissões & Assinaturas", icon: "💎" },
  { href: "/admin/operacoes", label: "Configurações Operacionais", icon: "⚙️" },
  { href: "/admin/frotas", label: "Frotas & Veículos", icon: "🚗" },
  { href: "/admin/governanca", label: "Governança de Pagamentos", icon: "💳" },
  { href: "/admin/juridico", label: "Gestão Jurídica & Termos", icon: "📜", badge: "PR-LEG-01" },
  { href: "/admin/auditoria", label: "Auditoria & Segurança", icon: "🛡️" }
];

export default function AdminLayout({
  children
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const [role, setRole] = useState<AdminRole>("GENERAL_ADMIN");
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    // Busca token sandbox correspondente ao perfil selecionado
    async function loadToken() {
      try {
        const res = await fetch("/api/v1/auth/sandbox-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.accessToken) {
            setToken(data.accessToken);
          }
        }
      } catch (err) {
        console.warn("Falha ao obter token sandbox no admin layout:", err);
      }
    }
    loadToken();
  }, [role]);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <AdminRoleContext.Provider value={{ role, setRole, token }}>
      <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#0F172A", color: "#F8FAFC" }}>
        {/* SIDEBAR ADMINISTRATIVA */}
        <aside
          style={{
            width: "280px",
            backgroundColor: "#0B132B",
            borderRight: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0
          }}
        >
          {/* Topo Sidebar */}
          <div style={{ padding: "24px 20px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #2563EB 0%, #10B981 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontWeight: 800,
                  fontSize: "14px"
                }}
              >
                TL
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: "16px", color: "#FFFFFF" }}>Topic Log</div>
                <div style={{ fontSize: "11px", color: "#94A3B8", fontWeight: 600 }}>PAINEL DE GOVERNANÇA</div>
              </div>
            </div>
            <div
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: 700,
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "#10B981",
                border: "1px solid rgba(16, 185, 129, 0.3)"
              }}
            >
              SANDBOX ATIVO • EM MEMÓRIA
            </div>
          </div>

          {/* Seletor Rápido de Perfil Administrativo (RBAC) */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <label
              htmlFor="role-select"
              style={{ display: "block", fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}
            >
              Perfil Simulado (RBAC):
            </label>
            <select
              id="role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              style={{
                width: "100%",
                padding: "8px 10px",
                backgroundColor: "#1E293B",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#F8FAFC",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <option value="GENERAL_ADMIN">1. GENERAL_ADMIN (Acesso Total)</option>
              <option value="FINANCIAL_ADMIN">2. FINANCIAL_ADMIN (Financeiro)</option>
              <option value="LEGAL_OPERATOR">3. LEGAL_OPERATOR (Jurídico)</option>
              <option value="COMPLIANCE_AUDITOR">4. COMPLIANCE_AUDITOR (Auditor)</option>
              <option value="SUPPORT_OPERATOR">5. SUPPORT_OPERATOR (Suporte)</option>
            </select>
          </div>

          {/* Navegação */}
          <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: active ? 700 : 500,
                    color: active ? "#FFFFFF" : "#94A3B8",
                    backgroundColor: active ? "rgba(37, 99, 235, 0.2)" : "transparent",
                    borderLeft: active ? "3px solid #2563EB" : "3px solid transparent",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span style={{ fontSize: "16px" }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: "9px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: "#334155",
                        color: "#CBD5E1",
                        fontWeight: 700
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Rodapé Sidebar */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <Link
              href="/feed"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "#64748B",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: 600
              }}
            >
              ← Voltar ao App Público
            </Link>
          </div>
        </aside>

        {/* ÁREA DE CONTEÚDO PRINCIPAL */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, backgroundColor: "#0F172A" }}>
          {/* Header Superior Administrativo */}
          <header
            style={{
              height: "64px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "0 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "#0B132B"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#FFFFFF" }}>Painel Administrativo Topic Log</span>
              <span style={{ color: "#475569" }}>/</span>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                {ADMIN_NAV_ITEMS.find((n) => isActive(n.href))?.label ?? "Módulo"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  backgroundColor: "#451A03",
                  color: "#FDE68A",
                  border: "1px solid #78350F"
                }}
                title="Ressalva de Segurança: o alternador de perfis RBAC e emissão de JWT administrativos são restritos exclusivamente a testes locais e desabilitados em produção."
              >
                🔒 Sandbox Testing (Restrito)
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  backgroundColor: "#1E293B",
                  color: "#38BDF8",
                  border: "1px solid #334155"
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#38BDF8" }} />
                Perfil Ativo: {role}
              </span>
            </div>
          </header>

          {/* Conteúdo Dinâmico */}
          <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
            {children}
          </main>
        </div>
      </div>
    </AdminRoleContext.Provider>
  );
}
