"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDemoTrip } from "../../../lib/demo-marketplace-store";
import { useAuth } from "../../../lib/auth-context";
import type { VehicleTypeCode, CreateTripPayload } from "../../../lib/types";
import { createTripApi } from "../../../lib/api-client";

interface IntermediateStopItem {
  name: string;
  ibgeCode?: string;
  stateUf?: string;
}

const KNOWN_MUNICIPALITIES: Record<string, { name: string; ibgeCode: string; stateUf: string }> = {
  "JOAO MONLEVADE": { name: "João Monlevade", ibgeCode: "3136207", stateUf: "MG" },
  "BELO HORIZONTE": { name: "Belo Horizonte", ibgeCode: "3106200", stateUf: "MG" },
  "BARAO DE COCAIS": { name: "Barão de Cocais", ibgeCode: "3105400", stateUf: "MG" },
  "CAETE": { name: "Caeté", ibgeCode: "3110004", stateUf: "MG" },
  "NOVA UNIAO": { name: "Nova União", ibgeCode: "3144805", stateUf: "MG" },
  "SABARA": { name: "Sabará", ibgeCode: "3156700", stateUf: "MG" },
  "SANTA BARBARA": { name: "Santa Bárbara", ibgeCode: "3157203", stateUf: "MG" },
  "IPATINGA": { name: "Ipatinga", ibgeCode: "3131307", stateUf: "MG" },
  "CORONEL FABRICIANO": { name: "Coronel Fabriciano", ibgeCode: "3119401", stateUf: "MG" },
  "TIMOTEO": { name: "Timóteo", ibgeCode: "3168705", stateUf: "MG" },
  "ITABIRA": { name: "Itabira", ibgeCode: "3131703", stateUf: "MG" },
  "NOVA ERA": { name: "Nova Era", ibgeCode: "3144706", stateUf: "MG" },
  "OURO PRETO": { name: "Ouro Preto", ibgeCode: "3146107", stateUf: "MG" },
  "CONTAGEM": { name: "Contagem", ibgeCode: "3118601", stateUf: "MG" },
  "BETIM": { name: "Betim", ibgeCode: "3106705", stateUf: "MG" },
  "SAO PAULO": { name: "São Paulo", ibgeCode: "3550308", stateUf: "SP" },
  "RIO DE JANEIRO": { name: "Rio de Janeiro", ibgeCode: "3304557", stateUf: "RJ" },
  "CAMPINAS": { name: "Campinas", ibgeCode: "3509502", stateUf: "SP" },
  "POUSO ALEGRE": { name: "Pouso Alegre", ibgeCode: "3152501", stateUf: "MG" }
};

