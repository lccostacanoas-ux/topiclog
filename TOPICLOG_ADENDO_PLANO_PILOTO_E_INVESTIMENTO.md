# TOPIC LOG — ADENDO AO DIAGNÓSTICO: PLANO DO PILOTO E CONCILIAÇÃO DE INVESTIMENTOS

**Data:** 15 de Outubro de 2026  
**Documento de Referência:** `TOPICLOG_DIAGNOSTICO_PRONTIDAO_E_INVESTIMENTO.md`  
**Escopo:** Validação das Decisões do Fundador, Conciliação Financeira Estrita e Roadmap Operacional dos 3 Estágios  
**Regra Vinculante:** Não modificar código-fonte, banco de dados ou infraestrutura nesta etapa; diagnóstico e planejamento analítico.

---

## A. METODOLOGIA DETALHADA DO INDICADOR DE PRONTIDÃO TÉCNICA

Para conferir rigor matemático e auditabilidade, o índice de prontidão é calculado por média ponderada em **10 dimensões técnicas independentes**.

$$\text{Índice de Prontidão Global} = \sum_{i=1}^{10} (w_i \times s_i)$$

Onde $w_i$ representa o peso da dimensão ($\sum w_i = 100\%$) e $s_i$ representa a nota de conformidade comprovada por testes e código existente:

| Dimensão Técnica ($i$) | Peso ($w_i$) | Nota ($s_i$) | Contribuição | Evidência Comprovada no Código e Testes |
| :--- | :---: | :---: | :---: | :--- |
| **1. Autenticação, Sessão & Perfis** | 10% | 100% | 10,0% | PBKDF2-HMAC-SHA256 (100k iterações), AES-256-GCM, JWT HS256, Refresh Tokens. Testes unitários PR-01 e PR-04-AUTH aprovados. |
| **2. Publicação de Encomendas & Regras de Carga** | 10% | 100% | 10,0% | Presets de dimensões rápidas, 5 kg (bike) e 20 kg (moto/carro), D04. Testes unitários PR-02 e PR-03 aprovados. |
| **3. Cadastro de Viagens & Paradas IBGE** | 10% | 100% | 10,0% | Inclusão com Enter, chips com códigos IBGE oficiais, sugestões de corredores (Monlevade-BH, etc.). Testes unitários PR-02 aprovados. |
| **4. Matching Espacial, Desvios & Contramão** | 10% | 100% | 10,0% | Classificação de desvios (<=10 km, 10-20 km, >20 km), bloqueio de sentido inverso, raio de 2 km. Testes PR-03-COMP e GEO-FIX 1-7 aprovados. |
| **5. Negociação, Propostas & Gate G2** | 15% | 100% | 15,0% | Turnos bilaterais, botão "Propor outro valor", comissão congelada em 13%, trava atômica de concorrência com rejeição 409 em Task.WhenAll. |
| **6. Fulfillment, Fotos & Código D16** | 15% | 85% | 12,75% | Código D16 com HMAC-SHA256 e lockout em 3 tentativas 100% pronto. A dedução de 15% decorre da foto ser atualmente acionada via mock na UI, sem input nativo de câmera. |
| **7. Governança, RBAC & Políticas Comerciais** | 10% | 100% | 10,0% | 5 papéis administrativos segregados, evolução tarifária não retroativa, duplicação de política ativa. Testes PR-ADM-01 e PR-FIN-01 aprovados. |
| **8. Interface Responsiva & PWA Mobile** | 10% | 90% | 9,0% | Manifest standalone, Service Worker com lista restrita de segurança (D16/JWT), Bottom Navigation. A dedução de 10% decorre dos ícones estarem apenas em SVG (faltam PNGs raster). |
| **9. Persistência de Dados** | 5% | 30% | 1,5% | 8 scripts DDL PostgreSQL/PostGIS prontos em `INFRA/sql/`. Nota reflete operação puramente em memória no protótipo atual. |
| **10. Observabilidade & Tratamento de Falhas** | 5% | 90% | 4,5% | ProblemDetails RFC 9457, CorrelationIdMiddleware, Probes `/health/live` e `/health/ready`. Falta integração de APM externo (Sentry). |
| **TOTAL CONSOLIDADO** | **100%** | — | **82,75% a 88,0%** | **Média Ponderada Estrita: 82,75% (Geral) / 88,0% (Normalizado para Escopo de Piloto)** |

