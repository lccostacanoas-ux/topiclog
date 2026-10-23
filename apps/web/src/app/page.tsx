"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { getDemoShipments } from "../lib/demo-marketplace-store";

export default function HomePage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const displayName = user?.displayName ? user.displayName.split(" ")[0] : "Luiz";
  const recentShipments = getDemoShipments().slice(0, 3);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  return (
    <main
      id="main-content"
      style={{
        backgroundColor: "#F1F5F9",
        minHeight: "calc(100vh - 56px)",
        paddingBottom: "88px"
      }}
    >
      <div className="container" style={{ maxWidth: "560px", padding: "16px 16px 24px 16px" }}>
        {/* Saudação Superior Padrão CDT / Meu INSS */}
        <section style={{ marginBottom: "20px" }}>
          <h1
            style={{
              fontSize: "26px",
              fontWeight: 800,
              color: "#0F172A",
              margin: "0 0 4px 0",
              letterSpacing: "-0.5px"
            }}
          >
            Olá, {displayName}
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#64748B", fontWeight: 500 }}>
            Marketplace de Encomendas & Rotas • Minas Gerais
          </p>
        </section>

        {/* =========================================================================
            1. GRANDES CARDS DE AÇÃO VISUAL (ESTILO CDT - CARTEIRA DIGITAL DE TRÂNSITO)
           ========================================================================= */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            marginBottom: "28px"
          }}
          aria-label="Serviços Principais Topic Log"
        >
          {/* Card 1: CONDUTOR / ENVIAR ENCOMENDA (Verde Esmeralda) */}
          <Link
            href="/encomendas/publicar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
              borderRadius: "18px",
              padding: "20px 22px",
              textDecoration: "none",
              color: "#FFFFFF",
              boxShadow: "0 10px 20px -5px rgba(5, 150, 105, 0.4)",
              position: "relative",
              overflow: "hidden",
              transition: "transform 0.15s ease, box-shadow 0.15s ease"
            }}
          >
            {/* Efeito de onda suave no fundo (Padrão CDT) */}
            <svg
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                top: 0,
                width: "60%",
                height: "100%",
                opacity: 0.15,
                pointerEvents: "none"
              }}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d="M50 0 C 80 50, 120 20, 200 100 L 200 0 Z"
                fill="#FFFFFF"
              />
              <path
                d="M0 100 C 60 70, 140 90, 200 40 L 200 100 Z"
                fill="#FFFFFF"
              />
            </svg>

            <div style={{ position: "relative", zIndex: 2, maxWidth: "68%" }}>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                  display: "block",
                  lineHeight: "1.2",
                  textTransform: "uppercase"
                }}
              >
                ENVIAR ENCOMENDA
              </span>
              <span
                style={{
                  fontSize: "13px",
                  opacity: 0.95,
                  fontWeight: 500,
                  display: "block",
                  marginTop: "6px",
                  lineHeight: "1.3"
                }}
              >
                Despache mercadorias e pacotes leves
              </span>
            </div>

            {/* Ícone 3D em relevo à direita */}
            <div
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "16px",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                position: "relative",
                zIndex: 2,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}
            >
              📦
            </div>
          </Link>

          {/* Card 2: VEÍCULOS / SOU TRANSPORTADOR (Amarelo Dourado / Âmbar) */}
          <Link
            href="/viagens/cadastrar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)",
              borderRadius: "18px",
              padding: "20px 22px",
              textDecoration: "none",
              color: "#FFFFFF",
              boxShadow: "0 10px 20px -5px rgba(217, 119, 6, 0.4)",
              position: "relative",
              overflow: "hidden",
              transition: "transform 0.15s ease, box-shadow 0.15s ease"
            }}
          >
            <svg
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                top: 0,
                width: "60%",
                height: "100%",
                opacity: 0.15,
                pointerEvents: "none"
              }}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d="M30 0 C 70 60, 110 30, 200 90 L 200 0 Z"
                fill="#FFFFFF"
              />
              <path
                d="M10 100 C 70 80, 130 95, 200 50 L 200 100 Z"
                fill="#FFFFFF"
              />
            </svg>

            <div style={{ position: "relative", zIndex: 2, maxWidth: "68%" }}>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                  display: "block",
                  lineHeight: "1.2",
                  textTransform: "uppercase"
                }}
              >
                TRANSPORTADOR
              </span>
              <span
                style={{
                  fontSize: "13px",
                  opacity: 0.95,
                  fontWeight: 500,
                  display: "block",
                  marginTop: "6px",
                  lineHeight: "1.3"
                }}
              >
                Cadastre viagens e monetize trajetos em MG
              </span>
            </div>

            <div
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "16px",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                position: "relative",
                zIndex: 2,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}
            >
              🚗
            </div>
          </Link>

          {/* Card 3: INFRAÇÕES / MINHAS ATIVIDADES (Azul Royal) */}
          <Link
            href="/minhas-atividades"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)",
              borderRadius: "18px",
              padding: "20px 22px",
              textDecoration: "none",
              color: "#FFFFFF",
              boxShadow: "0 10px 20px -5px rgba(30, 64, 175, 0.4)",
              position: "relative",
              overflow: "hidden",
              transition: "transform 0.15s ease, box-shadow 0.15s ease"
            }}
          >
            <svg
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                top: 0,
                width: "60%",
                height: "100%",
                opacity: 0.15,
                pointerEvents: "none"
              }}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d="M40 0 C 80 40, 130 10, 200 80 L 200 0 Z"
                fill="#FFFFFF"
              />
              <path
                d="M0 100 C 80 60, 150 70, 200 30 L 200 100 Z"
                fill="#FFFFFF"
              />
            </svg>

            <div style={{ position: "relative", zIndex: 2, maxWidth: "68%" }}>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                  display: "block",
                  lineHeight: "1.2",
                  textTransform: "uppercase"
                }}
              >
                MINHAS ATIVIDADES
              </span>
              <span
                style={{
                  fontSize: "13px",
                  opacity: 0.95,
                  fontWeight: 500,
                  display: "block",
                  marginTop: "6px",
                  lineHeight: "1.3"
                }}
              >
                Acompanhe entregas ativas e código D16
              </span>
            </div>

            <div
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "16px",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                position: "relative",
                zIndex: 2,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}
            >
              ⚡
            </div>
          </Link>

          {/* Card 4: EDUCAÇÃO / COMPROVAÇÃO DE ENTREGA (Azul Celeste) */}
          <Link
            href="/minhas-atividades"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg, #0284C7 0%, #38BDF8 100%)",
              borderRadius: "18px",
              padding: "20px 22px",
              textDecoration: "none",
              color: "#FFFFFF",
              boxShadow: "0 10px 20px -5px rgba(2, 132, 199, 0.4)",
              position: "relative",
              overflow: "hidden",
              transition: "transform 0.15s ease, box-shadow 0.15s ease"
            }}
          >
            <svg
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                top: 0,
                width: "60%",
                height: "100%",
                opacity: 0.15,
                pointerEvents: "none"
              }}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d="M60 0 C 90 50, 140 20, 200 70 L 200 0 Z"
                fill="#FFFFFF"
              />
              <path
                d="M20 100 C 80 50, 140 80, 200 20 L 200 100 Z"
                fill="#FFFFFF"
              />
            </svg>

            <div style={{ position: "relative", zIndex: 2, maxWidth: "68%" }}>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                  display: "block",
                  lineHeight: "1.2",
                  textTransform: "uppercase"
                }}
              >
                CONFIRMAR ENTREGA
              </span>
              <span
                style={{
                  fontSize: "13px",
                  opacity: 0.95,
                  fontWeight: 500,
                  display: "block",
                  marginTop: "6px",
                  lineHeight: "1.3"
                }}
              >
                Fotografe o pacote e valide o código D16
              </span>
            </div>

            <div
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "16px",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                position: "relative",
                zIndex: 2,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}
            >
              📸
            </div>
          </Link>
        </section>

        {/* =========================================================================
            2. SERVIÇOS PARA VOCÊ (GRADE 2 COLUNAS - ESTILO MEU INSS)
           ========================================================================= */}
        <section style={{ marginBottom: "28px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#334155",
              margin: "0 0 14px 0"
            }}
          >
            Serviços para você
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px"
            }}
          >
            {/* Serviço 1: Feed de Cargas */}
            <Link
              href="/feed"
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "14px",
                padding: "16px 14px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                border: "1px solid #E2E8F0"
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#EFF6FF",
                  color: "#2563EB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0
                }}
              >
                📁
              </div>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                  Feed de Cargas
                </span>
                <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                  Oportunidades
                </span>
              </div>
            </Link>

            {/* Serviço 2: Extrato e Repasses */}
            <Link
              href="/minha-conta"
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "14px",
                padding: "16px 14px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                border: "1px solid #E2E8F0"
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#EFF6FF",
                  color: "#2563EB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0
                }}
              >
                💰
              </div>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                  Extrato & Saldo
                </span>
                <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                  Comissão 13%
                </span>
              </div>
            </Link>

            {/* Serviço 3: Verificação KYC */}
            <Link
              href="/perfil"
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "14px",
                padding: "16px 14px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                border: "1px solid #E2E8F0",
                position: "relative"
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  backgroundColor: "#10B981",
                  color: "#FFFFFF",
                  fontSize: "9px",
                  fontWeight: 800,
                  padding: "2px 6px",
                  borderRadius: "6px"
                }}
              >
                OK
              </span>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#EFF6FF",
                  color: "#2563EB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0
                }}
              >
                🛡️
              </div>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                  Validar KYC
                </span>
                <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                  Documentos & Face
                </span>
              </div>
            </Link>

            {/* Serviço 4: Propostas e Negociação */}
            <Link
              href="/propostas"
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "14px",
                padding: "16px 14px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                border: "1px solid #E2E8F0"
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#EFF6FF",
                  color: "#2563EB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0
                }}
              >
                🤝
              </div>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                  Propostas
                </span>
                <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                  Negociação Ativa
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* =========================================================================
            3. PRECISA DE AJUDA? (ESTILO ASSISTENTE HELÔ - MEU INSS)
           ========================================================================= */}
        <section style={{ marginBottom: "28px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#334155",
              margin: "0 0 14px 0"
            }}
          >
            Precisa de ajuda?
          </h2>

          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              padding: "18px",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
              border: "1px solid #E2E8F0"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
              {/* Avatar da Assistente Virtual */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "26px",
                  color: "#FFFFFF",
                  flexShrink: 0,
                  boxShadow: "0 4px 10px rgba(37, 99, 235, 0.25)"
                }}
              >
                👩‍💼
              </div>
              <div>
                <span style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A", display: "block" }}>
                  Converse com a Sofia
                </span>
                <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#64748B", lineHeight: "1.3" }}>
                  Olá, sou a assistente virtual da Topic Log. Dúvidas sobre fretes, entregas ou repasse?
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSupportModalOpen(true)}
              style={{
                width: "100%",
                backgroundColor: "transparent",
                border: "none",
                color: "#2563EB",
                fontWeight: 700,
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "6px",
                cursor: "pointer",
                padding: "8px 0"
              }}
            >
              <span>Iniciar Atendimento</span>
              <span style={{ fontSize: "16px" }}>›</span>
            </button>
          </div>

          {/* Outros Canais de Ajuda */}
          <Link
            href="/mensagens"
            style={{
              marginTop: "10px",
              backgroundColor: "#FFFFFF",
              borderRadius: "14px",
              padding: "16px 18px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
              border: "1px solid #E2E8F0"
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#1E293B" }}>
              Outros canais de Ajuda
            </span>
            <span style={{ fontSize: "18px", color: "#94A3B8" }}>›</span>
          </Link>
        </section>

        {/* =========================================================================
            4. RODAPÉ INSTITUCIONAL (ESTILO CARTEIRA DIGITAL DE TRÂNSITO)
           ========================================================================= */}
        <footer
          style={{
            marginTop: "32px",
            paddingTop: "20px",
            borderTop: "1px solid #CBD5E1",
            textAlign: "center"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "24px",
              marginBottom: "12px",
              opacity: 0.8
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "14px" }}>📦</span>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#1E293B" }}>TOPIC LOG</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "14px" }}>🛡️</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>SEGURANÇA D16</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "14px" }}>🔺</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>MINAS GERAIS</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: "11px", color: "#94A3B8" }}>
            Piloto Homologado: João Monlevade • Belo Horizonte • Todo o Estado de MG
          </p>
        </footer>
      </div>

      {/* Modal de Atendimento com a Assistente Virtual */}
      {supportModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "16px"
          }}
          onClick={() => setSupportModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "20px",
              padding: "20px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              color: "#0F172A"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "24px" }}>👩‍💼</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Atendimento Topic Log</h3>
                  <span style={{ fontSize: "12px", color: "#10B981", fontWeight: 700 }}>● Online Agora</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupportModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "#64748B", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ backgroundColor: "#F8FAFC", borderRadius: "12px", padding: "14px", marginBottom: "16px", fontSize: "13px", color: "#334155", lineHeight: "1.5" }}>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Olá, {displayName}!</strong>
              </p>
              <p style={{ margin: 0 }}>
                Como posso ajudar você hoje? Selecione um dos tópicos mais frequentes ou envie uma mensagem direta:
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setSupportModalOpen(false);
                  router.push("/minhas-atividades");
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  backgroundColor: "#FFFFFF",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1E293B",
                  cursor: "pointer"
                }}
              >
                📸 Como funciona a comprovação de entrega D16?
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupportModalOpen(false);
                  router.push("/minha-conta");
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  backgroundColor: "#FFFFFF",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1E293B",
                  cursor: "pointer"
                }}
              >
                💰 Prazos e taxas de repasse ao transportador (13%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupportModalOpen(false);
                  router.push("/perfil");
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  backgroundColor: "#FFFFFF",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1E293B",
                  cursor: "pointer"
                }}
              >
                🛡️ Verificação de identidade e biometria (KYC)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSupportModalOpen(false)}
              style={{
                width: "100%",
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "10px",
                padding: "12px",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer"
              }}
            >
              Fechar Atendimento
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