function normalizeCityKey(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function findIbgeCode(cityName: string): string | undefined {
  const key = normalizeCityKey(cityName);
  return KNOWN_MUNICIPALITIES[key]?.ibgeCode;
}

function getContextualSuggestions(orig: string, dest: string): IntermediateStopItem[] {
  const o = normalizeCityKey(orig);
  const d = normalizeCityKey(dest);

  if ((o.includes("MONLEVADE") && d.includes("BELO HORIZONTE")) ||
      (o.includes("BELO HORIZONTE") && d.includes("MONLEVADE"))) {
    return [
      { name: "Barão de Cocais", ibgeCode: "3105400" },
      { name: "Caeté", ibgeCode: "3110004" },
      { name: "Nova União", ibgeCode: "3144805" },
      { name: "Sabará", ibgeCode: "3156700" },
      { name: "Santa Bárbara", ibgeCode: "3157203" }
    ];
  }
  if ((o.includes("MONLEVADE") && d.includes("IPATINGA")) ||
      (o.includes("IPATINGA") && d.includes("MONLEVADE"))) {
    return [
      { name: "Nova Era", ibgeCode: "3144706" },
      { name: "Coronel Fabriciano", ibgeCode: "3119401" },
      { name: "Timóteo", ibgeCode: "3168705" }
    ];
  }
  if (o.includes("BELO HORIZONTE") && d.includes("SAO PAULO")) {
    return [
      { name: "Betim", ibgeCode: "3106705" },
      { name: "Pouso Alegre", ibgeCode: "3152501" },
      { name: "Campinas", ibgeCode: "3509502" }
    ];
  }
  // Sugestões contextuais gerais para qualquer rota (funcionamento nacional)
  return [
    { name: "Contagem", ibgeCode: "3118601" },
    { name: "Betim", ibgeCode: "3106705" },
    { name: "Itabira", ibgeCode: "3131703" },
    { name: "Ouro Preto", ibgeCode: "3146107" }
  ];
}

export default function CadastrarViagemPage(): React.JSX.Element {
  const router = useRouter();
  const { user, token } = useAuth();
  const isSubmittingRef = useRef(false);

  const [vehicleType, setVehicleType] = useState<VehicleTypeCode>("CAR");
  const [vehicleModel, setVehicleModel] = useState("Renault Duster (Porta-malas livre)");
  const [originCity, setOriginCity] = useState("João Monlevade");
  const [destinationCity, setDestinationCity] = useState("Belo Horizonte");
  const [stopsList, setStopsList] = useState<IntermediateStopItem[]>([
    { name: "Barão de Cocais", ibgeCode: "3105400", stateUf: "MG" },
    { name: "Caeté", ibgeCode: "3110004", stateUf: "MG" }
  ]);
  const [newStopInput, setNewStopInput] = useState("");
  const [departureDate, setDepartureDate] = useState("Amanhã (14/10)");
  const [departureTime, setDepartureTime] = useState("08:00");
  const [availableKg, setAvailableKg] = useState("15");
  const [flexiblePickup, setFlexiblePickup] = useState(true);
  const [pricePerKgReais, setPricePerKgReais] = useState("8,00");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxAllowedCapacityKg = vehicleType === "BICYCLE" ? 5 : 20;
  const parsedCapacityKg = parseFloat(availableKg.replace(",", "."));
  const isCapacityOverLimit = !isNaN(parsedCapacityKg) && parsedCapacityKg > maxAllowedCapacityKg;

  const handleAddStop = (cityToAdd?: string) => {
    const raw = (cityToAdd ?? newStopInput).trim();
    if (!raw) return;

    const ibge = findIbgeCode(raw);
    const existing = stopsList.some(
      (s) => normalizeCityKey(s.name) === normalizeCityKey(raw)
    );

    if (!existing) {
      setStopsList((prev) => [
        ...prev,
        {
          name: raw,
          ibgeCode: ibge,
          stateUf: "MG"
        }
      ]);
    }
    if (!cityToAdd) {
      setNewStopInput("");
    }
  };

  const handleRemoveStop = (stopName: string) => {
    setStopsList((prev) => prev.filter((s) => s.name !== stopName));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    if (isNaN(parsedCapacityKg) || parsedCapacityKg <= 0) {
      setErrorMsg("Informe uma capacidade disponível válida maior que zero.");
      return;
    }

    if (parsedCapacityKg > maxAllowedCapacityKg) {
      setErrorMsg(`A capacidade máxima para ${vehicleType === "BICYCLE" ? "Bicicleta" : "Moto/Carro"} é de ${maxAllowedCapacityKg} kg (D04).`);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const pricePerKgCents = Math.round(parseFloat(pricePerKgReais.replace(",", ".").replace(/[^0-9.]/g, "")) * 100) || 800;
    const stringStops = stopsList.map((s) => s.name);

    try {
      const payload: CreateTripPayload = {
        vehicleType,
        vehicleModel: vehicleModel.trim() || "Veículo cadastrado padrão",
        originCity,
        destinationCity,
        intermediateStops: stringStops,
        departureDate,
        departureTime,
        availableCapacityGrams: Math.round(parsedCapacityKg * 1000),
        flexiblePickup,
        suggestedPricePerKgCents: pricePerKgCents
      };

      const result = await createTripApi(payload, token ?? undefined);

      if (!result.ok) {
        const errorDetail = result.problem?.detail || result.problem?.title || "Erro ao registrar viagem na API.";
        setErrorMsg(errorDetail);
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        return;
      }

      // Sincroniza com a persistência de demonstração local para o fluxo do protótipo
      addDemoTrip({
        carrierName: user ? `${user.displayName} (${vehicleType === "BICYCLE" ? "Bike" : vehicleType === "MOTORCYCLE" ? "Moto" : "Carro"})` : "Transportador Demo BH",
        carrierKycVerified: user?.kycStatus === "VERIFIED",
        vehicleType,
        vehicleModel: vehicleModel.trim() || "Veículo não especificado",
        originCity,
        destinationCity,
        intermediateStops: stringStops,
        departureDate,
        departureTime,
        availableCapacityGrams: Math.round(parsedCapacityKg * 1000),
        flexiblePickup,
        suggestedPricePerKgCents: pricePerKgCents
      });

      setSuccessMsg("Viagem cadastrada com sucesso no backend da Topic Log! Sua rota já está disponível para receber encomendas no Feed.");
      setTimeout(() => {
        router.push("/feed");
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada ao registrar viagem.";
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
          Cadastrar Viagem / Rota com Espaço Livre
        </h1>
        <p style={{ color: "var(--color-muted)", margin: 0, fontSize: "15px" }}>
          Monetize seu deslocamento habitual em Minas Gerais aproveitando o bagageiro, baú ou porta-malas livre do seu veículo.
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
        {/* Bloco 1: Veículo e Modal */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            1. Modal de Transporte e Capacidade Ociosa (D03 / D04)
          </legend>

          {/* Cards Visuais de Seleção de Modal */}
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: "8px" }}>
              Selecione o seu modal para esta rota:
            </label>
            <div className="vehicle-selector-grid">
              <div
                className={`vehicle-card-option ${vehicleType === "CAR" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => {
                  setVehicleType("CAR");
                  setVehicleModel("Carro de Passeio / Utilitário");
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🚗</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Carro de Passeio</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Porta-malas livre</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", marginTop: "8px" }}>
                  Capacidade máx: 20 kg (D04)
                </div>
              </div>

              <div
                className={`vehicle-card-option ${vehicleType === "MOTORCYCLE" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => {
                  setVehicleType("MOTORCYCLE");
                  setVehicleModel("Moto com Baú Reforçado");
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🏍️</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Motocicleta</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Baú ou mochila cargueira</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400E", marginTop: "8px" }}>
                  Capacidade máx: 20 kg (D04)
                </div>
              </div>

              <div
                className={`vehicle-card-option ${vehicleType === "BICYCLE" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => {
                  setVehicleType("BICYCLE");
                  setVehicleModel("Bicicleta Urbana Cargueira");
                  if (parsedCapacityKg > 5) setAvailableKg("5");
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🚲</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Bicicleta</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Alforjes e bolsas</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#065F46", marginTop: "8px" }}>
                  Capacidade máx: 5 kg (D04)
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px" }}>
            <div className="form-group">
              <label htmlFor="trip-model" className="form-label">
                Modelo do Veículo / Compartimento
              </label>
              <input
                id="trip-model"
                type="text"
                placeholder="Ex: Fiat Strada (caçamba coberta), Honda CG 160..."
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="trip-capacity" className="form-label">
                Capacidade Disponível para Cargas (kg) *
              </label>
              <input
                id="trip-capacity"
                type="text"
                required
                placeholder="Ex: 15"
                value={availableKg}
                onChange={(e) => setAvailableKg(e.target.value)}
                className={`form-control ${isCapacityOverLimit ? "form-control--error" : ""}`}
              />
              <span style={{ fontSize: "11px", color: isCapacityOverLimit ? "var(--color-danger)" : "var(--color-muted)" }}>
                Limite regulamentar permitido: <strong>{maxAllowedCapacityKg} kg</strong> (D04)
              </span>
            </div>
          </div>
        </fieldset>

        {/* Bloco 2: Rota e Paradas */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            2. Trajeto em Minas Gerais e Paradas Intermediárias
          </legend>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div className="form-group">
              <label htmlFor="trip-orig" className="form-label">
                Cidade de Partida (Origem) *
              </label>
              <select
                id="trip-orig"
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
              <label htmlFor="trip-dest" className="form-label">
                Cidade de Chegada (Destino) *
              </label>
              <select
                id="trip-dest"
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
          </div>

          {/* Chips de Paradas Intermediárias Dinâmicas com Identificação IBGE */}
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: "4px" }}>
              Paradas Intermediárias ao Longo da Rota (Opcional):
            </label>
            <span style={{ fontSize: "12px", color: "var(--color-muted)", display: "block", marginBottom: "8px" }}>
              Identificação por código IBGE • Confirmação rápida por tecla Enter • Cobertura estadual e nacional
            </span>

            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Ex: Barão de Cocais, Caeté, Betim, Campinas..."
                value={newStopInput}
                onChange={(e) => setNewStopInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddStop();
                  }
                }}
                className="form-control"
                style={{ maxWidth: "360px", flex: "1 1 240px" }}
              />
              <button
                type="button"
                onClick={() => handleAddStop()}
                className="btn btn--outline"
                style={{ fontSize: "13px", padding: "8px 16px" }}
              >
                + Adicionar Parada
              </button>
            </div>

            {/* Sugestões Contextualizadas pelo Trajeto Selecionado */}
            {(() => {
              const suggestions = getContextualSuggestions(originCity, destinationCity).filter(
                (sug) => !stopsList.some((existing) => normalizeCityKey(existing.name) === normalizeCityKey(sug.name))
              );
              if (suggestions.length === 0) return null;

              return (
                <div style={{ marginTop: "6px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Sugestões no Trajeto ({originCity} ➔ {destinationCity}):
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {suggestions.map((sug) => (
                      <button
                        key={sug.name}
                        type="button"
                        onClick={() => handleAddStop(sug.name)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 9px",
                          borderRadius: "var(--radius-full)",
                          border: "1px dashed #93C5FD",
                          backgroundColor: "#F0F9FF",
                          color: "#0369A1",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                        title={`Adicionar ${sug.name} ao trajeto (Código IBGE: ${sug.ibgeCode})`}
                      >
                        <span>+ {sug.name}</span>
                        {sug.ibgeCode && (
                          <span style={{ fontSize: "9px", color: "#0284C7", opacity: 0.85 }}>
                            ({sug.ibgeCode})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Chips Removíveis com Código IBGE */}
            {stopsList.length > 0 ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                {stopsList.map((stop) => (
                  <span
                    key={stop.name}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 12px",
                      background: "#EFF6FF",
                      color: "#1E40AF",
                      border: "1px solid #BFDBFE",
                      borderRadius: "var(--radius-full)",
                      fontSize: "12px",
                      fontWeight: 600
                    }}
                  >
                    <span>📍 {stop.name}</span>
                    {stop.ibgeCode && (
                      <span
                        style={{
                          fontSize: "10px",
                          backgroundColor: "#DBEAFE",
                          color: "#1D4ED8",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: 700
                        }}
                        title={`Código IBGE oficial: ${stop.ibgeCode}`}
                      >
                        IBGE {stop.ibgeCode}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveStop(stop.name)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#DC2626",
                        cursor: "pointer",
                        fontWeight: 800,
                        padding: "0 2px",
                        fontSize: "13px",
                        lineHeight: 1
                      }}
                      title={`Remover parada ${stop.name}`}
                      aria-label={`Remover parada ${stop.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "var(--color-muted)", fontStyle: "italic" }}>
                Nenhuma parada intermediária adicionada (viagem direta de {originCity} para {destinationCity}).
              </div>
            )}
          </div>
        </fieldset>

        {/* Bloco 3: Horários e Remuneração */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            3. Datas, Horários e Remuneração por Quilo
          </legend>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div className="form-group">
              <label htmlFor="trip-date" className="form-label">
                Data Prevista de Saída *
              </label>
              <input
                id="trip-date"
                type="text"
                placeholder="Ex: Amanhã (14/10)"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="trip-time" className="form-label">
                Horário Estimado de Partida *
              </label>
              <input
                id="trip-time"
                type="text"
                placeholder="Ex: 08:00"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="trip-price-kg" className="form-label">
                Estimativa por kg (R$) *
              </label>
              <input
                id="trip-price-kg"
                type="text"
                placeholder="Ex: 8,00"
                value={pricePerKgReais}
                onChange={(e) => setPricePerKgReais(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          <div style={{ backgroundColor: "#F8FAFC", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={flexiblePickup}
                onChange={(e) => setFlexiblePickup(e.target.checked)}
                style={{ marginTop: "3px" }}
              />
              <div>
                <strong>Disponibilidade para coleta em endereço (Coleta Flexível):</strong>
                <div style={{ color: "var(--color-muted)", fontSize: "12px", marginTop: "2px" }}>
                  Se desmarcado, os remetentes deverão entregar o pacote no seu ponto de partida ou em ponto de encontro combinado.
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
            {isSubmitting ? "Cadastrando Viagem na API..." : "Publicar Viagem no Feed →"}
          </button>
        </div>
      </form>
    </main>
  );
}
