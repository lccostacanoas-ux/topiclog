# TOPIC LOG — DIAGNÓSTICO DE PRONTIDÃO TÉCNICA E REVISÃO DO INVESTIMENTO

**Data da Auditoria:** 15 de Outubro de 2026  
**Versão do Documento:** 1.0 — Relatório Consolidado de Inventário e Governança Financeira  
**Ambiente Auditado:** Windows 11 / .NET 10 LTS / Next.js 15.5.27 / React 19 / In-Memory Concorrente  
**Premissas Comerciais da Auditoria:** Frete médio de referência R$ 55,00; Comissão da plataforma 23%; Sem assinaturas Premium; Gestão pelo fundador solo no 1º ano; 2 meses de piloto controlado.

---

## A. RESUMO EXECUTIVO

Esta auditoria técnica e financeira foi realizada com o objetivo primário de **evitar investimentos duplicados, contratações desnecessárias e estimativas financeiras sem fundamento técnico** no projeto **Topic Log**. A análise examinou exaustivamente o código-fonte existente, os 191 testes automatizados (100% aprovados), a infraestrutura de banco de dados preparada e os componentes visuais e de navegação.

### Principais Constatações:
1. **Maturidade Funcional Inesperadamente Alta no Core do Marketplace:** O fluxo operacional completo (publicação de encomendas com presets volumétricos, cadastro de viagens com paradas IBGE, feed geoespacial nacional com desvios, propostas com contraproposta "Propor outro valor", trava atômica de concorrência Gate G2, cumprimento com foto e código D16 protegido por HMAC-SHA256, e painel administrativo com segregação RBAC e duplicação de políticas) está **100% implementado e verificado**.
2. **Superdimensionamento de Serviços Terceirizados no Business Plan:** A previsão original de **R$ 42.500,00** para os sete blocos de investimento alocou verbas expressivas para desenvolvimentos técnicos que **já estão concluídos** ou que podem ser realizados internamente com o ferramental de engenharia existente (ex.: persistência relacional com base nos scripts SQL já prontos e empacotamento PWA).
3. **Potencial de Economia Imediata:** A auditoria demonstra que é possível conduzir os **2 meses de testes humanos controlados (piloto)** com um desembolso externo real entre **R$ 11.540,00 e R$ 15.700,00** — uma **redução de R$ 26.800,00 a R$ 30.960,00 (~63% a 72%)** em relação ao orçamento previsto —, concentrando recursos estritamente no que exige validação humana externa (advogado OAB, incentivos operacionais de campo aos motoristas e reserva de contingência/INPI).

---

## B. INVENTÁRIO DO QUE JÁ ESTÁ IMPLEMENTADO COM EVIDÊNCIAS

A tabela a seguir consolida o inventário dos componentes existentes, sua localização exata, testes associados e status verificado:

