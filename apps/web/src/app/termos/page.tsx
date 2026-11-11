"use client";

import Link from "next/link";
import React, { useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { StatusPill } from "../../components/StatusPill";

export default function TermsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<
    "REMETER" | "TRANSPORTADOR" | "PROIBIDOS" | "OPERACIONAL" | "PRIVACIDADE"
  >("REMETER");

  const termsMeta = {
    version: "2026.2-PROD",
    documentId: "TL-LEGAL-2026-V2",
    vigenceDate: "26 de Outubro de 2026",
    sha256Hash: "8b1a9953c4611296a827abf8c47804d7e008ee71ca6be355a2c262110c4d2843",
    status: "MINUTA PRELIMINAR PARA VALIDAÇÃO JURÍDICA"
  };

  return (
    <main id="main-content" className="container" style={{ paddingTop: "28px", paddingBottom: "64px", maxWidth: "980px" }}>
      {/* Alerta de Minuta Preliminar para Validação Jurídica (Regra 8) */}
      <div
        style={{
          backgroundColor: "#FFFBEB",
          border: "2px solid #F59E0B",
          borderRadius: "10px",
          padding: "16px 20px",
          marginBottom: "24px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <span style={{ fontSize: "20px" }}>⚖️</span>
          <strong style={{ fontSize: "15px", color: "#B45309", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {termsMeta.status}
          </strong>
        </div>
        <p style={{ margin: 0, fontSize: "13px", lineHeight: "20px", color: "#78350F" }}>
          Este documento constitui a minuta normativa estruturada do TopicLog para validação e homologação pela assessoria jurídica antes de sua vigência plena em produção aberta ao público geral. As cláusulas aqui delineadas refletem os limites operacionais do marketplace, a conformidade com o Código de Defesa do Consumidor (CDC), Marco Civil da Internet (Lei 12.965/14) e Lei Geral de Proteção de Dados (LGPD - Lei 13.709/18).
        </p>
      </div>

      {/* Cabeçalho do Portal de Termos */}
      <header className="card" style={{ marginBottom: "20px", borderLeft: "5px solid var(--color-primary, #2563EB)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-primary, #2563EB)", textTransform: "uppercase" }}>
            Governança, Contratos & Diretrizes Operacionais TopicLog
          </span>
          <StatusPill label={`Versão ${termsMeta.version}`} tone="success" />
        </div>

        <h1 style={{ fontSize: "28px", lineHeight: "36px", marginTop: "10px", marginBottom: "8px", color: "var(--color-brand-deep-navy, #0F172A)" }}>
          Termos Gerais de Uso e Contrato de Intermediação
        </h1>
        <p style={{ color: "var(--color-muted, #64748B)", margin: 0, fontSize: "14px" }}>
          Identificador: <strong>{termsMeta.documentId}</strong> • Vigência: <strong>{termsMeta.vigenceDate}</strong> • Hash de Integridade: <code style={{ fontSize: "11px", backgroundColor: "#F1F5F9", padding: "2px 6px", borderRadius: "4px" }}>{termsMeta.sha256Hash.slice(0, 24)}...</code>
        </p>
      </header>

      {/* Navegação por Abas das Políticas */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "24px",
          borderBottom: "1px solid var(--color-border, #CBD5E1)",
          paddingBottom: "12px"
        }}
      >
        {[
          { key: "REMETER", label: "📦 Termos do Remetente" },
          { key: "TRANSPORTADOR", label: "🚗 Termo de Adesão do Transportador" },
          { key: "PROIBIDOS", label: "🚫 Itens Proibidos" },
          { key: "OPERACIONAL", label: "🔄 Coleta, Entrega e Devolução" },
          { key: "PRIVACIDADE", label: "🛡️ Privacidade e Proteção de Dados" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              border: "1px solid",
              borderColor: activeTab === tab.key ? "var(--color-primary, #2563EB)" : "var(--color-border, #CBD5E1)",
              backgroundColor: activeTab === tab.key ? "#EFF6FF" : "#FFFFFF",
              color: activeTab === tab.key ? "#1D4ED8" : "#475569",
              cursor: "pointer"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da Aba 1: Remetente / Cliente */}
      {activeTab === "REMETER" && (
        <section className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0, color: "var(--color-brand-deep-navy, #0F172A)" }}>
            1. Termos de Uso do Cliente / Remetente
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "22px", color: "var(--color-text, #334155)" }}>
            O TopicLog opera como uma plataforma tecnológica de marketplace, conectando usuários remetentes que buscam transporte para suas encomendas a transportadores autônomos ou prestadores de serviços de frete devidamente cadastrados.
          </p>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            1.1 Modelo de Negociação e Formação de Preço
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li><strong>Valor Sugerido:</strong> O cliente informa livremente no momento da publicação o valor sugerido para o frete, <strong>sem qualquer teto ou limite máximo</strong>. Esse valor é definido livremente pelo remetente de acordo com a distância, modalidade e urgência.</li>
            <li><strong>Negociação Direta:</strong> Transportadores autorizados podem aceitar o valor sugerido ou enviar contrapropostas com outros valores justificados pela distância, volume ou horário.</li>
            <li><strong>Contratação Vinculante:</strong> A contratação somente se concretiza quando ambas as partes concordam formalmente e expressamente com o valor final acordado.</li>
          </ul>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            1.2 Limites Operacionais e Responsabilidade do Objeto
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li><strong>Limite de Peso:</strong> O peso máximo admitido por solicitação é de <strong>20 kg</strong>, sem prejuízo da compatibilidade com o modal específico.</li>
            <li><strong>Volume Único por Solicitação:</strong> Cada pedido cadastrado corresponde estritamente a <strong>1 (um) volume/pacote físico</strong>. Caso o remetente necessite transportar múltiplos pacotes, deverá cadastrar um pedido individual para cada volume, gerando códigos de segurança (PIN) específicos para cada entrega.</li>
            <li><strong>Limite de Valor do Objeto:</strong> O valor econômico máximo dos objetos transportados por solicitação é de <strong>R$ 500,00 (quinhentos reais)</strong>. É expressamente vedado o envio de itens de valor superior sem apólice de seguro específica formalizada previamente.</li>
            <li><strong>Embalagem Adequada:</strong> O remetente é o único e exclusivo responsável pelo acondicionamento e embalagem protetora da mercadoria (caixa, fita, plástico bolha, envelope impermeável), devendo suportar o manuseio e transporte viário normal.</li>
            <li><strong>Código de Segurança (PIN):</strong> Para garantir que a carga seja entregue à pessoa certa, o remetente recebe um código PIN que deve ser informado ao destinatário para validação presencial com o transportador.</li>
          </ul>
        </section>
      )}

      {/* Conteúdo da Aba 2: Transportador */}
      {activeTab === "TRANSPORTADOR" && (
        <section className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0, color: "var(--color-brand-deep-navy, #0F172A)" }}>
            2. Termo de Adesão e Responsabilidade do Transportador Parceiro
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "22px", color: "var(--color-text, #334155)" }}>
            Este termo regula formalmente o credenciamento, deveres e as obrigações dos profissionais e transportadores parceiros no TopicLog.
          </p>

          <div
            style={{
              backgroundColor: "#FEF2F2",
              border: "1.5px solid #F87171",
              borderRadius: "10px",
              padding: "16px",
              marginBottom: "18px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "20px" }}>⚖️</span>
              <strong style={{ fontSize: "14px", color: "#991B1B", textTransform: "uppercase" }}>
                Declaração Expressa de Responsabilidade Civil e Criminal
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "#7F1D1D", lineHeight: "1.5" }}>
              O transportador declara ter plena ciência de que <strong>toda e qualquer responsabilidade pela veracidade, autenticidade e higidez das informações e documentos prestados é exclusivamente sua</strong>. Qualquer omissão, ocultação, declaração falsa ou adulteração acarretará a imediata exclusão da plataforma, sem prejuízo da responsabilização civil por perdas e danos e das sanções criminais cominadas no <strong>Artigo 299 do Código Penal Brasileiro (Falsidade Ideológica)</strong>.
            </p>
          </div>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            2.1 Requisitos Obrigatórios do Veículo e Documentação (CRLV)
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li><strong>Cadastro Obrigatório do Veículo:</strong> Nenhum cadastro ou perfil de transportador pode ser ativado ou aprovado sem o registro prévio e completo do veículo automotor ou ciclo elétrico a ser utilizado nas rotas (tipo, modelo, placa e ano).</li>
            <li><strong>Documento do Veículo Válido (CRLV):</strong> O transportador declara e garante que o Certificado de Registro e Licenciamento de Veículo (CRLV) encontra-se devidamente quitado, atualizado e válido perante os órgãos de trânsito competentes (Detran/Contran).</li>
            <li><strong>Inexistência de Restrições no Veículo:</strong> O veículo cadastrado está livre de impedimentos judiciais de circulação, bloqueios administrativos impeditivos, histórico de busca e apreensão, roubo ou furto.</li>
          </ul>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            2.2 Habilitação Legal (CNH) Compatível e Regularidade do Condutor
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li><strong>CNH Válida e Compatível:</strong> O transportador declara possuir Carteira Nacional de Habilitação (CNH) válida e estritamente compatível com o tipo de veículo utilizado para o transporte (ex.: Categoria A para motocicletas; Categoria B para automóveis de passeio, utilitários e minivans; Categoria C/D/E para caminhões e veículos de carga pesada).</li>
            <li><strong>Ausência de Restrições do Condutor:</strong> O motorista atesta sob as penas da lei que não possui suspensão, cassação ou impedimento administrativo ou penal que proíba seu direito de dirigir em vias públicas.</li>
          </ul>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            2.3 Condições de Segurança, Manutenção e Código de Trânsito Brasileiro (CTB)
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li><strong>Segurança Viária:</strong> O transportador se compromete a manter o veículo em perfeito estado de funcionamento, manutenção mecânica, pneus com sulcos adequados, freios e sinalização luminosa, atendendo rigorosamente a todos os preceitos do Código de Trânsito Brasileiro (CTB) e resoluções do CONTRAN.</li>
            <li><strong>Guarda e Integridade da Carga:</strong> O transportador atua como fiel depositário da encomenda a partir da coleta física até a validação presencial do código de entrega (PIN), respondendo por qualquer avaria culposa ou extravio do pacote durante o trajeto.</li>
          </ul>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            2.4 Autonomia, Liberdade e Inexistência de Vínculo Trabalhista
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li>O transportador é profissional autônomo, titular de seus meios de trabalho e de seu veículo, não havendo subordinação jurídica, exclusividade, metas de faturamento ou imposição de escala de horários.</li>
            <li>O parceiro tem plena liberdade para aceitar, recusar ou enviar contrapropostas para quaisquer solicitações disponíveis no feed. Não há despacho automático forçado.</li>
            <li><strong>Múltiplos Volumes e Capacidade Livre:</strong> O transportador possui autonomia para transportar quantos volumes e encomendas desejar e que caibam no seu veículo, definindo livremente sua capacidade de carga e agregando diferentes envios ao longo de sua rota.</li>
          </ul>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            2.5 Comissão da Plataforma e Repasse Financeiro
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li><strong>Taxa Configurável:</strong> Pela intermediação tecnológica, suporte e custódia de segurança da transação, a TopicLog retém uma taxa de comissão percentual definida e gerenciada dinamicamente pelo administrador da plataforma através do Console Administrativo.</li>
            <li><strong>Transparência Prévia:</strong> Antes de qualquer aceite definitivo de contratação, o sistema exibe de forma clara: (i) valor bruto acordado; (ii) percentual e valor em reais da comissão retida; (iii) repasse líquido exato que o transportador receberá.</li>
            <li><strong>Liberação por Senha/Código:</strong> O repasse financeiro em garantia é liberado imediatamente após a validação do código de segurança (PIN de 4 dígitos) fornecido pelo remetente/destinatário.</li>
          </ul>
        </section>
      )}

      {/* Conteúdo da Aba 3: Política de Itens Proibidos */}
      {activeTab === "PROIBIDOS" && (
        <section className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0, color: "#991B1B" }}>
            3. Política de Itens Proibidos para Transporte
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "22px", color: "#475569" }}>
            Seguindo as normas de segurança vigentes em serviços de transporte de encomendas e regulamentação de cargas, é expressamente proibido disponibilizar para transporte:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px", marginTop: "16px" }}>
            <div style={{ padding: "14px", borderRadius: "8px", border: "1px solid #FCA5A5", backgroundColor: "#FEF2F2" }}>
              <strong style={{ color: "#991B1B", fontSize: "14px" }}>🚫 Armas e Munições</strong>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#7F1D1D", lineHeight: 1.4 }}>
                Armas de fogo de qualquer calibre, armas brancas, munições, pólvora, peças de armas ou simulacros e réplicas.
              </p>
            </div>

            <div style={{ padding: "14px", borderRadius: "8px", border: "1px solid #FCA5A5", backgroundColor: "#FEF2F2" }}>
              <strong style={{ color: "#991B1B", fontSize: "14px" }}>🚫 Drogas e Substâncias Ilícitas</strong>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#7F1D1D", lineHeight: 1.4 }}>
                Entorpecentes, drogas ilícitas, medicamentos controlados sem receituário ou substâncias de uso restrito por lei.
              </p>
            </div>

            <div style={{ padding: "14px", borderRadius: "8px", border: "1px solid #FCA5A5", backgroundColor: "#FEF2F2" }}>
              <strong style={{ color: "#991B1B", fontSize: "14px" }}>🚫 Dinheiro em Espécie e Joias</strong>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#7F1D1D", lineHeight: 1.4 }}>
                Cédulas, moedas, cheques ao portador, pedras preciosas, barras de ouro ou objetos com valor superior a R$ 500,00.
              </p>
            </div>

            <div style={{ padding: "14px", borderRadius: "8px", border: "1px solid #FCA5A5", backgroundColor: "#FEF2F2" }}>
              <strong style={{ color: "#991B1B", fontSize: "14px" }}>🚫 Produtos Inflamáveis e Perigosos</strong>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#7F1D1D", lineHeight: 1.4 }}>
                Fogos de artifício, combustíveis, ácidos, venenos, materiais biológicos infectantes, radioativos ou gases sob pressão.
              </p>
            </div>

            <div style={{ padding: "14px", borderRadius: "8px", border: "1px solid #FCA5A5", backgroundColor: "#FEF2F2" }}>
              <strong style={{ color: "#991B1B", fontSize: "14px" }}>🚫 Animais Vivos e Restos Biológicos</strong>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#7F1D1D", lineHeight: 1.4 }}>
                Animais silvestres ou domésticos, peles, couro não tratado, órgãos humanos ou espécimes protegidos.
              </p>
            </div>

            <div style={{ padding: "14px", borderRadius: "8px", border: "1px solid #FCA5A5", backgroundColor: "#FEF2F2" }}>
              <strong style={{ color: "#991B1B", fontSize: "14px" }}>🚫 Cargas Incompatíveis com o Veículo</strong>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#7F1D1D", lineHeight: 1.4 }}>
                Objetos cujo peso exceda 20 kg ou dimensões impeçam o fechamento seguro do baú, caçamba ou porta-malas.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Conteúdo da Aba 4: Coleta, Entrega, Cancelamento e Devolução */}
      {activeTab === "OPERACIONAL" && (
        <section className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0, color: "var(--color-brand-deep-navy, #0F172A)" }}>
            4. Regras Operacionais de Coleta, Entrega e Devolução
          </h2>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            4.1 Procedimento de Coleta
          </h3>
          <p style={{ fontSize: "14px", lineHeight: "22px", color: "#475569" }}>
            O transportador deve inspecionar externamente a integridade da embalagem. Caso a embalagem esteja violada, vazando ou manifeste conteúdo suspeito, o transportador tem o dever e o direito de recusar a coleta sem qualquer penalidade.
          </p>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            4.2 Destinatário Ausente e Devolução ao Remetente
          </h3>
          <p style={{ fontSize: "14px", lineHeight: "22px", color: "#475569" }}>
            Chegando ao endereço de entrega, o transportador deve tentar contato com o destinatário por até 10 (dez) minutos. Se o destinatário não atender ou recusar o recebimento:
          </p>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li>A encomenda deve ser devolvida imediatamente ao endereço de origem do remetente.</li>
            <li>O remetente arcará com o valor correspondente ao retorno da rota acordada.</li>
            <li>Em nenhuma hipótese a encomenda poderá ser descartada ou abandonada na via pública.</li>
          </ul>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            4.3 Cancelamento Pré-Coleta e Pós-Coleta
          </h3>
          <ul style={{ fontSize: "14px", lineHeight: "22px", color: "#475569", paddingLeft: "20px" }}>
            <li><strong>Antes do deslocamento do transportador:</strong> O cancelamento é gratuito e o valor retido em garantia é estornado integralmente ao remetente.</li>
            <li><strong>Após o transportador chegar ao local de retirada:</strong> Caso o remetente cancele sem motivo plausível, poderá ser aplicada taxa de deslocamento mínimo de R$ 10,00 para compensação do parceiro.</li>
          </ul>
        </section>
      )}

      {/* Conteúdo da Aba 5: Privacidade e LGPD */}
      {activeTab === "PRIVACIDADE" && (
        <section className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0, color: "var(--color-brand-deep-navy, #0F172A)" }}>
            5. Política de Privacidade e Registro Técnico de Aceite (LGPD)
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "22px", color: "#475569" }}>
            A TopicLog trata os dados pessoais de remetentes e transportadores exclusivamente para viabilizar a intermediação do transporte contratado, em estrita observância à Lei Geral de Proteção de Dados (Lei 13.709/2018).
          </p>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            5.1 Mascaramento e Proteção de Endereços
          </h3>
          <p style={{ fontSize: "14px", lineHeight: "22px", color: "#475569" }}>
            No feed público de oportunidades, os endereços exatos (rua e número) são estritamente mascarados, exibindo apenas o bairro e o município para proteger a privacidade dos remetentes. O endereço completo e eventuais complementos só se tornam visíveis ao transportador que teve sua proposta expressamente aceita pelo cliente.
          </p>

          <h3 style={{ fontSize: "16px", color: "var(--color-brand-deep-navy, #0F172A)", marginTop: "16px" }}>
            5.2 Evidência Técnica do Registro do Aceite
          </h3>
          <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "8px", padding: "14px", fontSize: "13px", color: "#334155" }}>
            <div>Cada confirmação de termos registra atomicamente nos servidores da plataforma:</div>
            <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px", color: "#475569" }}>
              <li>Identificador único do usuário autenticado (User GUID);</li>
              <li>Versão exata dos termos aceitos (ex: <code>{termsMeta.version}</code>);</li>
              <li>Hash criptográfico SHA-256 da minuta íntegra;</li>
              <li>Carimbo de data e hora UTC registrado em trilha imutável de auditoria;</li>
              <li>Endereço IP e User-Agent do dispositivo utilizado.</li>
            </ul>
          </div>
        </section>
      )}

      {/* Rodapé de Ação */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "17px" }}>Pronto para publicar sua encomenda?</h3>
          <p style={{ margin: 0, color: "var(--color-muted, #64748B)", fontSize: "14px" }}>
            A publicação é gratuita e aceita qualquer trajeto no Brasil.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link href="/encomendas/publicar" className="btn btn--primary">
            Disponibilizar Transporte ➔
          </Link>
          <Link href="/feed" className="btn btn--outline">
            Ver Oportunidades
          </Link>
        </div>
      </div>
    </main>
  );
}
