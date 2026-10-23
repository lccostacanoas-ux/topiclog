"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDemoShipment, type ShipmentCategory } from "../../../lib/demo-marketplace-store";
import { useAuth } from "../../../lib/auth-context";
import type { VehicleTypeCode, CreateShipmentPayload } from "../../../lib/types";
import { createShipmentApi } from "../../../lib/api-client";

const CATEGORY_OPTIONS: { value: ShipmentCategory; label: string; icon: string }[] = [
  { value: "DOCUMENTOS", label: "Documentos e Contratos", icon: "📄" },
  { value: "AUTOPECAS", label: "Autopeças e Ferramentas", icon: "⚙️" },
  { value: "ELETRONICOS", label: "Eletrônicos e Informática", icon: "💻" },
  { value: "SAUDE", label: "Medicamentos e Saúde", icon: "💊" },
  { value: "ALIMENTOS", label: "Alimentos e Perecíveis", icon: "🍫" },
  { value: "GERAL", label: "Carga Geral / Caixas", icon: "📦" }
];

const SPECIAL_CARE_OPTIONS = [
  "Frágil / Delicado",
  "Manter em Pé",
  "Proteger de Umidade",
  "Não Empilhar",
  "Lacrado com Lacre de Segurança",
  "Temperatura Controlada"
];

// Opções rápidas de dimensões pré-configuradas (sugestões aproximadas e editáveis)
const DIMENSION_PRESETS: {
  id: string;
  label: string;
  icon: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  approxDescription: string;
}[] = [
  { id: "SAPATOS", label: "Caixa de sapatos", icon: "👟", lengthCm: "32", widthCm: "20", heightCm: "12", approxDescription: "Aprox. 32 × 20 × 12 cm" },
  { id: "MOCHILA", label: "Mochila", icon: "🎒", lengthCm: "42", widthCm: "30", heightCm: "15", approxDescription: "Aprox. 42 × 30 × 15 cm" },
  { id: "CAIXA_PEQUENA", label: "Caixa pequena", icon: "📦", lengthCm: "25", widthCm: "20", heightCm: "15", approxDescription: "Aprox. 25 × 20 × 15 cm" },
  { id: "CAIXA_MEDIA", label: "Caixa média", icon: "📫", lengthCm: "40", widthCm: "30", heightCm: "25", approxDescription: "Aprox. 40 × 30 × 25 cm" }
];