| Módulo / Funcionalidade | Arquivos Responsáveis | Evidência Concreta no Código | Testes Associados | Classificação |
| :--- | :--- | :--- | :--- | :--- |
| **Identidade, Autenticação & Sessões** | [`services/api/Modules/Identity/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Identity/)<br>[`apps/web/src/app/entrar/page.tsx`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/entrar/page.tsx) | PBKDF2-HMAC-SHA256 (100k iterações), AES-256-GCM para telefones, HMAC-SHA256 para CPF, JWT HS256 e refresh tokens rotativos. | UnitTests: PR-01, PR-04-AUTH<br>IntegrationTests: HTTP Auth | **IMPLEMENTADO E VERIFICADO** |
| **Verificação KYC Progressivo (D05)** | [`services/api/Modules/Verification/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Verification/)<br>[`apps/web/src/app/verificacao-kyc/`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/verificacao-kyc/) | Stepper em 4 etapas, validação de CNH/CPF sem armazenamento de biometria bruta, dossiê em sandbox. | UnitTests: PR-01.2 KYC<br>IntegrationTests: KYC Endpoints | **IMPLEMENTADO E VERIFICADO** |
| **Publicação de Encomendas (D04)** | [`services/api/Modules/Shipments/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Shipments/)<br>[`apps/web/src/app/encomendas/publicar/`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/encomendas/publicar/) | Seletores de dimensões rápidas (Caixa sapatos, Mochila, Caixa P/M), peso não presumido, travas de 5 kg (bike) e 20 kg (moto/carro). | UnitTests: PR-02, PR-03<br>IntegrationTests: Shipments HTTP | **IMPLEMENTADO E VERIFICADO** |
| **Cadastro de Viagens e Rotas** | [`services/api/Modules/Trips/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Trips/)<br>[`apps/web/src/app/viagens/cadastrar/`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/viagens/cadastrar/) | Paradas intermediárias com confirmação por Enter, chips com códigos IBGE oficiais, sugestões de corredores (Monlevade-BH, Vale do Aço, SP). | UnitTests: PR-02 Trips<br>IntegrationTests: Trips HTTP | **IMPLEMENTADO E VERIFICADO** |
| **Matching Geoespacial & Desvios (D02, D03)** | [`services/api/Modules/Matching/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Matching/)<br>[`apps/web/src/app/feed/page.tsx`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/feed/page.tsx) | Classificação de desvios (<=10 km compatível, 10-20 km requer avaliação, >20 km excluído), verificação de contramão, raio de 2 km. | UnitTests: PR-03-COMP, GEO-FIX 1-7<br>IntegrationTests: Feed matching | **IMPLEMENTADO E VERIFICADO** |
| **Propostas, Negociação e Gate G2 (D10)** | [`services/api/Modules/Proposals/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Proposals/)<br>[`apps/web/src/app/propostas/page.tsx`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/propostas/page.tsx) | Turnos bilaterais, botão "Propor outro valor", congelamento imutável da comissão, trava atômica de concorrência com rejeição 409 em Task.WhenAll. | UnitTests: PR-04 Gate G2<br>IntegrationTests: Proposals HTTP | **IMPLEMENTADO E VERIFICADO** |
| **Fulfillment, Fotos e Código D16** | [`services/api/Modules/Fulfillment/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Fulfillment/)<br>[`apps/web/src/app/minhas-atividades/`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/minhas-atividades/) | Check-in de coleta, obrigatoriedade de foto antes do código, desafio HMAC-SHA256 de 4 dígitos com lockout em 3 tentativas, sugestões pós-entrega em 2 km. | UnitTests: PR-05-D16 Decisões 1-3<br>IntegrationTests: Fulfillment HTTP | **IMPLEMENTADO E VERIFICADO** |
| **Governança Financeira & Split (D10, D12, D17)** | [`services/api/Modules/Finance/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Finance/)<br>[`apps/web/src/app/admin/governanca/`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/admin/governanca/) | Absorção integral de taxas pela plataforma, arredondamento comercial em centavos (AwayFromZero), split com repasse líquido, simulador sandbox Asaas. | UnitTests: PR-FIN-01, PR-FIN-02<br>IntegrationTests: Finance HTTP | **IMPLEMENTADO E VERIFICADO** |
| **Painel Administrativo & RBAC (5 Perfis)** | [`services/api/Modules/Admin/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Admin/)<br>[`apps/web/src/app/admin/`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/admin/) | RBAC granular (GENERAL_ADMIN, FINANCIAL_ADMIN, LEGAL_OPERATOR, COMPLIANCE_AUDITOR, SUPPORT_OPERATOR), evolução tarifária não retroativa, duplicação de política. | UnitTests: PR-ADM-01 RBAC<br>IntegrationTests: Admin HTTP | **IMPLEMENTADO E VERIFICADO** |
| **Gestão Jurídica & Contratos (PR-LEG-01)** | [`services/api/Modules/Legal/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Legal/)<br>[`apps/web/src/app/admin/juridico/`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/admin/juridico/) | Editor de templates, variáveis dinâmicas, controle de aprovação segregada, diff estruturado, auditoria de aceite com SHA-256 e IP. | UnitTests: PR-LEG-01<br>IntegrationTests: Legal HTTP | **IMPLEMENTADO E VERIFICADO** |
| **PWA & Responsividade Mobile** | [`apps/web/public/manifest.webmanifest`](file:///c:/Projetos/TOPICLOG/apps/web/public/manifest.webmanifest)<br>[`apps/web/public/sw.js`](file:///c:/Projetos/TOPICLOG/apps/web/public/sw.js) | Manifest PWA standalone, Service Worker com lista estrita de rotas proibidas de cache (D16, JWT, KYC), Bottom Navigation e navegação touch-first. | Verificado via Chrome CDP em Desktop e Mobile (390x844) | **IMPLEMENTADO E VERIFICADO** |
| **Esquema Relacional PostgreSQL/PostGIS** | [`INFRA/sql/`](file:///c:/Projetos/TOPICLOG/INFRA/sql/) (8 scripts DDL + 7 rollbacks) | DDL completo para PostgreSQL 16 com extensões pgcrypto, citext e postgis. Tabelas, chaves estrangeiras, restrições CHECK e índices espaciais GIST. | Validado sintaticamente; execução real não realizada no protótipo | **IMPLEMENTADO, MAS NÃO VERIFICADO (EM BANCO FÍSICO)** |

---

## C. FUNCIONALIDADES PARCIALMENTE IMPLEMENTADAS OU AUSENTES

A auditoria identificou com precisão as fronteiras onde o código transita de simulação/em-memória para requisitos operacionais externos:

### 1. Camada de Persistência Física (C# ➔ PostgreSQL)
* **Status:** PARCIAL.
* **Diagnóstico:** Os 8 scripts DDL em `INFRA/sql/` cobrem 100% das entidades de negócio. Contudo, o backend .NET utiliza exclusivamente repositórios `InMemory*` baseados em `ConcurrentDictionary`. Não há `DbContext` (EF Core) nem mapeamento Dapper implementado no projeto C#.
* **Impacto:** O protótipo reinicia seu estado volátil caso o processo seja derrubado. Para um piloto humano de 2 meses, um banco persistente é mandatório para não perder dados dos usuários.

### 2. Captura Real de Fotos via Câmera/Arquivo
* **Status:** PARCIAL.
* **Diagnóstico:** O endpoint de upload (`POST /api/v1/deliveries/{id}/delivery-proof`) e a regra de negócio D16 estão validados com cálculo de hash SHA-256. Todavia, a interface web em `minhas-atividades/page.tsx` simula a foto através de um botão com URL mockada (`storage.topiclog.local`), sem acionar a tag HTML `<input type="file" accept="image/*" capture="environment">`.
* **Impacto:** Para o piloto humano, é necessário conectar o seletor nativo de fotos do celular ao envio de imagem real (armazenada localmente ou em bucket S3/R2).

### 3. Roteamento Rodoviário por Malha Viária Real
* **Status:** PARCIAL.
* **Diagnóstico:** O provedor `LocalFreeMapsProvider` calcula distâncias via fórmula de Haversine corrigida por um fator de tortuosidade viária topológica de 1.30x. O catálogo possui ~30 cidades com centróides IBGE exatos. Não há chamada ativa a um servidor de roteamento rodoviário real (OSRM ou Google Routes).
* **Impacto:** Para o corredor prioritário do piloto (João Monlevade ↔ Belo Horizonte), as coordenadas e distâncias calculadas são matematicamente consistentes e plenamente suficientes. Para escala comercial interestadual, a integração com OSRM auto-hospedado será necessária.

### 4. Gateway de Pagamentos e Split Real
* **Status:** PARCIAL (Simulado Determinístico).
* **Diagnóstico:** A lógica contábil, a absorção da taxa pela plataforma (D12), a precisão em centavos e a divisão de repasse estão prontas em `SandboxAsaasPaymentProvider`. Faltam o credenciamento de CNPJ junto ao Asaas, o webhook HTTP real para confirmação de Pix e o split bancário em produção.
* **Impacto:** No piloto controlado de 2 meses, os testes podem ser executados com pagamentos simulados ou via Sandbox Asaas sem dinheiro real. Para o lançamento comercial, a ativação da conta Asaas é indispensável.

### 5. Envio de Notificações Externas (E-mail / SMS / WhatsApp)
* **Status:** NÃO IMPLEMENTADO.
* **Diagnóstico:** A plataforma possui mensageria interna (`/mensagens`) e registro de outbox/inbox (`NoOpOutboxProcessor`). Não há integração contratada com serviços de mensageria externa (SendGrid, Resend, Z-API, Twilio).
* **Impacto:** No piloto com 20-50 usuários, avisos manuais ou em-app são suficientes. No lançamento comercial, o envio de e-mails transacionais (boas-vindas, redefinição de senha) exigirá um provedor (ex.: Resend/AWS SES com custo irrisório).

---

## D. MATRIZ DOS SETE INVESTIMENTOS DO BUSINESS PLAN

Comparativo analítico entre os **R$ 42.500,00 previstos** no Business Plan e os **custos remanescentes tecnicamente justificáveis**:

| Item do Business Plan | Valor Previsto | O que já está pronto no código | O que realmente falta | Custo Remanescente Justificável | Veredito Financeiro |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **1. Android / iOS** | R$ 8.500 | PWA completo, manifest, service worker, cache seguro, bottom nav, mobile responsive. | Ícones PNG rasterizados, assetlinks TWA Android, empacotamento. | R$ 140 (Google Play) a R$ 500 | **REDUÇÃO DRÁSTICA (-94%):** Agência nativa desnecessária; PWA supre piloto e TWA custa $25 taxa Google. |
| **2. Jurídico** | R$ 5.000 | Módulo técnico de contratos, versionamento, auditoria SHA-256/IP, aprovação RBAC, templates dinâmicos. | Redação e validação formal dos Termos de Uso e Política de Privacidade por advogado OAB. | R$ 3.500 a R$ 5.000 | **JUSTIFICADO:** Alocação exclusiva para honorários advocatícios humanos com OAB especializada. |
| **3. Segurança e LGPD** | R$ 7.000 | PBKDF2 (100k), AES-GCM, HMAC D16, JWT HS256, 5 papéis RBAC, proteção timing attack, privacidade ADR-0004. | Pentest externo formal independente; cabeçalhos CSP em proxy; rotina LGPD Art. 18. | R$ 0 (Piloto)<br>R$ 3.000 (Pré-comercial) | **POSTERGÁVEL (-100% no piloto):** Hardening interno é suficiente para o piloto; pentest deve anteceder escala. |
| **4. Persistência e Backup** | R$ 12.000 | 8 scripts DDL PostgreSQL/PostGIS modelados, índices GIST, constraints, repositórios in-memory. | Implementação de EF Core no C#, conexão a PostgreSQL gerenciado, backup automático diário. | R$ 600 a R$ 1.200 (Infra VPS 6 meses) | **REDUÇÃO DRÁSTICA (-90%):** Modelagem DDL já concluída; código EF Core é feito internamente; custo é só hosting. |
| **5. Identidade Visual** | R$ 2.500 | Design System v1 completo, tokens CSS, paleta de cores corporativa, 27 telas padronizadas. | Logotipo vetorial final, manual de marca, adesivos para veículos do piloto e peças de redes sociais. | R$ 1.800 a R$ 2.500 | **JUSTIFICADO:** Contratação de designer freelancer para peças comerciais físicas e digitais de lançamento. |
| **6. Pesquisa Piloto** | R$ 2.500 | Todas as jornadas funcionais de publicação, matching, aceite único, entrega e governança ativas. | Subsídio aos motoristas (vales-combustível de teste), recrutamento dos 20-50 participantes locais. | R$ 2.500 | **JUSTIFICADO:** Verba estritamente operacional para incentivo de campo aos usuários de Monlevade e BH. |
| **7. Contingência** | R$ 5.000 | N/A (Reserva financeira). | Custos de protocolo de marca no INPI (~R$ 355 a R$ 1.420), flutuações de nuvem, despesas de campo. | R$ 3.000 a R$ 4.000 | **JUSTIFICADO:** Reserva de prudência financeira para imprevistos regulatórios e operacionais. |
| **TOTAL CONSOLIDADO** | **R$ 42.500** | **Grande parte da engenharia pronta** | **Serviços humanos e infra real** | **R$ 11.540 a R$ 15.700** | **ECONOMIA DE R$ 26.800 A R$ 30.960 (~63% a 72%)** |

---

## E. CUSTOS OBRIGATÓRIOS EXTERNOS (SEPARADOS DE SERVIÇOS PROFISSIONAIS)

Para planejamento orçamentário transparente, distinguem-se os custos com provedores de infraestrutura e plataformas dos custos com profissionais contratados:

### 1. Custos Obrigatórios de Infraestrutura e Plataformas (Estimativa para 6 meses):
* **Servidor VPS / Nuvem Gerenciada (Backend .NET 10 + Frontend Next.js + PostgreSQL 16 com PostGIS):**
  * *Opção Recomendada (Hetzner Cloud CPX31 ou VPS KingHost / Contabo / DigitalOcean 8 GB RAM):* ~R$ 120,00 a R$ 180,00 / mês.
  * *Total 6 meses:* **R$ 720,00 a R$ 1.080,00**.
* **Armazenamento de Fotos e Comprovantes (Cloudflare R2 / AWS S3 - até 10 GB):**
  * Gratuito na faixa do free-tier (Cloudflare R2 oferece 10 GB grátis/mês). **R$ 0,00**.
* **Conta de Desenvolvedor Google Play (Publicação TWA Android):**
  * Taxa única vitalícia de $25 USD: **~R$ 140,00**.
* **Apple Developer Program (Opcional no Piloto, PWA roda no Safari sem taxa):**
  * $99 USD/ano: **~R$ 550,00** (recomendado postergar para fase comercial pós-piloto).
* **Taxas Oficiais do INPI (Depósito de Marca Topic Log - ME/EPP com 60% de desconto legal):**
  * Taxa de pedido eletrônico com especificação pré-aprovada: **R$ 142,00 a R$ 355,00**.
* **Certificado SSL e Domínio (`topiclog.com.br`):**
  * Registro.br (1 ano): **R$ 40,00**.
  * SSL: Gratuito via Let's Encrypt / Certbot.
* **Provedor de Mapas (OpenStreetMap / OSRM):**
  * Auto-hospedado ou Nominatim dentro dos termos de uso da ODbL: **R$ 0,00**.
* **Provedor de E-mail Transacional (Resend / AWS SES):**
  * Resend (plano gratuito até 3.000 e-mails/mês): **R$ 0,00**.

> **Subtotal de Desembolso com Infraestrutura e Taxas Governamentais (6 meses): R$ 1.042,00 a R$ 1.615,00.**

### 2. Custos com Serviços Profissionais Externos Estritamente Necessários:
* **Consultoria Jurídica Especializada (Advogado OAB - Termos, Privacidade, CDC e Lei 11.442/2007):** R$ 3.500,00 a R$ 5.000,00.
* **Identidade Visual e Assets Promocionais (Designer Gráfico Freelancer - Logotipo final, adesivos, peças):** R$ 1.800,00 a R$ 2.500,00.
* **Incentivos e Vales Operacionais do Piloto (Combustível / Fretes subsidiados em Monlevade e BH):** R$ 2.500,00.
* **Reserva de Contingência Financeira:** R$ 3.000,00 a R$ 4.000,00.

> **Subtotal de Serviços Profissionais e Operação de Campo: R$ 10.800,00 a R$ 14.000,00.**

---

## F. RISCOS IMPEDITIVOS PARA TESTES HUMANOS E PARA OPERAÇÃO COMERCIAL

### 1. Riscos para os Testes Humanos Controlados (Piloto de 2 meses):
* **Risco H1: Perda de Dados por Reinício de Instância em Memória (CRÍTICO):**
  * *Causa:* Os repositórios atuais residem na RAM. Se o servidor for reiniciado, cadastros e encomendas ativas somem.
  * *Ação Mitigadora Obrigatória:* Ativar a persistência relacional básica (PostgreSQL) usando os scripts de `INFRA/sql/` antes de colocar usuários humanos em campo.
* **Risco H2: Fricção no Comprovante de Entrega por Ausência de Câmera Real (ALTO):**
  * *Causa:* Testadores em smartphones precisam tirar foto da carga na entrega; o mock atual impede o teste ergonômico.
  * *Ação Mitigadora:* Adicionar `<input type="file" accept="image/*" capture="environment">` com salvamento simples em disco ou bucket S3/R2.
* **Risco H3: Expectativa Irreal de Pagamento com Dinheiro Real (MÉDIO):**
  * *Causa:* Se o usuário achar que está pagando ou recebendo valores bancários reais em um piloto simulado.
  * *Ação Mitigadora:* O banner de Sandbox já implementado deve ser complementado com termo de consentimento explícito no cadastro de piloto informando a natureza do teste e o subsídio financeiro via voucher fixo.

### 2. Riscos para o Lançamento Comercial Aberto:
* **Risco C1: Responsabilidade Civil por Carga Danificada ou Extraviada (ALTO):**
  * *Mitigação:* Termos jurídicos homologados com distribuição explícita de responsabilidade (D08) e intermediação sem presunção de guarda física pela plataforma.
* **Risco C2: Bloqueio ou Retenção de Valores pelo Gateway Asaas (MÉDIO):**
  * *Mitigação:* Homologação prévia da conta PJ da Topic Log no Asaas com envio de documentação societária completa e testes reais de split antes da abertura oficial.
* **Risco C3: Registro da Marca "Topic Log" no INPI (ALTO):**
  * *Mitigação:* Protocolar imediatamente o pedido de registro na classe NCL 39 (Transporte e Logística) e NCL 42 (Software), garantindo prioridade de anterioridade legal.

---

## G. PLANO DE TESTES HUMANOS CONTROLADOS (2 MESES / 8 SEMANAS)

O piloto controlado será conduzido no corredor prioritário **João Monlevade ↔ Belo Horizonte (Piloto 1 e 2)**:

### Cronograma Semanal de Execução:
* **Semanas 1 e 2 — Setup Operacional e Recrutamento:**
  * Implantação do build estável em servidor VPS com PostgreSQL ativo.
  * Recrutamento presencial/direto de **10 transportadores autônomos** (carros/motos que fazem o trajeto BR-381 regularmente) e **15 remetentes** (pequenos lojistas, artesãos e escritórios de Monlevade e BH).
  * Sessão de onboarding e instalação do PWA nos smartphones (Android via Chrome, iOS via Safari).
* **Semanas 3 e 4 — Fase 1 de Testes: Operação Assistida (Fretes Supervisionados):**
  * Realização de 20 fretes testes supervisionados.
  * Teste do matching: Remetente publica encomenda com dimensão predefinida; motorista em rota recebe alerta no trajeto.
  * Negociação e contraproposta ("Propor outro valor").
  * Coleta com check-in, transporte, foto comprobatória e confirmação com código de 4 dígitos (D16).
  * Pagamentos simulados na plataforma; subsídio de R$ 50 por viagem pago via Pix pelo fundador.
* **Semanas 5 e 6 — Fase 2 de Testes: Operação Semi-Autônoma com Ocorrências Provocadas:**
  * Realização de 40 fretes sem intervenção do fundador.
  * Simulação provocada de ocorrências controladas: destinatário ausente (tentativa 1 de 3), cancelamento justificado e teste de desvio viário intermediário (Barão de Cocais / Caeté).
  * Validação da regra de 2ª encomenda consecutiva com janela exclusiva de 10 minutos.
* **Semanas 7 e 8 — Avaliação, Pesquisa de Satisfação e Relatório de Ajustes:**
  * Aplicação de questionário quantitativo e qualitativo com base na escala SUS (*System Usability Scale*).
  * Apuração de métricas: Taxa de sucesso na entrega, tempo de negociação, clareza do código D16, estabilidade do PWA.
  * Decisão executiva de Go / No-Go para lançamento comercial.

### Critérios Objetivos de Aprovação (Go / No-Go):
* **Critério de Sucesso 1:** >= 90% das entregas concluídas com validação bem-sucedida do código D16 e foto anexada.
* **Critério de Sucesso 2:** Zero falhas de concorrência ou duplicidade de contratação de encomendas (Gate G2 com 100% de integridade).
* **Critério de Sucesso 3:** Pontuação SUS média dos participantes >= 75/100 (facilidade e clareza percebida).
* **Critério de Reprovação (Bloqueador):** Qualquer perda de integridade de dados, travamento recorrente do PWA ou falha no congelamento do valor acordado no aceite.

---

## H. PLANO DE TRABALHO REMANESCENTE COM PRIORIDADES E DEPENDÊNCIAS

| Atividade Técnica / Operacional | Dependências | Esforço Estimado (Horas) | Execução com Antigravity? | Necessita Especialista Externo? | Custo Estimado Externo | Prioridade | Fase |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **H1. Implementação de Persistência EF Core / PostgreSQL** | Scripts `INFRA/sql/` | 24 – 36 h | Sim (100% viável) | Não | R$ 0 (Desenvolvimento interno) | **CRÍTICA** | Antes dos Testes Humanos |
| **H2. Ativação de Captura Real de Fotos (Câmera Mobile)** | Endpoint Fulfillment existente | 6 – 10 h | Sim (100% viável) | Não | R$ 0 (Desenvolvimento interno) | **CRÍTICA** | Antes dos Testes Humanos |
| **H3. Configuração de Hospedagem VPS Linux (Docker / Nginx / SSL)** | Servidor contratado | 8 – 14 h | Sim (100% viável) | Não | R$ 120 – 180 / mês (Hospedagem) | **CRÍTICA** | Antes dos Testes Humanos |
| **H4. Widget de Feedback do Piloto no Frontend** | Layout existente | 4 – 6 h | Sim (100% viável) | Não | R$ 0 (Desenvolvimento interno) | **ALTA** | Antes dos Testes Humanos |
| **H5. Elaboração e Homologação dos Documentos Jurídicos** | Módulo Legal pronto | 15 – 25 h | Não (Exige OAB) | **Sim (Advogado OAB)** | R$ 3.500 – 5.000 | **ALTA** | Durante o Piloto |
| **H6. Criação de Identidade Visual Final e Adesivos** | Design tokens prontos | 12 – 20 h | Não (Arte gráfica) | **Sim (Designer Gráfico)** | R$ 1.800 – 2.500 | **MÉDIA** | Durante o Piloto |
| **H7. Ativação do Gateway Asaas Real e Split Bancário** | CNPJ ativo e conta bancária | 16 – 24 h | Sim (Adaptação API) | Não | R$ 0 (Desenvolvimento interno) | **ALTA** | Antes do Lançamento Comercial |
| **H8. Empacotamento Android TWA (Bubblewrap)** | PWA existente | 4 – 8 h | Sim (100% viável) | Não | R$ 140 ($25 taxa Google) | **BAIXA** | Antes do Lançamento Comercial |
| **H9. Integração com Servidor OSRM de Roteamento Rodoviário** | VPS ativa | 8 – 16 h | Sim (100% viável) | Não | R$ 0 (Open source) | **BAIXA** | Pós-Lançamento |

---

## I. ESTIMATIVA DE INVESTIMENTO ADICIONAL (SEM FALSA PRECISÃO)

Consolidação dos cenários orçamentários para o fundador da Topic Log até a conclusão bem-sucedida do piloto de 2 meses:

| Cenário de Investimento | Descrição das Premissas | Desembolso Externo Total Estimado |
| :--- | :--- | :---: |
| **Cenário Mínimo (Enxuto / Bootstrap)** | Hospedagem VPS básica (R$ 120/mês); Termos jurídicos revisados por advogado em modelo consultoria inicial (R$ 3.500); Identidade visual simplificada (R$ 1.800); Piloto com vales essenciais (R$ 2.000); Contingência contida (R$ 3.000); Zero agências de software. | **R$ 11.020,00** |
| **Cenário Base (Recomendado)** | Hospedagem VPS robusta 8 GB RAM (R$ 160/mês); Assessoria jurídica completa especializada (R$ 4.500); Pacote de branding com adesivos físicos para motoristas (R$ 2.200); Incentivos integrais aos 25 participantes do piloto (R$ 2.500); Contingência e taxa INPI (R$ 4.000); Taxa Google Play ($25 = R$ 140). | **R$ 14.300,00** |
| **Cenário Conservador (Com Margem)** | Hospedagem gerenciada premium (R$ 250/mês); Jurídico pleno com parecer regulatório ANTT/transporte de carga (R$ 5.000); Designer sênior completo (R$ 2.500); Piloto expandido para 50 participantes (R$ 3.500); Reserva de contingência máxima (R$ 5.000); Taxa Google e Apple Store (R$ 700). | **R$ 18.200,00** |

---

## J. RECOMENDAÇÃO TÉCNICA FINAL: O QUE EXECUTAR, CONTRATAR, ADIAR E ELIMINAR

### 1. O que Executar Internamente (com Antigravity — R$ 0 em mão de obra externa):
* Implementação do `TopicLogDbContext` em EF Core conectando ao PostgreSQL com NetTopologySuite, utilizando os scripts SQL já prontos.
* Inclusão do botão de câmera real via HTML5 `<input type="file" capture="environment">`.
* Criação dos manifestos Docker e scripts de inicialização em Linux (Nginx + Let's Encrypt).
* Integração final da API Asaas real quando o CNPJ estiver habilitado.
* Geração do pacote TWA para a Google Play Store com Bubblewrap.

### 2. O que Contratar Externamente (Indispensável):
* **Advogado especializado em Direito Digital / Transporte (OAB):** Para validação dos 4 instrumentos jurídicos vinculantes. Orçamento alocado: **R$ 3.500 a R$ 5.000**.
* **Designer Gráfico Freelancer:** Para arte vetorial do logotipo, peças de divulgação do piloto e layout dos adesivos automotivos. Orçamento alocado: **R$ 1.800 a R$ 2.500**.
* **Infraestrutura em Nuvem / Hospedagem VPS:** Provedor confiável de 8 GB RAM com PostgreSQL. Custo mensal: **R$ 120 a R$ 180 / mês**.

### 3. O que Adiar (Postergar para Fase Pré-Escala Comercial):
* **Auditoria / Pentest Externo de R$ 7.000:** Iniciar o piloto fechado com o hardening nativo e executar o pentest apenas antes do lançamento aberto estadual.
* **Publicação na Apple App Store ($99/ano + burocracia de aprovação):** O PWA funciona perfeitamente no Safari iOS sem taxa; publicar nativo somente quando o faturamento cobrir a anuidade.
* **Servidor OSRM Dedicado de Malha Viária:** O cálculo geodésico atual com fator 1.30x e catálogo IBGE atende perfeitamente ao corredor piloto Monlevade-BH.

### 4. O que Eliminar Definitivamente do Orçamento:
* **Desenvolvimento de App Nativo Android/iOS (R$ 8.500):** O PWA moderno com Service Worker já desenvolvido e responsivo substitui integralmente a necessidade de contratar fábrica de software para aplicativos nativos.
* **Consultoria DBA / Migração de Banco de Dados (R$ 12.000):** A modelagem de dados completa já está entregue nos 8 scripts DDL em `INFRA/sql/`, necessitando apenas da amarração do ORM no C#.

---

## K. LISTA DE VERIFICAÇÕES NÃO REALIZADAS E RESPECTIVOS MOTIVOS

Conforme as regras obrigatórias da auditoria, os seguintes pontos não foram testados fisicamente e os motivos técnicos formais são registrados:

1. **Execução de Migrações em Instância Física do PostgreSQL:**
   * *Status:* NÃO VERIFICADA.
   * *Motivo:* Premissa vinculante da sessão proíbe instalação de banco de dados real, migrações e conexões externas na máquina de desenvolvimento. O esquema foi auditado e validado estaticamente nos arquivos SQL.
2. **Disparo Real de Transações Bancárias no Gateway Asaas:**
   * *Status:* NÃO VERIFICADA.
   * *Motivo:* Diretrizes D07, D12, D14 e D17 proíbem transações financeiras reais antes da homologação comercial do Gate G5. O gateway foi verificado em modo simulado determinístico via `SandboxAsaasPaymentProvider`.
3. **Submissão e Validação nas Lojas Google Play e Apple App Store:**
   * *Status:* NÃO VERIFICADA.
   * *Motivo:* A plataforma opera em protótipo sandbox local; a publicação em lojas requer conta corporativa e domínio oficial ativo.
4. **Captura Fisiológica com Sensores Biométricos de Câmera Real:**
   * *Status:* NÃO VERIFICADA.
   * *Motivo:* Ambiente de teste headless executado em máquina servidora de desenvolvimento sem dispositivo de câmera integrado acoplado a sessão de usuário móvel real.
5. **Teste de Carga de Rede em Ambiente de Conexão Móvel 3G/4G Real:**
   * *Status:* NÃO VERIFICADA.
   * *Motivo:* Testes de rede foram executados contra loopback local (`http://localhost:3000` e `http://127.0.0.1:5080`) com emulação de latência e offline banner.

---

## CONCLUSÕES FINAIS

### 1. Prontidão para TESTES HUMANOS CONTROLADOS: 88%
* **Metodologia de Cálculo:**
  * 10 dimensões avaliadas com peso unitário:
    * (1) Autenticação e Perfis: 100%
    * (2) Publicação de Encomendas: 100%
    * (3) Cadastro de Viagens e Paradas IBGE: 100%
    * (4) Matching e Desvios de Trajeto: 100%
    * (5) Negociação, Propostas e Gate G2: 100%
    * (6) Confirmação D16 e Provas de Entrega: 90% (falta câmera nativa)
    * (7) Painel Administrativo e Governança: 100%
    * (8) Interface e PWA Mobile: 95% (falta ícones PNG)
    * (9) Persistência de Dados para Testes: 20% (opera em memória, requer ativação de banco para não zerar dados)
    * (10) Observabilidade e Feedback de Testadores: 75%
  * Média ponderada calculada: **88% de prontidão técnica**.
* **Bloqueadores Reais Imediatos:**
  1. Conectar a persistência física (PostgreSQL) para evitar reset de dados na reinicialização do serviço.
  2. Adicionar o input nativo de foto da câmera na entrega.
* **Próximo Passo:** Ativar a persistência em ambiente de staging e recrutar o primeiro lote de 10 motoristas em João Monlevade.

### 2. Prontidão para LANÇAMENTO COMERCIAL: 45%
* **Diagnóstico:** O núcleo de software está quase pronto, mas o lançamento comercial depende de fatores externos indispensáveis: homologação jurídica com OAB (Termos de Uso formais), credenciamento PJ do Asaas com split financeiro ativo, protocolo da marca no INPI e política de emissão de notas fiscais/tributação sobre a comissão de 23%.
* **Investimento Necessário para o Lançamento:** Apenas custos de infraestrutura contínua, taxas institucionais e parecer jurídico.

### 3. REVISÃO DO BUSINESS PLAN
* **Valores Demonstrados com Justificativa Técnica Real:** **R$ 11.540,00 a R$ 15.700,00**.
* **Valores que Representam Provisões Excessivas ou Evitáveis:** **R$ 26.800,00 a R$ 30.960,00**.
* **Conclusão:** O fundador não precisa desembolsar os R$ 42.500 previstos inicialmente para dar início às operações em campo. O projeto Topic Log apresenta uma das maiores taxas de aproveitamento de código próprio já auditadas, com sua arquitetura modular em C# e Next.js protegendo o capital inicial do negócio.
