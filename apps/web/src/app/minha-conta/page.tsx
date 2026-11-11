"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { StatusPill } from "../../components/StatusPill";
import { StarRatingDisplay } from "../../components/StarRatingDisplay";
import { getPublicUserCardApi, updatePrivateProfileApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { ProblemDetailsDto, PublicUserCardResponse, UserRole } from "../../lib/types";

export default function MyAccountPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading, reloadProfile, refresh, logout } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editRoles, setEditRoles] = useState<UserRole[]>(["SENDER"]);
  const [editVehicleType, setEditVehicleType] = useState<string>("CARRO");
  const [editVehicleModel, setEditVehicleModel] = useState<string>("");
  const [editVehiclePlate, setEditVehiclePlate] = useState<string>("");
  const [editVehicleYear, setEditVehicleYear] = useState<string>("");
  const [editCnhCategory, setEditCnhCategory] = useState<string>("B");
  const [editAcceptTerms, setEditAcceptTerms] = useState<boolean>(true);
  const [editPixKeyType, setEditPixKeyType] = useState<string>("CPF");
  const [editPixKey, setEditPixKey] = useState<string>("");
  const [editBankName, setEditBankName] = useState<string>("Mercado Pago");
  const [editMpAccountEmail, setEditMpAccountEmail] = useState<string>("");
  const [carrierValidationMsg, setCarrierValidationMsg] = useState<string | null>(null);

  const [publicCard, setPublicCard] = useState<PublicUserCardResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState<ProblemDetailsDto | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Carrega valores do perfil para edição
  useEffect(() => {
    if (user) {
      setEditDisplayName(user.displayName);
      setEditPhone("");
      setEditCpf("");
      setEditCity(user.city);
      setEditRoles([...user.roles]);
      setEditVehicleType(user.vehicleType || "CARRO");
      setEditVehicleModel(user.vehicleModel || "");
      setEditVehiclePlate(user.vehiclePlate || "");
      setEditVehicleYear(user.vehicleYear || "");
      setEditCnhCategory(user.cnhCategory || "B");
      setEditAcceptTerms(user.carrierTermsAccepted ?? true);
      setEditPixKeyType(user.pixKeyType || "CPF");
      setEditPixKey(user.pixKey || "");
      setEditBankName(user.bankName || "Mercado Pago");
      setEditMpAccountEmail(user.mpAccountEmail || user.email || "");
    }
  }, [user]);

  // Carrega cartão público mínimo para demonstrar minimização de dados LGPD
  useEffect(() => {
    let isMounted = true;
    if (token && user?.userId) {
      void getPublicUserCardApi(token, user.userId).then(res => {
        if (isMounted && res.ok && res.data) {
          setPublicCard(res.data);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [token, user?.userId]);

  const handleRoleToggle = (role: UserRole) => {
    setEditRoles(prev => {
      if (prev.includes(role)) {
        if (prev.length === 1) return prev; // Ao menos 1 papel obrigatório
        return prev.filter(r => r !== role);
      }
      return [...prev, role];
    });
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setProblem(null);
    setSuccessMessage(null);
    setCarrierValidationMsg(null);

    if (editRoles.includes("CARRIER")) {
      if (!editVehicleModel.trim() || !editVehiclePlate.trim()) {
        setCarrierValidationMsg("Para atuar como Transportador, o Modelo e a Placa do veículo são obrigatórios.");
        return;
      }
      if (!editAcceptTerms) {
        setCarrierValidationMsg("É necessário aceitar os termos de responsabilidade sobre o veículo e condução.");
        return;
      }
    }

    setIsSaving(true);

    try {
      const result = await updatePrivateProfileApi(token, {
        displayName: editDisplayName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        cpf: editCpf.trim() || undefined,
        city: editCity.trim() || undefined,
        stateUf: "MG",
        roles: editRoles,
        vehicleType: editRoles.includes("CARRIER") ? editVehicleType : undefined,
        vehicleModel: editRoles.includes("CARRIER") ? editVehicleModel.trim() : undefined,
        vehiclePlate: editRoles.includes("CARRIER") ? editVehiclePlate.trim().toUpperCase() : undefined,
        vehicleYear: editRoles.includes("CARRIER") ? editVehicleYear.trim() || undefined : undefined,
        cnhCategory: editRoles.includes("CARRIER") ? editCnhCategory : undefined,
        acceptCarrierTerms: editRoles.includes("CARRIER") ? editAcceptTerms : undefined,
        pixKeyType: editRoles.includes("CARRIER") ? editPixKeyType : undefined,
        pixKey: editRoles.includes("CARRIER") ? editPixKey.trim() : undefined,
        bankName: editRoles.includes("CARRIER") ? editBankName.trim() : undefined,
        mpAccountEmail: editRoles.includes("CARRIER") ? editMpAccountEmail.trim() : undefined
      });

      if (result.ok && result.data) {
        setSuccessMessage("Perfil privado atualizado com sucesso no backend!");
        setIsEditing(false);
        await reloadProfile();
      } else {
        setProblem(result.problem ?? {
          title: "Falha na atualização do perfil",
          status: result.status,
          detail: "Não foi possível atualizar o perfil."
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
        <div className="card" aria-busy="true">
          <p style={{ margin: 0, color: "var(--color-muted)" }}>Carregando dados da conta...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
        <div className="card" style={{ maxWidth: "540px", margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", marginTop: 0 }}>Acesso Restrito</h1>
          <p style={{ color: "var(--color-muted)", marginBottom: "20px" }}>
            Você precisa estar autenticado para acessar a página Minha Conta.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <Link href="/entrar" className="btn btn--primary">
              Fazer Login
            </Link>
            <Link href="/cadastro" className="btn btn--outline">
              Criar Conta Gratuita
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <header className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
              TopicLog • Minha Conta
            </span>
            <h1 style={{ fontSize: "28px", lineHeight: "36px", margin: "6px 0 0 0" }}>
              Olá, {user.displayName}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <StatusPill
              label={user.kycStatus === "VERIFIED" ? "Identidade Confirmada" : "Cadastro Ativo"}
              tone={user.kycStatus === "VERIFIED" ? "success" : "neutral"}
            />
          </div>
        </div>
      </header>

      {successMessage && (
        <AlertBanner tone="success" title="Sucesso" message={successMessage} onClose={() => setSuccessMessage(null)} />
      )}

      {problem && (
        <AlertBanner
          tone="danger"
          title={problem.title}
          message={problem.detail}
          problem={problem}
          onClose={() => setProblem(null)}
        />
      )}

      {/* Painéis de Status e Verificação da Conta */}
      <section className="grid-two" style={{ marginBottom: "24px" }} aria-label="Status da conta e segurança">
        <div className="card" style={{ borderLeft: "4px solid var(--color-success)" }}>
          <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
            Envio de Encomendas
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", margin: "0 0 12px 0" }}>
            Você pode publicar pedidos de transporte e receber propostas de motoristas para qualquer localidade de Minas Gerais.
          </p>
          <StatusPill label="Envios Liberados na Plataforma" tone="success" />
        </div>

        <div
          className="card"
          style={{
            borderLeft: `4px solid ${user.kycStatus === "VERIFIED" ? "var(--color-success)" : "#3B82F6"}`
          }}
        >
          <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
            Verificação de Identidade
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", margin: "0 0 12px 0" }}>
            {user.kycStatus === "VERIFIED"
              ? "Sua identidade foi confirmada e sua conta possui selo de confiança na plataforma."
              : "Seus dados básicos estão ativos. Você pode enviar seus documentos para obter o selo de perfil verificado quando desejar."}
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <StatusPill
              label={user.kycStatus === "VERIFIED" ? "Perfil com Selo Verificado" : "Cadastro Básico Concluído"}
              tone={user.kycStatus === "VERIFIED" ? "success" : "neutral"}
            />
            {user.kycStatus !== "VERIFIED" && (
              <Link href="/verificacao-kyc" className="btn btn--secondary" style={{ padding: "4px 12px", fontSize: "13px" }}>
                Verificar Documentos
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Meus Dados vs. Perfil Público */}
      <div className="grid-two" style={{ marginBottom: "24px" }}>
        {/* Painel de Dados Cadastrais */}
        <section className="card" aria-labelledby="private-profile-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 id="private-profile-heading" style={{ fontSize: "20px", margin: 0 }}>
              Meus Dados Cadastrais
            </h2>
            <button
              type="button"
              className="btn btn--outline"
              style={{ padding: "4px 10px", fontSize: "13px" }}
              onClick={() => setIsEditing(prev => !prev)}
            >
              {isEditing ? "Cancelar Edição" : "Editar Dados"}
            </button>
          </div>

          {!isEditing ? (
            <div style={{ fontSize: "14px", lineHeight: "24px" }}>
              <p><strong>Nome:</strong> {user.displayName}</p>
              <p><strong>E-mail:</strong> {user.email}</p>
              <p><strong>Telefone:</strong> {user.phoneMasked}</p>
              <p><strong>CPF:</strong> {user.cpfMasked ?? "Não informado"}</p>
              <p><strong>Município:</strong> {user.city} - {user.stateUf}</p>
              <p>
                <strong>Meu Perfil:</strong>{" "}
                {user.roles.map(r => (
                  <span
                    key={r}
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      marginRight: "6px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--color-primary-bg)",
                      color: "var(--color-primary)",
                      fontWeight: 600,
                      fontSize: "12px"
                    }}
                  >
                    {r === "SENDER" ? "Remetente" : r === "CARRIER" ? "Transportador" : "Destinatário"}
                  </span>
                ))}
              </p>

              {/* Seção do Veículo (para Transportadores) */}
              {(user.roles.includes("CARRIER") || user.vehiclePlate || user.vehicleModel) && (
                <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid #E2E8F0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "16px" }}>🚗</span>
                    <strong style={{ fontSize: "14px", color: "#0F172A" }}>Dados do Veículo e Habilitação</strong>
                  </div>
                  {user.vehicleModel || user.vehiclePlate ? (
                    <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" }}>
                      <p style={{ margin: "2px 0" }}><strong>Tipo:</strong> {user.vehicleType === "MOTO" ? "Moto" : user.vehicleType === "VAN" ? "Van / Utilitário" : user.vehicleType === "CAMINHAO" ? "Caminhão" : user.vehicleType === "BICICLETA" ? "Bicicleta" : "Carro de Passeio"}</p>
                      <p style={{ margin: "2px 0" }}><strong>Modelo:</strong> {user.vehicleModel || "Não especificado"}</p>
                      <p style={{ margin: "2px 0" }}><strong>Placa:</strong> <span style={{ fontFamily: "monospace", fontWeight: 700, backgroundColor: "#DCFCE7", padding: "1px 6px", borderRadius: "4px" }}>{user.vehiclePlate || "Não informada"}</span></p>
                      {user.vehicleYear && <p style={{ margin: "2px 0" }}><strong>Ano:</strong> {user.vehicleYear}</p>}
                      <p style={{ margin: "2px 0" }}><strong>Categoria CNH:</strong> {user.cnhCategory || "B"}</p>
                      <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "#166534" }}>
                        ✓ Declaração de responsabilidade legal (Art. 299 CP, CRLV regularizado e CNH compatível).
                      </p>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#92400E" }}>
                      ⚠️ <strong>Nenhum veículo cadastrado.</strong> Você possui perfil de transportador ativo. Clique em <em>&ldquo;Editar Dados&rdquo;</em> para informar o modelo e a placa do seu veículo.
                    </div>
                  )}
                </div>
              )}

              {/* Seção de Dados Bancários para Recebimento de Repasses */}
              {(user.roles.includes("CARRIER") || user.pixKey || user.bankName) && (
                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #E2E8F0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "16px" }}>💳</span>
                    <strong style={{ fontSize: "14px", color: "#0F172A" }}>Dados Bancários para Repasse de Frete</strong>
                  </div>
                  {user.pixKey || user.mpAccountEmail ? (
                    <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" }}>
                      <p style={{ margin: "2px 0" }}><strong>Instituição / Banco:</strong> {user.bankName || "Mercado Pago"}</p>
                      <p style={{ margin: "2px 0" }}><strong>Chave Pix:</strong> <span style={{ fontFamily: "monospace", fontWeight: 700, backgroundColor: "#DCFCE7", padding: "1px 6px", borderRadius: "4px" }}>{user.pixKey || "Não informada"}</span> ({user.pixKeyType || "CPF"})</p>
                      {user.mpAccountEmail && (
                        <p style={{ margin: "2px 0" }}><strong>Conta Mercado Pago (Repasse Instantâneo):</strong> {user.mpAccountEmail}</p>
                      )}
                      <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "#166534" }}>
                        ✓ Conta cadastrada para receber repasses em custódia após entrega validada por PIN.
                      </p>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#92400E" }}>
                      ⚠️ <strong>Chave Pix / Conta bancária não cadastrada.</strong> Para receber o repasse líquido dos seus fretes, clique em <em>&ldquo;Editar Dados&rdquo;</em> e informe sua chave Pix ou conta Mercado Pago.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label htmlFor="edit-name" className="form-label">Nome completo ou comercial</label>
                <input
                  id="edit-name"
                  type="text"
                  className="form-input"
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-phone" className="form-label">Novo Telefone (opcional)</label>
                <input
                  id="edit-phone"
                  type="tel"
                  className="form-input"
                  placeholder="Deixe em branco para manter o atual"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-cpf" className="form-label">Novo CPF (opcional)</label>
                <input
                  id="edit-cpf"
                  type="text"
                  className="form-input"
                  placeholder="Deixe em branco para manter o atual"
                  value={editCpf}
                  onChange={e => setEditCpf(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-city" className="form-label">Município (MG)</label>
                <input
                  id="edit-city"
                  type="text"
                  className="form-input"
                  value={editCity}
                  onChange={e => setEditCity(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <fieldset className="form-group" style={{ border: "none", padding: 0 }}>
                <legend className="form-label" style={{ marginBottom: "6px" }}>Papéis ativos</legend>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("SENDER")}
                      onChange={() => handleRoleToggle("SENDER")}
                    />
                    Remetente (Enviar encomendas)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("CARRIER")}
                      onChange={() => handleRoleToggle("CARRIER")}
                    />
                    Transportador (Realizar transportes)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("RECIPIENT")}
                      onChange={() => handleRoleToggle("RECIPIENT")}
                    />
                    Destinatário (Receber)
                  </label>
                </div>
              </fieldset>

              {/* Seção Condicional de Veículo ao Ativar Transportador */}
              {editRoles.includes("CARRIER") && (
                <div
                  style={{
                    backgroundColor: "#F0FDF4",
                    border: "1px solid #86EFAC",
                    borderRadius: "10px",
                    padding: "16px",
                    margin: "16px 0"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "18px" }}>🚗</span>
                    <strong style={{ fontSize: "14px", color: "#14532D" }}>
                      Cadastro do Veículo & Habilitação (Obrigatório para Transportador)
                    </strong>
                  </div>

                  {carrierValidationMsg && (
                    <div style={{ fontSize: "12px", color: "#DC2626", backgroundColor: "#FEF2F2", padding: "8px 10px", borderRadius: "6px", border: "1px solid #FECACA", marginBottom: "12px" }}>
                      ⚠️ {carrierValidationMsg}
                    </div>
                  )}

                  <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "12px" }}>Tipo de Veículo *</label>
                      <select
                        className="form-input"
                        value={editVehicleType}
                        onChange={e => setEditVehicleType(e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="CARRO">Carro de Passeio</option>
                        <option value="MOTO">Moto</option>
                        <option value="VAN">Van / Utilitário</option>
                        <option value="CAMINHAO">Caminhão</option>
                        <option value="BICICLETA">Bicicleta</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "12px" }}>Categoria CNH *</label>
                      <select
                        className="form-input"
                        value={editCnhCategory}
                        onChange={e => setEditCnhCategory(e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="A">Categoria A (Moto)</option>
                        <option value="B">Categoria B (Carro)</option>
                        <option value="AB">Categoria AB (Carro e Moto)</option>
                        <option value="C">Categoria C (Carga)</option>
                        <option value="D">Categoria D (Passageiros/Van)</option>
                        <option value="E">Categoria E (Pesado/Articulado)</option>
                        <option value="ACC">ACC (Ciclomotor)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "12px" }}>Modelo do Veículo *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: Fiat Strada, Hyundai HB20"
                        value={editVehicleModel}
                        onChange={e => setEditVehicleModel(e.target.value)}
                        disabled={isSaving}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "12px" }}>Placa do Veículo *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: ABC1D23"
                        maxLength={8}
                        value={editVehiclePlate}
                        onChange={e => setEditVehiclePlate(e.target.value.toUpperCase())}
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label className="form-label" style={{ fontSize: "12px" }}>Ano de Fabricação (Opcional)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Ex: 2022"
                      value={editVehicleYear}
                      onChange={e => setEditVehicleYear(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>

                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "#166534" }}>
                    <input
                      type="checkbox"
                      checked={editAcceptTerms}
                      onChange={e => setEditAcceptTerms(e.target.checked)}
                      style={{ marginTop: "2px" }}
                    />
                    <span>
                      Declaro sob as penas da lei (Art. 299 CP) que sou o condutor habilitado do veículo acima, possuo CNH válida compatível com a categoria, CRLV regularizado e que o veículo não possui restrição judicial ou administrativa para circular.
                    </span>
                  </label>

                  {/* Seção Bancária e Chave Pix para Recebimento */}
                  <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed #86EFAC" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                      <span style={{ fontSize: "16px" }}>💳</span>
                      <strong style={{ fontSize: "13px", color: "#14532D" }}>
                        Dados Bancários e Chave Pix para Recebimento de Repasses
                      </strong>
                    </div>

                    <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: "12px" }}>Banco / Instituição</label>
                        <select
                          className="form-input"
                          value={editBankName}
                          onChange={e => setEditBankName(e.target.value)}
                          disabled={isSaving}
                        >
                          <option value="Mercado Pago">Mercado Pago (Recomendado)</option>
                          <option value="Nubank">Nubank</option>
                          <option value="Banco do Brasil">Banco do Brasil</option>
                          <option value="Itaú">Itaú Unibanco</option>
                          <option value="Bradesco">Bradesco</option>
                          <option value="Caixa Econômica">Caixa Econômica</option>
                          <option value="Banco Inter">Banco Inter</option>
                          <option value="Santander">Santander</option>
                          <option value="Outro">Outra Instituição Financeira</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: "12px" }}>Tipo de Chave Pix</label>
                        <select
                          className="form-input"
                          value={editPixKeyType}
                          onChange={e => setEditPixKeyType(e.target.value)}
                          disabled={isSaving}
                        >
                          <option value="CPF">CPF</option>
                          <option value="CNPJ">CNPJ</option>
                          <option value="EMAIL">E-mail</option>
                          <option value="TELEFONE">Telefone Celular</option>
                          <option value="ALEATORIA">Chave Aleatória (EVP)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: "12px" }}>Sua Chave Pix</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Informe sua chave Pix para receber os fretes"
                          value={editPixKey}
                          onChange={e => setEditPixKey(e.target.value)}
                          disabled={isSaving}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: "12px" }}>E-mail Mercado Pago (opcional)</label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="seu.email@mercadopago.com"
                          value={editMpAccountEmail}
                          onChange={e => setEditMpAccountEmail(e.target.value)}
                          disabled={isSaving}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button type="submit" className="btn btn--primary" disabled={isSaving}>
                  {isSaving ? "Salvando..." : "Gravar Alterações"}
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Pré-visualização do Perfil Público (Privacidade LGPD) */}
        <section className="card" aria-labelledby="public-card-heading">
          <h2 id="public-card-heading" style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
            Como outros usuários veem você (Perfil Público)
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Para garantir sua privacidade conforme a LGPD, seu e-mail, telefone particular e CPF <strong>nunca são exibidos</strong> publicamente. Apenas seu primeiro nome, cidade e reputação ficam visíveis.
          </p>

          {publicCard ? (
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-background)",
                border: "1px solid var(--color-border)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "16px" }}>{publicCard.abbreviatedDisplayName}</strong>
                <StatusPill
                  label={publicCard.isKycVerified ? "Identidade Verificada" : "Não verificado"}
                  tone={publicCard.isKycVerified ? "success" : "neutral"}
                />
              </div>

              <p style={{ margin: "4px 0", color: "var(--color-muted)", fontSize: "13px" }}>
                Localidade: {publicCard.city} - {publicCard.stateUf}
              </p>

              <p style={{ margin: "4px 0", fontSize: "13px" }}>
                Papéis na plataforma: {publicCard.publicRoles.map(r => r === "SENDER" ? "Remetente" : r === "CARRIER" ? "Transportador" : "Destinatário").join(", ")}
              </p>

              <div style={{ margin: "8px 0 0 0", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", color: "var(--color-brand-deep-navy)", fontWeight: 700 }}>
                  Avaliação Pública:
                </span>
                <StarRatingDisplay
                  size="sm"
                  ratingAvg={publicCard.ratingAvg}
                  ratingCount={publicCard.ratingCount}
                  showBadgeWhenEmpty={true}
                />
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--color-muted)" }}>Carregando dados do perfil...</p>
          )}
        </section>
      </div>

      {/* Segurança da Conta e Encerramento de Sessão */}
      <section className="card">
        <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
          Segurança da Conta
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "16px" }}>
          Sua conta está conectada de forma segura com proteção de dados e autenticação criptográfica.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void logout()}
            style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700 }}
          >
            🚪 Sair da Conta (Encerrar Sessão)
          </button>
        </div>
      </section>
    </main>
  );
}