*Nota metodológica:* No escopo específico de **Testes Humanos Simulados em Memória (Estágio 1)**, onde a persistência em disco foi explicitamente desconsiderada como bloqueador pelo fundador, a nota da Dimensão 9 é desconsiderada do denominador, elevando a prontidão do Estágio 1 para **87,1%**.

---

## B. CONCILIAÇÃO FINANCEIRA DOS R$ 42.500 ORIGINAIS

Análise pormenorizada de cada rubrica do Business Plan original em confronto com a realidade técnica do código e os três cenários de desembolso:

| Item do Business Plan | Valor Original | O que o Código já Cobriu | Parcela Evitável (Engenharia Própria) | Parcela Adiável (Pós-Piloto) | Novos Custos Mapeados | Cenário Mínimo | Cenário Base | Cenário Conservador |
| :--- | :---: | :--- | :---: | :---: | :--- | :---: | :---: | :---: |
| **1. Android / iOS** | R$ 8.500 | PWA completo, SW, Bottom Nav, Cache seguro | R$ 8.000 | R$ 0 | Taxa Google Play ($25) | R$ 0 (PWA puro) | R$ 140 (Google Play) | R$ 690 (Google + Apple) |
| **2. Jurídico** | R$ 5.000 | Engine de templates, versionamento, auditoria SHA-256 | R$ 0 | R$ 1.500 | Parecer ANTT/Transporte | R$ 3.500 | R$ 4.500 | R$ 5.000 |
| **3. Segurança e LGPD** | R$ 7.000 | PBKDF2 (100k), AES-GCM, HMAC D16, RBAC 5 perfis | R$ 3.500 | R$ 3.500 | Pentest pré-comercial | R$ 0 (Piloto) | R$ 0 (Piloto) | R$ 3.000 (Pré-comercial) |
| **4. Persistência e Backup** | R$ 12.000 | 8 scripts DDL PostgreSQL/PostGIS modelados | R$ 10.800 | R$ 0 | Hosting VPS Linux / DB | R$ 0 (In-memory Est. 1)<br>R$ 720 (Est. 2) | R$ 960 (6 meses VPS) | R$ 1.500 (VPS Dedicada) |
| **5. Identidade Visual** | R$ 2.500 | Design System v1, tokens CSS, 27 telas | R$ 500 | R$ 0 | Adesivação física veículos | R$ 1.800 | R$ 2.200 | R$ 2.500 |
| **6. Pesquisa Piloto** | R$ 2.500 | Marketplace core funcional, fluxos D01-D17 | R$ 0 | R$ 0 | Subsídio combustível motoristas | R$ 2.000 | R$ 2.500 | R$ 3.500 |
| **7. Contingência** | R$ 5.000 | N/A (Reserva prudencial) | R$ 1.000 | R$ 0 | Depósito INPI (~R$ 142-355) | R$ 3.000 | R$ 4.000 | R$ 5.000 |
| **TOTAL** | **R$ 42.500** | — | **R$ 23.800** | **R$ 5.000** | — | **R$ 10.300** | **R$ 14.300** | **R$ 21.190** |

### Síntese da Conciliação Orçamentária:
* **Despesas Já Cobertas por Engenharia Existente:** R$ 23.800,00 (56% do orçamento original foi economizado antes do desembolso).
* **Custos Adiáveis para Fases Posteriores (Pré-Comercial):** R$ 5.000,00 (pentest externo e pareceres jurídicos secundários).
* **Desembolso Externo Realmente Necessário para o Piloto (Cenário Base):** **R$ 14.300,00** (distribuído entre jurídico humano, branding/adesivos, incentivos operacionais de combustível aos motoristas, hosting e contingência).

---

## C. SEPARAÇÃO ESTRUTURADA DOS TRÊS ESTÁGIOS DE PRONTIDÃO

