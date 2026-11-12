"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { StatusPill } from "../../components/StatusPill";
import { StarRatingDisplay } from "../../components/StarRatingDisplay";
import { changePasswordApi, getPublicUserCardApi, updatePrivateProfileApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { formatCpf, isValidCpf } from "../../lib/validation";
import { BRAZILIAN_STATES, formatCep, lookupCepViaCep } from "../../lib/brazil-address";
import type { ProblemDetailsDto, PublicUserCardResponse, UserRole } from "../../lib/types";

export default function MyAccountPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading, reloadProfile, refresh, logout } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editCpfTouched, setEditCpfTouched] = useState(false);
  const [editPostalCode, setEditPostalCode] = useState("");
  const [editCepLoading, setEditCepLoading] = useState(false);
  const [editStateUf, setEditStateUf] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editNeighborhood, setEditNeighborhood] = useState("");
  const [editComplement, setEditComplement] = useState("");
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState("");
  const [passwordStatusMsg, setPasswordStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [editRoles, setEditRoles] = useState<UserRole[]>(["SENDER"]);
  const [editVehicleType, setEditVehicleType] = useState<string>("CARRO");
  const [editVehicleModel, setEditVehicleModel] = useState<string>("");
  const [editVehiclePlate, setEditVehiclePlate] = useState<string>("");
  const [editRenavam, setEditRenavam] = useState<string>("");
  const [editVehicleYear, setEditVehicleYear] = useState<string>("");
  const [editCnhCategory, setEditCnhCategory] = useState<string>("B");
  const [editCnhNumber, setEditCnhNumber] = useState<string>("");
  const [editAcceptTerms, setEditAcceptTerms] = useState<boolean>(true);
  const [editPixKeyType, setEditPixKeyType] = useState<string>("CPF");
  const [editPixKey, setEditPixKey] = useState<string>("");
  const [editBankName, setEditBankName] = useState<string>("Mercado Pago");
  const [editMpAccountEmail, setEditMpAccountEmail] = useState<string>("");
  const [editCnhDocName, setEditCnhDocName] = useState<string>("");
  const [editCnhDocData, setEditCnhDocData] = useState<string>("");
  const [editCrlvDocName, setEditCrlvDocName] = useState<string>("");
  const [editCrlvDocData, setEditCrlvDocData] = useState<string>("");
  const [editIdentityDocName, setEditIdentityDocName] = useState<string>("");
  const [editIdentityDocData, setEditIdentityDocData] = useState<string>("");
  const [carrierValidationMsg, setCarrierValidationMsg] = useState<string | null>(null);

  const [publicCard, setPublicCard] = useState<PublicUserCardResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState<ProblemDetailsDto | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setName: (name: string) => void,
    setData: (data: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Carrega valores do perfil para edição
  useEffect(() => {
    if (user) {
      setEditDisplayName(user.displayName);
      setEditPhone("");
      setEditCpf("");
      setEditPostalCode(user.postalCode || "");
      setEditStateUf(user.stateUf || "");
      setEditCity(user.city || "");
      setEditStreet(user.street || "");
      setEditNumber(user.number || "");
      setEditNeighborhood(user.neighborhood || "");
      setEditComplement(user.complement || "");
      setEditRoles([...user.roles]);
      setEditVehicleType(user.vehicleType || "CARRO");
      setEditVehicleModel(user.vehicleModel || "");
      setEditVehiclePlate(user.vehiclePlate || "");
      setEditRenavam(user.renavam || "");
      setEditVehicleYear(user.vehicleYear || "");
      setEditCnhCategory(user.cnhCategory || "B");
      setEditCnhNumber(user.cnhNumber || "");
      setEditAcceptTerms(user.carrierTermsAccepted ?? true);
      setEditPixKeyType(user.pixKeyType || "CPF");
      setEditPixKey(user.pixKey || "");
      setEditBankName("Mercado Pago (Banco 323)");
      setEditMpAccountEmail(user.mpAccountEmail || user.email || "");
      setEditCnhDocName(user.cnhDocumentName || "");
      setEditCnhDocData(user.cnhDocumentData || "");
      setEditCrlvDocName(user.crlvDocumentName || "");
      setEditCrlvDocData(user.crlvDocumentData || "");
      setEditIdentityDocName(user.identityDocumentName || "");
      setEditIdentityDocData(user.identityDocumentData || "");
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

    if ((!user?.cpfMasked && !editCpf.trim()) || (editCpf.trim() && !isValidCpf(editCpf))) {
      setEditCpfTouched(true);
      setProblem({
        title: "CPF inválido ou ausente",
        status: 400,
        detail: "Informe um CPF válido com 11 dígitos e dígitos verificadores corretos."
      });
      const cpfEl = document.getElementById("edit-cpf") as HTMLInputElement | null;
      cpfEl?.focus();
      return;
    }

    if (editRoles.includes("CARRIER") && editPixKeyType === "CPF" && editPixKey.trim() && !isValidCpf(editPixKey)) {
      setCarrierValidationMsg("A Chave Pix informada do tipo CPF é inválida. Confira os 11 dígitos.");
      return;
    }

    if (editRoles.includes("CARRIER")) {
      if (!editVehiclePlate.trim()) {
        setCarrierValidationMsg("A placa do veículo é obrigatória.");
        return;
      }
      if (!editRenavam.trim()) {
        setCarrierValidationMsg("O número do RENAVAM é obrigatório.");
        return;
      }
      if (!editVehicleYear.trim()) {
        setCarrierValidationMsg("O ano de fabricação do veículo é obrigatório para o cálculo da idade da frota.");
        return;
      }
      if (!editCnhNumber.trim()) {
        setCarrierValidationMsg("O número da CNH é obrigatório para transportadores parceiros.");
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
        stateUf: editStateUf.trim().toUpperCase() || undefined,
        postalCode: editPostalCode.trim() || undefined,
        street: editStreet.trim() || undefined,
        number: editNumber.trim() || undefined,
        neighborhood: editNeighborhood.trim() || undefined,
        complement: editComplement.trim() || undefined,
        roles: editRoles,
        vehicleType: editRoles.includes("CARRIER") ? editVehicleType : undefined,
        vehicleModel: editRoles.includes("CARRIER") ? (editVehicleModel.trim() || undefined) : undefined,
        vehiclePlate: editRoles.includes("CARRIER") ? editVehiclePlate.trim().toUpperCase() : undefined,
        vehicleYear: editRoles.includes("CARRIER") ? editVehicleYear.trim() : undefined,
        renavam: editRoles.includes("CARRIER") ? editRenavam.trim() : undefined,
        cnhCategory: editRoles.includes("CARRIER") ? editCnhCategory : undefined,
        cnhNumber: editRoles.includes("CARRIER") ? editCnhNumber.trim() : undefined,
        acceptCarrierTerms: editRoles.includes("CARRIER") ? editAcceptTerms : undefined,
        pixKeyType: editRoles.includes("CARRIER") ? editPixKeyType : undefined,
        pixKey: editRoles.includes("CARRIER") ? editPixKey.trim() : undefined,
        bankName: editRoles.includes("CARRIER") ? editBankName.trim() : undefined,
        mpAccountEmail: editRoles.includes("CARRIER") ? editMpAccountEmail.trim() : undefined,
        identityDocumentName: editIdentityDocName || undefined,
        identityDocumentData: editIdentityDocData || undefined
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
            Você pode publicar pedidos de transporte e receber propostas de motoristas para qualquer município do Brasil.
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
            O que é o Perfil Verificado (Selo de Confiança)?
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", margin: "0 0 12px 0" }}>
            {user.kycStatus === "VERIFIED"
              ? "Sua identidade foi verificada automaticamente após o preenchimento completo de CPF, nome, endereço completo, e-mail e telefone (sem necessidade de envio de documentos)."
              : "Para passar para o status Verificado automaticamente (sem envio de documentos ou fotos), preencha todos os dados cadastrais: Nome completo, CPF válido, E-mail, Telefone e Endereço completo (CEP, Rua, Número, Bairro, Cidade e UF)."}
          </p>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="btn btn--outline"
              style={{ padding: "4px 12px", fontSize: "12px", borderColor: "#16A34A", color: "#16A34A", fontWeight: 700 }}
            >
              ✏️ {user.kycStatus === "VERIFIED" ? "Atualizar Dados Cadastrais" : "Completar Dados para Verificar"}
            </button>
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
              <p><strong>CEP:</strong> {user.postalCode || "Não informado"}</p>
              <p>
                <strong>Endereço:</strong>{" "}
                {user.street
                  ? `${user.street}${user.number ? `, ${user.number}` : ""}${user.neighborhood ? ` — ${user.neighborhood}` : ""}${user.complement ? ` (${user.complement})` : ""}`
                  : "Não informado"}
              </p>
              <p><strong>Cidade / UF:</strong> {user.city || "Não informada"}{user.stateUf ? ` - ${user.stateUf}` : ""}</p>
              <p>
                <strong>Meu Perfil:</strong>{" "}
                {user.roles.filter(r => r === "SENDER" || r === "CARRIER").map(r => (
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
                    {r === "SENDER" ? "Remetente" : "Transportador"}
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
                  {user.vehiclePlate || user.renavam || user.cnhNumber ? (
                    <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" }}>
                      <p style={{ margin: "2px 0" }}><strong>Tipo:</strong> {user.vehicleType === "MOTO" ? "Moto" : user.vehicleType === "VAN" ? "Van / Utilitário" : user.vehicleType === "CAMINHAO" ? "Caminhão" : user.vehicleType === "BICICLETA" ? "Bicicleta" : "Carro de Passeio"}</p>
                      {user.vehicleModel && <p style={{ margin: "2px 0" }}><strong>Modelo:</strong> {user.vehicleModel}</p>}
                      <p style={{ margin: "2px 0" }}><strong>Placa do Veículo:</strong> <span style={{ fontFamily: "monospace", fontWeight: 700, backgroundColor: "#DCFCE7", padding: "1px 6px", borderRadius: "4px" }}>{user.vehiclePlate || "Não informada"}</span></p>
                      <p style={{ margin: "2px 0" }}><strong>Número do RENAVAM:</strong> <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{user.renavam || "Não informado"}</span></p>
                      <p style={{ margin: "2px 0" }}><strong>Ano de Fabricação:</strong> {user.vehicleYear || "Não informado"}</p>
                      <p style={{ margin: "2px 0" }}><strong>Número da CNH:</strong> <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{user.cnhNumber || "Não informada"}</span> (Categoria {user.cnhCategory || "B"})</p>
                      <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "#166534" }}>
                        ✓ Veículo e habilitação cadastrados em conformidade com o Art. 299 CP e regras de idade da frota.
                      </p>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#92400E" }}>
                      ⚠️ <strong>Dados de veículo e CNH pendentes.</strong> Você possui perfil de transportador ativo. Clique em <em>&ldquo;Editar Dados&rdquo;</em> para informar Placa, RENAVAM, Ano de Fabricação e Número da CNH.
                    </div>
                  )}
                </div>
              )}

              {/* Seção de Dados Bancários para Recebimento de Repasses (Exclusivo Transportador) */}
              {user.roles.includes("CARRIER") && (
                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #E2E8F0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "16px" }}>💳</span>
                    <strong style={{ fontSize: "14px", color: "#0F172A" }}>Dados Bancários para Repasse de Frete (Mercado Pago Exclusivo)</strong>
                  </div>
                  {user.pixKey || user.mpAccountEmail ? (
                    <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "12px 14px", fontSize: "13px" }}>
                      <p style={{ margin: "2px 0" }}>
                        <strong>Instituição Financeira:</strong>{" "}
                        <span style={{ fontWeight: 700, color: "#047857" }}>Mercado Pago (Banco 323 - Homologado Exclusivo)</span>
                      </p>
                      <p style={{ margin: "4px 0" }}>
                        <strong>Chave Pix Mercado Pago:</strong>{" "}
                        <span style={{ fontFamily: "monospace", fontWeight: 700, backgroundColor: "#DCFCE7", padding: "2px 8px", borderRadius: "4px", border: "1px solid #86EFAC" }}>
                          {user.pixKey || "Não informada"}
                        </span>{" "}
                        ({user.pixKeyType || "CPF"})
                      </p>
                      {user.mpAccountEmail && (
                        <p style={{ margin: "4px 0" }}>
                          <strong>Conta Mercado Pago (Repasse Instantâneo):</strong> {user.mpAccountEmail}
                        </p>
                      )}
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed #BBF7D0", fontSize: "11px", color: "#166534", lineHeight: 1.4 }}>
                        ✓ Conta habilitada para split automático de fretes conforme Política Comercial vigente (85% Transportador / 15% Topic Log) e liquidação sob custódia garantida.
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: "#FEF2F2", border: "1.5px solid #FCA5A5", borderRadius: "8px", padding: "12px 14px", fontSize: "13px", color: "#991B1B" }}>
                      <strong>⚠️ Requisito Obrigatório: Chave Pix / Conta Mercado Pago não cadastrada.</strong>
                      <p style={{ margin: "4px 0 0 0", fontSize: "12px" }}>
                        Para receber a divisão e repasse dos seus fretes, clique em <em>&ldquo;Editar Dados&rdquo;</em> e cadastre sua chave Pix ou e-mail vinculados à sua conta Mercado Pago.
                      </p>
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
                {(() => {
                  const editCpfDigits = editCpf.replace(/\D/g, "");
                  const editCpfValid = isValidCpf(editCpf);
                  const showEditCpfStatus =
                    editCpfDigits.length > 0 && (editCpfDigits.length === 11 || editCpfTouched);
                  return (
                    <>
                      <input
                        id="edit-cpf"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={14}
                        className="form-input"
                        style={
                          showEditCpfStatus && !editCpfValid
                            ? { borderColor: "#DC2626" }
                            : showEditCpfStatus && editCpfValid
                              ? { borderColor: "#15803D" }
                              : undefined
                        }
                        placeholder="Deixe em branco para manter o atual"
                        value={editCpf}
                        onChange={e => setEditCpf(formatCpf(e.target.value))}
                        onBlur={() => setEditCpfTouched(true)}
                        disabled={isSaving}
                      />
                      {showEditCpfStatus && (
                        <div
                          style={{
                            marginTop: "6px",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: editCpfValid ? "#15803D" : "#DC2626"
                          }}
                        >
                          {editCpfValid
                            ? "✓ CPF Válido (Receita Federal)"
                            : editCpfDigits.length < 11
                              ? "⚠️ CPF incompleto: informe os 11 dígitos ou deixe em branco."
                              : "⚠️ CPF Inválido: confira os números digitados."}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="address-grid-uf-city" style={{ marginBottom: "14px" }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="edit-cep" className="form-label">
                    CEP {editCepLoading ? "..." : ""}
                  </label>
                  <input
                    id="edit-cep"
                    type="text"
                    inputMode="numeric"
                    maxLength={9}
                    className="form-input"
                    placeholder="00000-000"
                    value={editPostalCode}
                    onChange={async e => {
                      const formatted = formatCep(e.target.value);
                      setEditPostalCode(formatted);
                      const digits = formatted.replace(/\D/g, "");
                      if (digits.length === 8) {
                        setEditCepLoading(true);
                        const found = await lookupCepViaCep(digits);
                        setEditCepLoading(false);
                        if (found) {
                          if (found.street) setEditStreet(found.street);
                          if (found.neighborhood) setEditNeighborhood(found.neighborhood);
                          if (found.city) setEditCity(found.city);
                          if (found.stateUf) setEditStateUf(found.stateUf);
                        }
                      }
                    }}
                    disabled={isSaving}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="edit-uf" className="form-label">Estado (UF)</label>
                  <select
                    id="edit-uf"
                    className="form-input"
                    value={editStateUf}
                    onChange={e => setEditStateUf(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">UF...</option>
                    {BRAZILIAN_STATES.map(st => (
                      <option key={st.uf} value={st.uf}>{st.uf} - {st.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="edit-city" className="form-label">Cidade / Município (Todo o Brasil)</label>
                  <input
                    id="edit-city"
                    type="text"
                    className="form-input"
                    placeholder="Qualquer cidade do Brasil"
                    value={editCity}
                    onChange={e => setEditCity(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="address-grid-street" style={{ marginBottom: "14px" }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="edit-street" className="form-label">Rua / Logradouro</label>
                  <input
                    id="edit-street"
                    type="text"
                    className="form-input"
                    placeholder="Rua, Avenida..."
                    value={editStreet}
                    onChange={e => setEditStreet(e.target.value)}
                    disabled={isSaving}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="edit-number" className="form-label">Número</label>
                  <input
                    id="edit-number"
                    type="text"
                    className="form-input"
                    placeholder="Ex: 120"
                    value={editNumber}
                    onChange={e => setEditNumber(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="address-grid-half" style={{ marginBottom: "16px" }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="edit-neighborhood" className="form-label">Bairro</label>
                  <input
                    id="edit-neighborhood"
                    type="text"
                    className="form-input"
                    placeholder="Bairro"
                    value={editNeighborhood}
                    onChange={e => setEditNeighborhood(e.target.value)}
                    disabled={isSaving}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="edit-complement" className="form-label">Complemento (Opcional)</label>
                  <input
                    id="edit-complement"
                    type="text"
                    className="form-input"
                    placeholder="Apto, Bloco..."
                    value={editComplement}
                    onChange={e => setEditComplement(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
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
                      <label className="form-label" style={{ fontSize: "12px" }}>Modelo do Veículo</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: Fiat Strada"
                        value={editVehicleModel}
                        onChange={e => setEditVehicleModel(e.target.value)}
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "12px" }}>Placa do Veículo *</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="Ex: ABC1D23"
                        maxLength={8}
                        value={editVehiclePlate}
                        onChange={e => setEditVehiclePlate(e.target.value.toUpperCase())}
                        disabled={isSaving}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "12px" }}>Número do RENAVAM *</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="Ex: 00987654321"
                        maxLength={11}
                        value={editRenavam}
                        onChange={e => setEditRenavam(e.target.value.replace(/\D/g, ""))}
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "12px" }}>Ano de Fabricação * (Cálculo da idade do veículo)</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="Ex: 2023"
                        maxLength={4}
                        value={editVehicleYear}
                        onChange={e => setEditVehicleYear(e.target.value.replace(/\D/g, ""))}
                        disabled={isSaving}
                      />
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

                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label className="form-label" style={{ fontSize: "12px" }}>Número da CNH * (Campo obrigatório que substitui fotos)</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Ex: 04982314560"
                      maxLength={11}
                      value={editCnhNumber}
                      onChange={e => setEditCnhNumber(e.target.value.replace(/\D/g, ""))}
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
                      Declaro sob as penas da lei (Art. 299 CP) que sou o condutor habilitado do veículo acima, possuo CNH válida compatível com a categoria, RENAVAM regularizado e que o veículo não possui restrição judicial ou administrativa para circular.
                    </span>
                  </label>
                </div>
              )}

              {/* Seção Bancária e Chave Pix para Recebimento de Repasses */}
              {/* Seção Condicional de Dados Bancários — Exclusiva para Transportador */}
              {editRoles.includes("CARRIER") && (
              <div
                style={{
                  backgroundColor: "#EFF6FF",
                  border: "1.5px solid #3B82F6",
                  borderRadius: "10px",
                  padding: "16px",
                  margin: "16px 0"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "20px" }}>💳</span>
                  <strong style={{ fontSize: "15px", color: "#1E40AF" }}>
                    Dados Bancários Homologados para Split & Repasses (Mercado Pago Exclusivo)
                  </strong>
                </div>

                {/* Aviso Regulatório Obrigatório */}
                <div
                  style={{
                    backgroundColor: "#FEF2F2",
                    border: "1.5px solid #FCA5A5",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    marginBottom: "14px",
                    fontSize: "12px",
                    color: "#991B1B",
                    lineHeight: 1.5
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 800, marginBottom: "4px" }}>
                    <span>⚠️</span> AVISO OBRIGATÓRIO: CONTA NO MERCADO PAGO EXIGIDA
                  </div>
                  Para viabilizar a divisão automatizada de valores (split financeiro entre transportador e plataforma) e o repasse seguro dos fretes, <strong>a única instituição financeira aceita é o Mercado Pago (Banco 323)</strong>. É obrigatório que o transportador possua conta ativa no Mercado Pago. Sua chave Pix e e-mail informados abaixo devem pertencer a essa conta.
                </div>

                <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>
                      Instituição Financeira Homologada *
                    </label>
                    <select
                      className="form-input"
                      value="Mercado Pago (Banco 323)"
                      disabled={true}
                      style={{ backgroundColor: "#F1F5F9", fontWeight: 700, color: "#0F172A", cursor: "not-allowed" }}
                    >
                      <option value="Mercado Pago (Banco 323)">Mercado Pago (Banco 323 - Exclusivo para Split & Repasses)</option>
                    </select>
                    <small style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Única instituição autorizada para split automático e repasses ao transportador na TopicLog.
                    </small>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>Tipo de Chave Pix (no Mercado Pago) *</label>
                    <select
                      className="form-input"
                      value={editPixKeyType}
                      onChange={e => setEditPixKeyType(e.target.value)}
                      disabled={isSaving}
                    >
                      <option value="CPF">CPF (Registrado no Mercado Pago)</option>
                      <option value="CNPJ">CNPJ (Registrado no Mercado Pago)</option>
                      <option value="EMAIL">E-mail da Conta Mercado Pago</option>
                      <option value="TELEFONE">Telefone Celular</option>
                      <option value="ALEATORIA">Chave Aleatória (EVP)</option>
                    </select>
                  </div>
                </div>

                <div className="grid-two" style={{ gap: "10px", marginBottom: "10px" }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>Sua Chave Pix (Mercado Pago)</label>
                    <input
                      type="text"
                      className="form-input"
                      maxLength={editPixKeyType === "CPF" ? 14 : undefined}
                      placeholder={editPixKeyType === "CPF" ? "000.000.000-00" : "Ex: seu CPF ou e-mail cadastrado no Mercado Pago"}
                      value={editPixKey}
                      onChange={e =>
                        setEditPixKey(editPixKeyType === "CPF" ? formatCpf(e.target.value) : e.target.value)
                      }
                      disabled={isSaving}
                    />
                    {editPixKeyType === "CPF" && editPixKey.replace(/\D/g, "").length > 0 && (
                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: isValidCpf(editPixKey) ? "#15803D" : "#DC2626"
                        }}
                      >
                        {isValidCpf(editPixKey)
                          ? "✓ CPF Válido (Receita Federal)"
                          : editPixKey.replace(/\D/g, "").length < 11
                            ? "⚠️ CPF incompleto: informe os 11 dígitos."
                            : "⚠️ CPF Inválido: confira os números digitados."}
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>E-mail da Conta Mercado Pago</label>
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
              )}

              {carrierValidationMsg && (
                <div style={{ backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "10px 14px", color: "#991B1B", fontSize: "13px", fontWeight: 600, marginTop: "12px" }}>
                  ⚠️ {carrierValidationMsg}
                </div>
              )}

              {problem && (
                <div style={{ backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "10px 14px", color: "#991B1B", fontSize: "13px", fontWeight: 600, marginTop: "12px" }}>
                  ⚠️ {problem.detail || problem.title || "Erro ao atualizar dados."}
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
          Segurança da Conta e Alteração de Senha
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "16px" }}>
          Defina uma senha forte exclusiva (mínimo 8 caracteres com letras e números). Nunca compartilhe sua senha com terceiros.
        </p>

        <form
          onSubmit={async e => {
            e.preventDefault();
            setPasswordStatusMsg(null);
            if (!token) return;
            if (!currentPasswordInput || !newPasswordInput || !confirmNewPasswordInput) {
              setPasswordStatusMsg({ ok: false, text: "Preencha a senha atual, a nova senha e a confirmação." });
              return;
            }
            if (newPasswordInput.length < 8) {
              setPasswordStatusMsg({ ok: false, text: "A nova senha deve ter no mínimo 8 caracteres (letras e números)." });
              return;
            }
            if (newPasswordInput !== confirmNewPasswordInput) {
              setPasswordStatusMsg({ ok: false, text: "A confirmação da nova senha não confere." });
              return;
            }
            setIsChangingPassword(true);
            try {
              const res = await changePasswordApi(token, {
                currentPassword: currentPasswordInput,
                newPassword: newPasswordInput
              });
              if (res.ok) {
                setPasswordStatusMsg({ ok: true, text: "✓ Senha alterada com sucesso! Use a nova senha nos próximos acessos." });
                setCurrentPasswordInput("");
                setNewPasswordInput("");
                setConfirmNewPasswordInput("");
              } else {
                setPasswordStatusMsg({ ok: false, text: res.problem?.detail || "Não foi possível alterar a senha." });
              }
            } finally {
              setIsChangingPassword(false);
            }
          }}
          style={{ marginBottom: "20px", maxWidth: "520px" }}
        >
          {passwordStatusMsg && (
            <div
              role="status"
              style={{
                marginBottom: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: passwordStatusMsg.ok ? "#ECFDF5" : "#FEF2F2",
                color: passwordStatusMsg.ok ? "#065F46" : "#991B1B",
                border: `1px solid ${passwordStatusMsg.ok ? "#A7F3D0" : "#FECACA"}`
              }}
            >
              {passwordStatusMsg.text}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="sec-current-pw" className="form-label">Senha atual</label>
            <input
              id="sec-current-pw"
              type="password"
              className="form-input"
              value={currentPasswordInput}
              onChange={e => setCurrentPasswordInput(e.target.value)}
              disabled={isChangingPassword}
            />
          </div>

          <div className="grid-two" style={{ gap: "12px" }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="sec-new-pw" className="form-label">Nova senha forte</label>
              <input
                id="sec-new-pw"
                type="password"
                className="form-input"
                placeholder="Mín. 8 chars (letras + números)"
                value={newPasswordInput}
                onChange={e => setNewPasswordInput(e.target.value)}
                disabled={isChangingPassword}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="sec-confirm-pw" className="form-label">Confirmar nova senha</label>
              <input
                id="sec-confirm-pw"
                type="password"
                className="form-input"
                placeholder="Repita a nova senha"
                value={confirmNewPasswordInput}
                onChange={e => setConfirmNewPasswordInput(e.target.value)}
                disabled={isChangingPassword}
              />
            </div>
          </div>

          <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isChangingPassword}
              style={{ padding: "10px 18px", fontSize: "14px", fontWeight: 700 }}
            >
              {isChangingPassword ? "Salvando nova senha..." : "🔐 Atualizar Senha"}
            </button>

            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void logout()}
              style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700 }}
            >
              🚪 Sair da Conta (Encerrar Sessão)
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