export default function PublicarEncomendaPage(): React.JSX.Element {
  const router = useRouter();
  const { user, token } = useAuth();
  const isSubmittingRef = useRef(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ShipmentCategory>("GERAL");
  const [vehicleType, setVehicleType] = useState<VehicleTypeCode>("MOTORCYCLE");
  const [weightKg, setWeightKg] = useState("2.5");
  const [lengthCm, setLengthCm] = useState("30");
  const [widthCm, setWidthCm] = useState("20");
  const [heightCm, setHeightCm] = useState("15");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [specialCare, setSpecialCare] = useState<string[]>(["Frágil / Delicado"]);
  const [hasPhoto, setHasPhoto] = useState(false);

  const [originCity, setOriginCity] = useState("João Monlevade");
  const [originNeighborhood, setOriginNeighborhood] = useState("Carneirinhos");
  const [destinationCity, setDestinationCity] = useState("Belo Horizonte");
  const [destinationNeighborhood, setDestinationNeighborhood] = useState("Savassi");
  const [suggestedPriceReais, setSuggestedPriceReais] = useState("50,00");
  const [deadline, setDeadline] = useState("Amanhã até 18h");
  const [interestedInInsurance, setInterestedInInsurance] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validação de limite de peso por veículo (D03 / D04)
  const maxAllowedKg = vehicleType === "BICYCLE" ? 5 : 20;
  const parsedWeightKg = parseFloat(weightKg.replace(",", "."));
  const isWeightOverLimit = !isNaN(parsedWeightKg) && parsedWeightKg > maxAllowedKg;

  // Cálculo de volume cúbico
  const pLength = parseFloat(lengthCm) || 0;
  const pWidth = parseFloat(widthCm) || 0;
  const pHeight = parseFloat(heightCm) || 0;
  const volumeLiters = ((pLength * pWidth * pHeight) / 1000).toFixed(1);

  // Cálculo de comissão
  const parsedPrice = parseFloat(suggestedPriceReais.replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
  const estimatedCommission = (parsedPrice * 0.13).toFixed(2).replace(".", ",");
  const estimatedCarrierNet = (parsedPrice * 0.87).toFixed(2).replace(".", ",");

  const toggleSpecialCare = (care: string) => {
    setSpecialCare((prev) =>
      prev.includes(care) ? prev.filter((c) => c !== care) : [...prev, care]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!title.trim() || title.trim().length < 3) {
      setErrorMsg("Informe um título descritivo para a encomenda (mínimo 3 caracteres).");
      return;
    }

    if (isNaN(parsedWeightKg) || parsedWeightKg <= 0) {
      setErrorMsg("Informe um peso válido maior que zero.");
      return;
    }

    if (parsedWeightKg > maxAllowedKg) {
      setErrorMsg(`O peso de ${parsedWeightKg} kg ultrapassa o limite permitido para ${vehicleType === "BICYCLE" ? "Bicicleta (5 kg)" : "Moto/Carro (20 kg)"} conforme a regra D04.`);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const priceCents = Math.round(parsedPrice * 100) || 3000;

    const iconByCategory: Record<ShipmentCategory, string> = {
      DOCUMENTOS: "📄",
      AUTOPECAS: "⚙️",
      ELETRONICOS: "💻",
      SAUDE: "💊",
      ALIMENTOS: "🍫",
      GERAL: "📦"
    };

    try {
      const payload: CreateShipmentPayload = {
        title: title.trim(),
        description: description.trim() || "Sem observações adicionais.",
        category,
        vehicleType,
        weightGrams: Math.round(parsedWeightKg * 1000),
        dimensionsLengthCm: Math.round(pLength) || 20,
        dimensionsWidthCm: Math.round(pWidth) || 15,
        dimensionsHeightCm: Math.round(pHeight) || 10,
        declaredValueCents: Math.round(parsedPrice * 100),
        suggestedPriceCents: priceCents,
        specialCareNotes: specialCare,
        origin: {
          city: originCity,
          stateUf: "MG",
          neighborhood: originNeighborhood.trim() || "Centro"
        },
        destination: {
          city: destinationCity,
          stateUf: "MG",
          neighborhood: destinationNeighborhood.trim() || "Centro"
        },
        pickupWindow: "A combinar",
        deliveryWindow: deadline,
        interestedInInsurance
      };

      const result = await createShipmentApi(payload, token ?? undefined);

      if (!result.ok) {
        const errorDetail = result.problem?.detail || result.problem?.title || "Ocorreu um erro ao comunicar com a API da Topic Log.";
        setErrorMsg(errorDetail);
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        return;
      }

      // Sincroniza com a persistência de demonstração local para navegação contínua no protótipo
      addDemoShipment({
        title: title.trim(),
        description: description.trim() || "Sem observações adicionais.",
        category,
        dimensions: {
          lengthCm: Math.round(pLength) || 20,
          widthCm: Math.round(pWidth) || 15,
          heightCm: Math.round(pHeight) || 10
        },
        specialCare,
        originCity,
        originNeighborhood: originNeighborhood.trim() || "Centro",
        destinationCity,
        destinationNeighborhood: destinationNeighborhood.trim() || "Centro",
        weightGrams: Math.round(parsedWeightKg * 1000),
        maxVehicleType: vehicleType,
        suggestedPriceCents: priceCents,
        deadlineDate: deadline,
        senderName: user?.displayName || "Remetente Demo JM",
        senderKycVerified: user?.kycStatus === "VERIFIED",
        interestedInInsurance,
        photoIcon: hasPhoto ? "📸" : iconByCategory[category]
      });

      setSuccessMsg("Encomenda cadastrada com sucesso no backend da Topic Log! Redirecionando para o Feed de Oportunidades...");
      setTimeout(() => {
        router.push("/feed");
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada ao registrar encomenda.";
      setErrorMsg(msg);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "56px", maxWidth: "800px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/feed" style={{ fontSize: "14px", color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>
          ← Voltar para o Feed de Oportunidades
        </Link>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginTop: "10px", marginBottom: "6px", color: "var(--color-brand-deep-navy)" }}>
          Publicar Nova Encomenda
        </h1>
        <p style={{ color: "var(--color-muted)", margin: 0, fontSize: "15px" }}>
          Cadastre o pacote ou documento que você precisa transportar em Minas Gerais.
          Viajantes que farão o trajeto poderão enviar propostas para levar sua carga com segurança.
        </p>
      </div>

      {errorMsg && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: "20px" }}>
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="alert alert--success" role="status" style={{ marginBottom: "20px" }}>
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ padding: "28px", boxShadow: "var(--shadow-md)" }}>
        {/* Bloco 1: O que enviar */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            1. Características do Pacote e Categoria
          </legend>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div className="form-group">
              <label htmlFor="enc-category" className="form-label">
                Categoria da Carga *
              </label>
              <select
                id="enc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ShipmentCategory)}
                className="form-control"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="enc-title" className="form-label">
                Título Resumido *
              </label>
              <input
                id="enc-title"
                type="text"
                required
                placeholder="Ex: Contratos em envelope, Peça mecânica 3kg..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="enc-desc" className="form-label">
              Descrição Detalhada e Instruções de Manuseio
            </label>
            <textarea
              id="enc-desc"
              rows={3}
              placeholder="Descreva o conteúdo, embalagem, fragilidade e qualquer instrução relevante para o transportador..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="form-control"
            />
          </div>

          {/* Cuidados Especiais (Chips Interativos) */}
          <div style={{ marginBottom: "16px" }}>
            <label className="form-label" style={{ marginBottom: "8px", display: "block" }}>
              Cuidados Especiais e Restrições:
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {SPECIAL_CARE_OPTIONS.map((care) => {
                const isSelected = specialCare.includes(care);
                return (
                  <button
                    key={care}
                    type="button"
                    onClick={() => toggleSpecialCare(care)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-full)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: isSelected ? "1px solid #D97706" : "1px solid var(--color-border)",
                      backgroundColor: isSelected ? "#FEF3C7" : "#FFFFFF",
                      color: isSelected ? "#92400E" : "var(--color-muted)",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {isSelected ? "✓ " : "+ "}
                    {care}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload de Foto Demonstrativo */}
          <div className="form-group">
            <label className="form-label">
              Foto da Encomenda (Simulação Visual):
            </label>
            <div
              className="photo-dropzone-preview"
              onClick={() => setHasPhoto(!hasPhoto)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setHasPhoto(!hasPhoto)}
            >
              {hasPhoto ? (
                <div>
                  <span style={{ fontSize: "36px" }}>📸</span>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-success)", marginTop: "4px" }}>
                    ✓ Foto do pacote anexada com sucesso!
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                    Clique para remover ou trocar
                  </div>
                </div>
              ) : (
                <div>
                  <span style={{ fontSize: "32px", color: "var(--color-muted)" }}>📷</span>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-primary)", marginTop: "4px" }}>
                    Clique para simular o anexo de foto do pacote
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                    Ajuda o transportador a avaliar o espaço e volume necessário
                  </div>
                </div>
              )}
            </div>
          </div>
        </fieldset>

        {/* Bloco 2: Modal e Dimensões */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            2. Modal de Transporte e Dimensões Físicas (D03 / D04)
          </legend>

          {/* Cards Visuais de Seleção de Modal */}
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: "8px" }}>
              Modal de Transporte Adequado:
            </label>
            <div className="vehicle-selector-grid">
              <div
                className={`vehicle-card-option ${vehicleType === "BICYCLE" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => {
                  setVehicleType("BICYCLE");
                  if (parsedWeightKg > 5) setWeightKg("5.0");
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🚲</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Bicicleta</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Urbano / Ciclovias</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#065F46", marginTop: "8px" }}>
                  Limite: Até 5 kg (D04)
                </div>
              </div>

              <div
                className={`vehicle-card-option ${vehicleType === "MOTORCYCLE" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => setVehicleType("MOTORCYCLE")}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🏍️</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Motocicleta</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Baú ou mochila cargueira</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400E", marginTop: "8px" }}>
                  Limite: Até 20 kg (D04)
                </div>
              </div>

              <div
                className={`vehicle-card-option ${vehicleType === "CAR" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => setVehicleType("CAR")}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🚗</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Carro de Passeio</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Porta-malas livre</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", marginTop: "8px" }}>
                  Limite: Até 20 kg (D04)
                </div>
              </div>
            </div>
          </div>

          {/* Opções Rápidas de Dimensões Pré-Configuradas */}
          <div style={{ marginTop: "16px", marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
              <label className="form-label" style={{ margin: 0 }}>
                Opções Rápidas de Dimensões (Sugestões Aproximadas):
              </label>
              <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                Sugestões editáveis • Não altera o peso real da carga
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
              {DIMENSION_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id ||
                  (lengthCm === preset.lengthCm && widthCm === preset.widthCm && heightCm === preset.heightCm);

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setLengthCm(preset.lengthCm);
                      setWidthCm(preset.widthCm);
                      setHeightCm(preset.heightCm);
                      setSelectedPresetId(preset.id);
                      // Nota: O peso não é presumido com base no formato, permanece inalterado conforme diretriz
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "8px 6px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid #2563EB" : "1px solid var(--color-border)",
                      backgroundColor: isSelected ? "#EFF6FF" : "#FFFFFF",
                      color: isSelected ? "#1E40AF" : "var(--color-slate-700)",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.15s ease",
                      minHeight: "56px"
                    }}
                    title={`Aplicar ${preset.label} (${preset.approxDescription})`}
                  >
                    <span style={{ fontSize: "20px", marginBottom: "2px" }}>{preset.icon}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700 }}>{preset.label}</span>
                    <span style={{ fontSize: "10px", color: isSelected ? "#3B82F6" : "var(--color-muted)", marginTop: "2px" }}>
                      {preset.approxDescription}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dimensões e Peso */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginTop: "12px" }}>
            <div className="form-group">
              <label htmlFor="enc-weight" className="form-label">
                Peso (kg) *
              </label>
              <input
                id="enc-weight"
                type="text"
                required
                placeholder="Ex: 2.5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className={`form-control ${isWeightOverLimit ? "form-control--error" : ""}`}
              />
              <span style={{ fontSize: "11px", color: isWeightOverLimit ? "var(--color-danger)" : "var(--color-muted)" }}>
                Máx: {maxAllowedKg} kg
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="enc-length" className="form-label">
                Comp. (cm)
              </label>
              <input
                id="enc-length"
                type="number"
                value={lengthCm}
                onChange={(e) => {
                  setLengthCm(e.target.value);
                  setSelectedPresetId(null);
                }}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="enc-width" className="form-label">
                Largura (cm)
              </label>
              <input
                id="enc-width"
                type="number"
                value={widthCm}
                onChange={(e) => {
                  setWidthCm(e.target.value);
                  setSelectedPresetId(null);
                }}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="enc-height" className="form-label">
                Altura (cm)
              </label>
              <input
                id="enc-height"
                type="number"
                value={heightCm}
                onChange={(e) => {
                  setHeightCm(e.target.value);
                  setSelectedPresetId(null);
                }}
                className="form-control"
              />
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "var(--color-muted)", marginTop: "4px" }}>
            📐 Volume cúbico estimado: <strong>{volumeLiters} Litros</strong>
          </div>
        </fieldset>

        {/* Bloco 3: Rota em MG */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            3. Rota de Transporte em Minas Gerais
          </legend>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Origem */}
            <div style={{ backgroundColor: "#F8FAFC", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-success)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🟢</span> Ponto de Coleta (Origem)
              </div>
              <div className="form-group">
                <label htmlFor="enc-orig-city" className="form-label">
                  Cidade de Coleta *
                </label>
                <select
                  id="enc-orig-city"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  className="form-control"
                >
                  <option value="João Monlevade">João Monlevade (Piloto 1)</option>
                  <option value="Belo Horizonte">Belo Horizonte (Piloto 2)</option>
                  <option value="Ipatinga">Ipatinga</option>
                  <option value="Itabira">Itabira</option>
                  <option value="Nova Era">Nova Era</option>
                  <option value="Ouro Preto">Ouro Preto</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="enc-orig-neigh" className="form-label">
                  Bairro ou Ponto de Referência
                </label>
                <input
                  id="enc-orig-neigh"
                  type="text"
                  placeholder="Ex: Carneirinhos, Centro..."
                  value={originNeighborhood}
                  onChange={(e) => setOriginNeighborhood(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>

            {/* Destino */}
            <div style={{ backgroundColor: "#F8FAFC", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-primary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🔵</span> Ponto de Entrega (Destino)
              </div>
              <div className="form-group">
                <label htmlFor="enc-dest-city" className="form-label">
                  Cidade de Entrega *
                </label>
                <select
                  id="enc-dest-city"
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  className="form-control"
                >
                  <option value="Belo Horizonte">Belo Horizonte (Piloto 2)</option>
                  <option value="João Monlevade">João Monlevade (Piloto 1)</option>
                  <option value="Ipatinga">Ipatinga</option>
                  <option value="Itabira">Itabira</option>
                  <option value="Nova Era">Nova Era</option>
                  <option value="Ouro Preto">Ouro Preto</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="enc-dest-neigh" className="form-label">
                  Bairro ou Ponto de Referência
                </label>
                <input
                  id="enc-dest-neigh"
                  type="text"
                  placeholder="Ex: Savassi, Pampulha, Centro..."
                  value={destinationNeighborhood}
                  onChange={(e) => setDestinationNeighborhood(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>
          </div>
        </fieldset>

        {/* Bloco 4: Remuneração e Termos Financeiros */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            4. Remuneração Proposta e Termos Financeiros (D10 / D11)
          </legend>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div className="form-group">
              <label htmlFor="enc-price" className="form-label">
                Valor Sugerido do Frete (R$) *
              </label>
              <input
                id="enc-price"
                type="text"
                required
                placeholder="Ex: 50,00"
                value={suggestedPriceReais}
                onChange={(e) => setSuggestedPriceReais(e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="enc-deadline" className="form-label">
                Prazo Limite de Entrega
              </label>
              <input
                id="enc-deadline"
                type="text"
                placeholder="Ex: Hoje até 18h, Amanhã até 12h..."
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          {/* Divisão Visual do Valor */}
          <div
            style={{
              backgroundColor: "#F8FAFC",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: "14px",
              marginBottom: "16px"
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-brand-deep-navy)", marginBottom: "6px" }}>
              Transparência da Taxa de Serviço (13% Plano Free):
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
              <span style={{ color: "var(--color-muted)" }}>Taxa de serviço Topic Log (13%):</span>
              <span>R$ {estimatedCommission}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: "var(--color-success)" }}>
              <span>Repasse líquido ao transportador:</span>
              <span>R$ {estimatedCarrierNet}</span>
            </div>
            <div className="split-bar-container" style={{ marginTop: "8px" }}>
              <div className="split-bar-carrier" style={{ width: "87%" }} />
              <div className="split-bar-platform" style={{ width: "13%" }} />
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-muted)", marginTop: "6px" }}>
              O processamento do pagamento ocorre por parceiro homologado. O repasse ao transportador é liberado somente após a confirmação de entrega via código de 4 dígitos (D16).
            </div>
          </div>

          {/* Seguro D06 */}
          <div style={{ backgroundColor: "#EFF6FF", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid #BFDBFE" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={interestedInInsurance}
                onChange={(e) => setInterestedInInsurance(e.target.checked)}
                style={{ marginTop: "3px" }}
              />
              <div>
                <strong style={{ color: "#1E40AF" }}>Manifestação de interesse em seguro futuro (D06):</strong>
                <div style={{ color: "#1E3A8A", fontSize: "12px", marginTop: "2px" }}>
                  "Esta manifestação não contrata seguro e não garante cobertura". Seguro não é comercializado no MVP da Topic Log.
                </div>
              </div>
            </label>
          </div>
        </fieldset>

        {/* Rodapé com Botões */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border)", paddingTop: "20px" }}>
          <Link href="/feed" className="btn btn--outline">
            Cancelar
          </Link>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isSubmitting}
            style={{ padding: "12px 28px", fontSize: "15px", fontWeight: 700, opacity: isSubmitting ? 0.7 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? "Publicando Encomenda na API..." : "Publicar Encomenda no Feed →"}
          </button>
        </div>
      </form>
    </main>
  );
}