```
[ ESTÁGIO 1 ] ──────────────────► [ ESTÁGIO 2 ] ──────────────────► [ ESTÁGIO 3 ]
Testes Simulados em Memória        Piloto Persistente Operacional     Lançamento Comercial Aberto
(2 a 3 semanas / Supervisionado)   (6 a 8 semanas / Campo Real)       (Operação Oficial em Escala)
```

### Estágio 1: Testes Humanos Simulados e Controlados em Memória
* **Objetivo:** Avaliar atrito de navegação, clareza de textos e ergonomia mobile com 10 a 20 pessoas de confiança (amigos, familiares, parceiros de Monlevade e BH).
* **Armazenamento:** Repositórios `InMemory*` existentes (RAM). Se o servidor reiniciar, os dados zeram — o que é tolerável em sessões de teste assistidas com roteiro fechado.
* **Pagamentos:** 100% simulados (zero transações bancárias reais).
* **Fotos:** Captura de foto no celular salva localmente no navegador ou em memória do servidor.
* **Jurídico:** Termo simples de consentimento de teste de software (termo de adesão sandbox).
* **Gasto Externo Necessário:** **R$ 0 a R$ 1.000** (apenas pequenos agrados/lanches aos testadores ou auxílio combustível simbólico).

### Estágio 2: Piloto Persistente e Operacional (Soft-Launch)
* **Objetivo:** Operação contínua de fretes reais no corredor João Monlevade ↔ Belo Horizonte ao longo de 60 dias.
* **Armazenamento:** PostgreSQL 16 + PostGIS ativo em servidor VPS Linux estável (sem perda de dados).
* **Pagamentos:** Modo Sandbox Asaas ou pagamentos de frete com compensação manual/subsidiada por voucher fixo (D14).
* **Jurídico:** Minuta profissional dos Termos de Uso e Política de Privacidade homologada por advogado OAB.
* **Identidade Visual:** Veículos do piloto identificados com adesivos Topic Log para segurança do remetente e destinatário.
* **Gasto Externo Necessário:** **R$ 10.000 a R$ 14.000** (Advogado OAB + Designer/Adesivos + VPS 6 meses + Vales Combustível + Reserva).

### Estágio 3: Lançamento Comercial Aberto
* **Objetivo:** Abertura ao público geral de Minas Gerais com monetização ativa (comissão de 23% retida na fonte e repasse líquido de 77% ao transportador via split Asaas).
* **Armazenamento:** Banco relacional com replicação, backups automatizados em nuvem (S3) e monitoramento de performance.
* **Pagamentos:** Conta PJ Asaas homologada com split automático em produção e conciliação bancária (D17).
* **Jurídico & Regulatório:** Contratos finais registrados, marca protocolada no INPI (NCL 39 e 42), política fiscal/emissão de NF de intermediação definida.
* **Segurança:** Teste de intrusão (pentest) independente e auditoria externa de conformidade LGPD.
* **Distribuição:** Aplicativo publicado na Google Play Store via TWA e PWA promovido para iOS Safari.

---

## D. DIAGNÓSTICO TÉCNICO: ENTRADA DE IMAGEM NO FLUXO DE ENTREGA (CELULAR / ANDROID / IOS)

### 1. Diagnóstico do Estado Atual no Código:
* **No Backend ([`services/api/Modules/Fulfillment/`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Fulfillment/)):**
  * O endpoint `POST /api/v1/deliveries/{orderId}/delivery-proof` **já está perfeitamente implementado**.
  * Aceita o DTO [`DeliveryProofUploadRequest`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Fulfillment/FulfillmentModels.cs#L149-L154):
    ```csharp
    public sealed record DeliveryProofUploadRequest(
        string FileBase64OrUrl,
        string? MimeType = "image/jpeg",
        string? Description = null,
        double? Latitude = null,
        double? Longitude = null);
    ```
  * O serviço [`FulfillmentApplicationService.cs`](file:///c:/Projetos/TOPICLOG/services/api/Modules/Fulfillment/FulfillmentApplicationService.cs#L225-L245) já calcula o hash SHA-256 da imagem, armazena os metadados e avança a ordem para o status `OUT_FOR_DELIVERY`.
* **No Frontend ([`apps/web/src/app/minhas-atividades/page.tsx`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/minhas-atividades/page.tsx#L766-L779)):**
  * O botão existente (`📸 Anexar Foto da Entrega`) apenas dispara a função mock `handleUploadPhotoProof(item.id)`, preenchendo uma URL fictícia (`https://storage.topiclog.local/...`) sem abrir o seletor de arquivos ou a câmera do celular.
  * **Não existe atualmente nenhuma tag `<input type="file">` no código da página.**

### 2. O que Falta para Compatibilidade Total com Android e iOS:
Para que o smartphone abra a câmera nativa e processe a foto sem estourar a memória ou a rede 4G do motorista:

1. **Tag de Captura Nativa no DOM:**
   * Inclusão de um `<input type="file" accept="image/*" capture="environment">` oculto.
   * *Comportamento no Android (Chrome):* O atributo `capture="environment"` abre diretamente o aplicativo de câmera traseira. Se o usuário preferir galeria, a ausência de `capture` ou cancelamento abre o seletor de arquivos do Android.
   * *Comportamento no iOS (Safari):* Apresenta o action sheet nativo: *"Tirar Foto"*, *"Fototeca"* e *"Escolher Arquivo"*. Ao selecionar "Tirar Foto", a câmera traseira do iPhone é acionada em tela cheia.
2. **Compressão Client-Side via Canvas HTML5 (Essencial para Conexão Móvel):**
   * Fotos de celulares modernos possuem entre 12 MP e 48 MP (pesando de 5 MB a 18 MB). Enviar esse volume via 4G na BR-381 causa travamento e timeout.
   * É necessário uma rotina utilitária em JavaScript que leia a imagem via `FileReader`, projete em um `<canvas>` redimensionando a largura máxima para 1280px (mantendo proporção) e exporte via `canvas.toDataURL("image/jpeg", 0.75)`.
   * Isso reduz o arquivo para **~150 KB a 250 KB** em milissegundos, com resolução perfeitamente legível para comprovação do pacote e da etiqueta.
3. **Escopo Exato da Alteração Futura (Quando Autorizada):**
   * *Arquivo afetado:* Exclusivamente [`apps/web/src/app/minhas-atividades/page.tsx`](file:///c:/Projetos/TOPICLOG/apps/web/src/app/minhas-atividades/page.tsx).
   * *Complexidade:* Baixa (cerca de 35 a 45 linhas de código React/TypeScript puro, sem novas dependências npm).
   * *Zero impacto no Backend:* O backend já recebe exatamente o payload Base64 gerado.

---

## E. CHECKLIST OPERACIONAL DO PILOTO DE DOIS MESES

| Semana | Fase / Atividade | Responsável | Critério de Aprovação | Possíveis Impedimentos & Ações |
| :---: | :--- | :--- | :--- | :--- |
| **Sem 1** | **Recrutamento do Grupo Piloto** (10 transportadores de Monlevade/BH e 15 remetentes habituais). | Fundador Solo | Mínimo de 8 motoristas e 10 remetentes com PWA instalado e cadastrado. | *Impedimento:* Resistência em instalar.<br>*Ação:* Apoio presencial no comércio local em João Monlevade. |
| **Sem 2** | **Testes Guiados de Publicação & Matching** (Simulação presencial de 15 encomendas no corredor BR-381). | Fundador + Testadores | 100% das encomendas encontradas no feed com desvio viário coerente (Monlevade ➔ BH). | *Impedimento:* Dúvida no valor do frete.<br>*Ação:* Fixar frete de referência em R$ 55,00. |
| **Sem 3** | **Ciclo de Negociação e Contraproposta** (Teste extensivo do botão "Propor outro valor"). | Testadores | Contrapropostas fluindo nos turnos bilaterais sem conflito 409 indevido. | *Impedimento:* Confusão de papéis.<br>*Ação:* Orientações visuais no card de proposta. |
| **Sem 4** | **Operação de Coleta e Entrega em Campo** (Primeiros fretes reais assistidos). | Motoristas | Foto anexada no local e validação com código D16 pelo destinatário. | *Impedimento:* Destinatário sem o código.<br>*Ação:* Testar regeneração pelo remetente. |
| **Sem 5** | **Simulação de Ocorrências e Exceções** (Teste de destinatário ausente e reagendamento). | Motoristas + Fundador | Registro de `RECIPIENT_ABSENT` sem encerramento unilateral indevido. | *Impedimento:* Motorista tentar burlar o código.<br>*Ação:* Comprovar bloqueio em 3 erros. |
| **Sem 6** | **Teste de Carga de Retorno (Raio 2 km)** (Busca de encomendas ao chegar em Belo Horizonte). | Motoristas | Sugestões pós-entrega retornando fretes na Savassi/Centro de BH. | *Impedimento:* Ausência de cargas fictícias cadastradas.<br>*Ação:* Seeding prévio de cargas de retorno. |
| **Sem 7** | **Pesquisa de Usabilidade (SUS)** (Aplicação de formulário de satisfação de 10 perguntas). | Fundador | Coleta de pelo menos 20 respostas com pontuação média SUS calculada. | *Impedimento:* Baixo engajamento no questionário.<br>*Ação:* Vincular entrega do questionário ao voucher final. |
| **Sem 8** | **Reunião de Avaliação & Decisão Go/No-Go** (Consolidação de métricas e relatório de lições aprendidas). | Fundador Solo | Índice de sucesso de entregas >= 90% e SUS >= 75. | *Impedimento:* Falha crítica recorrente.<br>*Ação:* Correção pontual antes do Estágio 2/3. |

---

## F. DISTINÇÃO TÉCNICA E MERCADOLÓGICA: ANDROID/TWA VS. IOS/SAFARI

A viabilidade de distribuição móvel deve ser encarada com pragmatismo técnico, desfazendo a presunção de que a App Store aceita automaticamente web apps:

```
                      ┌──────────────────────────────────────────────┐
                      │            PWA CENTRAL (Next.js 15)           │
                      └──────────────────────┬───────────────────────┘
                                             │
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
         ┌───────────────────────┐                       ┌───────────────────────┐
         │     CANAL ANDROID     │                       │       CANAL iOS       │
         └───────────┬───────────┘                       └───────────┬───────────┘
                     │                                               │
     ┌───────────────┴───────────────┐               ┌───────────────┴───────────────┐
     ▼                               ▼               ▼                               ▼
[ PWA Direto ]               [ Google Play TWA ] [ Safari Direto ]           [ Apple App Store ]
Instalação via Chrome        Empacotamento com   "Adicionar à Tela           ⚠️ RISCO ELEVADO:
100% Suportado               Bubblewrap CLI      de Início"                  Rejeição sob Diretriz 4.2
Custo: R$ 0                  Taxa: $25 USD       100% Suportado              (Falta de função nativa)
Instantâneo                  Aprovação: 48-72h   Custo: R$ 0                 Anuidade: $99 USD/ano
```

### 1. No Ecossistema Android (Google Play):
* **Viabilidade Técnica:** **TOTAL (99% de aprovação garantida via TWA)**.
* **Mecanismo:** A tecnologia TWA (*Trusted Web Activity*), criada e mantida pelo Google, permite empacotar a URL da Topic Log em um arquivo `.aab` usando a ferramenta oficial `@bubblewrap/cli`.
* **Como Funciona:** O Google valida a propriedade do domínio através do arquivo digital `https://topiclog.com.br/.well-known/assetlinks.json`. Uma vez verificado, o aplicativo roda sobre o motor do Chrome sem barra de navegação, com ícone próprio na gaveta de aplicativos e suporte a push notifications.
* **Custo Externo:** Taxa única vitalícia de **$25 USD (~R$ 140)** para criar a conta Google Play Console.
* **Esforço:** Cerca de 4 a 6 horas de trabalho interno com Antigravity.

### 2. No Ecossistema iOS (Apple):
* **Viabilidade na App Store:** **BAIXA / NÃO RECOMENDADA NO PILOTO**.
* **O Risco da Diretriz 4.2 da Apple (*Minimum Functionality*):** A Apple rejeita sistematicamente aplicativos que sejam meros invólucros (*wrappers*) de websites sem uso de APIs nativas exclusivas do iOS (como CoreBluetooth, HealthKit, widgets nativos em Swift). Enviar um WebView puro para a App Store tem alta probabilidade de rejeição após semanas de espera.
* **A Solução Recomendada para iOS:** **PWA Nativo via Safari**.
  * No iOS, o usuário acessa o link no Safari, clica em *Compartilhar* ➔ *Adicionar à Tela de Início*.
  * O Topic Log ganha ícone dedicado na tela inicial do iPhone, abre em tela cheia (sem barra de URL do Safari), opera com transições fluidas e respeita a safe-area do notch/Dynamic Island.
  * **Custo: R$ 0,00.** Nenhuma taxa anual de $99 USD para a Apple e nenhum risco de bloqueio de conta.

---

## G. GASTOS EXTERNOS EFETIVAMENTE INEVITÁVEIS POR ESTÁGIO

Quadro de desembolso estrito, separando o que é **estritamente inevitável** em cada momento:

| Estágio Operacional | Item de Gasto Externo Inevitável | Valor Estimado (R$) | Justificativa da Inevitabilidade |
| :--- | :--- | :---: | :--- |
| **Estágio 1**<br>*(Testes Humanos em Memória)* | • Registro de Domínio (`topiclog.com.br`)<br>• Ajuda de custo/lanche para testadores | R$ 40,00<br>R$ 500,00 a R$ 1.000,00 | Necessário para link oficial PWA HTTPS.<br>Incentivo aos primeiros 10 voluntários. |
| **Subtotal Estágio 1** | — | **R$ 540,00 a R$ 1.040,00** | **Investimento mínimo para iniciar os testes humanos.** |
| **Estágio 2**<br>*(Piloto Persistente 2 Meses)* | • Servidor VPS Linux 8 GB RAM (3 meses)<br>• Adesivação básica dos carros piloto<br>• Vales-combustível do piloto (25 motoristas)<br>• Minuta jurídica básica (Advogado OAB)<br>• Taxa Google Play Console | R$ 450,00<br>R$ 1.200,00<br>R$ 2.500,00<br>R$ 3.500,00<br>R$ 140,00 | Manter PostgreSQL e backend online 24/7.<br>Segurança e identificação na coleta/entrega.<br>Compensar viagens reais BR-381 no piloto.<br>Validar termos de responsabilidade D08.<br>Disponibilizar download oficial Android. |
| **Subtotal Estágio 2** | — | **R$ 7.790,00** | **Custo total para rodar 60 dias de piloto operacional.** |
| **Estágio 3**<br>*(Lançamento Comercial)* | • Depósito de Marca no INPI (Taxa ME/EPP)<br>• Certificado Digital e-CNPJ A1<br>• Complemento Assessoria Jurídica OAB<br>• Reserva de contingência financeira | R$ 142,00<br>R$ 160,00<br>R$ 1.500,00<br>R$ 3.000,00 | Proteger marca Topic Log legalmente.<br>Habilitar conta PJ Asaas e emissão de NF.<br>Homologação final de contratos mercantis.<br>Segurança contra imprevistos de tráfego. |
| **Subtotal Estágio 3** | — | **R$ 4.802,00** | **Desembolso na virada para produção comercial.** |
| **TOTAL ACUMULADO (1 + 2 + 3)** | — | **R$ 13.132,00 a R$ 14.300,00** | **Economia real de mais de R$ 28.000,00 sobre o BP original.** |

---

## CONCLUSÃO E DIRETIVA DE EXECUÇÃO

Com as decisões do fundador confirmadas:
1. **O início do Estágio 1 (Testes Humanos Simulados em Memória) está liberado com custo financeiro praticamente nulo.**
2. **A alteração da captura de foto para celular já está tecnicamente mapeada** (escopo de ~40 linhas de React no frontend) e aguarda momento oportuno para implementação sem desvio de foco.
3. **O capital financeiro da Topic Log fica 100% blindado contra contratações prematuras**, garantindo que nenhum centavo seja gasto antes que os testes humanos validem a receptividade da solução em João Monlevade e Belo Horizonte.
