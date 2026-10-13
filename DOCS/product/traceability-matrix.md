# Matriz de Rastreabilidade — Topic Log (v2.0)

Este documento mapeia as **Decisões Vinculantes (`D01` a `D17`)** e os **Requisitos Funcionais (`PRD-01` a `PRD-15`)** para os módulos do monólito modular, tabelas do banco de dados, suítes de testes e PRs de entrega.

---

## 1. Decisões Vinculantes (`D01` a `D17`)

| ID | Decisão Aprovada | Módulo(s) Principal(is) | Tabelas / Estruturas | Testes de Verificação | PR Alvo |
|---|---|---|---|---|---|
| **D01** | Nome **Topic Log**, domínio pretendido `www.topiclog.com.br` (registro pendente) | `Administration`, `Web UI` | Configurações / Metadados | Teste de UI/Copy (sem alegar marca registrada) | `PR-00` |
| **D02** | Cobertura em **Minas Gerais** (853 municípios IBGE); piloto **João Monlevade** (1º) e **Belo Horizonte** (2º) | `Administration`, `Shipments`, `Trips`, `Matching`, `Feed` | `service_regions` | Filtro por código IBGE, ordenação de prioridade piloto | `PR-02`, `PR-03` |
| **D03** | Modais **Bicicleta, Motocicleta e Carro** desde o início; pequenas encomendas | `Profiles`, `Shipments`, `Trips`, `Matching` | `vehicle_types`, `user_vehicle_profiles` | Validação de modal permitido na publicação e proposta | `PR-02` |
| **D04** | Peso máximo padrão: **5 kg bicicleta** (`5000 g`), **20 kg moto** (`20000 g`), **20 kg carro** (`20000 g`), configurável e auditável | `Administration`, `Shipments`, `Trips` | `vehicle_limit_versions`, `admin_policy_events` | `5001 g` bloqueia bicicleta; `20001 g` bloqueia moto/carro | `PR-02` |
| **D05** | Cadastro/navegação sem KYC; **KYC bilateral obrigatório antes da contratação** (CPF, doc, endereço, face); LGPD | `Identity`, `Verification`, `Negotiation`, `Orders` | `kyc_cases`, `kyc_checks` | Bloqueio transacional de aceite se remetente ou transportador != `VERIFIED` | `PR-01`, `PR-04` |
| **D06** | **Seguro não comercializado** no MVP; apenas registro de interesse com aviso explícito | `Shipments`, `Administration` | `insurance_interests` | Persistência do interesse sem cobrança; exibição do disclaimer obrigatório | `PR-02` |
| **D07** | **Asaas** como gateway prioritário (sandbox até homologação); repasse pós-entrega | `Payments`, `Fulfillment`, `Ledger` | `payment_intents`, `payment_events`, `webhook_inbox`, `transfers` | Adaptador `AsaasProvider` em sandbox; proibição de pagamento real sem flag homologada | `PR-FIN-03`, `PR-FIN-04` |
| **D08** | Contratos distribuem responsabilidades dentro da lei; sem cláusula de isenção absoluta | `Identity`, `Orders`, `Disputes` | `orders`, `audit_events` | Aceite de termos versionados antes da contratação | `PR-01`, `PR-04` |
| **D09** | Regime pretendido **Lucro Presumido**, separando receitas de intermediação/assinatura de valores de terceiros | `Ledger`, `Administration` | `ledger_accounts`, `ledger_entries` | Segregação contábil entre comissão, mensalidade, repasse e despesa de gateway | `PR-FIN-04`, `PR-FIN-05` |
| **D10** | Comissão gratuita inicial **13%**, configurável, versionada, auditada e **sem efeito retroativo** | `Administration`, `Orders`, `Ledger` | `commission_policy_versions`, `orders`, `admin_policy_events` | Mudança de 13% -> 14% não altera contratos anteriores; congela snapshot no `orders` | `PR-04`, `PR-FIN-01` |
| **D11** | **Premium inicial R$ 39,90/mês e 7%** de comissão; criação de novos pacotes pelo admin | `Subscriptions`, `Administration`, `Orders` | `subscription_plans`, `subscription_plan_versions`, `subscriptions` | Aplicação de 7% para assinante ativo no momento do aceite; novos pacotes configuráveis | `PR-FIN-01`, `PR-FIN-05` |
| **D12** | **Topic Log absorve taxas ordinárias de gateway** (Pix, débito, crédito, parcelas, transferência) | `Payments`, `Ledger`, `Orders` | `payment_fee_schedules`, `payment_events`, `ledger_entries` | Mesmo valor final para o remetente em qualquer modalidade; líquido do transportador intacto | `PR-FIN-02`, `PR-FIN-04` |
| **D13** | Métodos de pagamento configuráveis pelo admin; aviso ao desabilitar; apenas meios suportados pelo Asaas | `Administration`, `Payments` | `payment_method_capabilities`, `admin_policy_events` | Desativar método exibe aviso no checkout e bloqueia submissão na modalidade inativa | `PR-FIN-02` |
| **D14** | Ambiente inicial de **testes**; produção futura em AWS ou KingHost | `Common`, `Infrastructure` | Feature Flags / Configuração de Ambiente | Banner/indicador de ambiente de testes; bloqueio de chaves de produção | `PR-00` |
| **D15** | Mapas com solução gratuita no protótipo (OSM/Leaflet/Nominatim com respeito a licença/limites) | `Matching`, `Feed`, `Infrastructure` | `IMapsProvider`, cache local de geocodificação | Abstração via interface permitindo troca futura para Google Maps | `PR-03` |
| **D16** | Entrega normal exige **código de segurança válido + foto privada**; exceção auditada com revisor autorizado | `Fulfillment`, `Disputes`, `Audit` | `delivery_challenges`, `delivery_proofs`, `delivery_exceptions` | Código sem foto não confirma; ato unilateral do transportador nunca libera repasse | `PR-06` |
| **D17** | Transferência somente após pagamento confirmado, entrega validada e ausência de disputa/bloqueio | `Payments`, `Ledger`, `Fulfillment`, `Disputes` | `transfers`, `payouts`, `ledger_entries` | Idempotência de transferência; distinção entre ordem de transferência e liquidação bancária | `PR-FIN-04` |

---

## 2. Histórias de Usuário do Produto (`PRD-01` a `PRD-15`)

| ID | Requisito | Módulo(s) | Rotas Principais | Testes Obrigatórios | PR Alvo |
|---|---|---|---|---|---|
| **PRD-01** | Criar conta e autenticar-se | `Identity`, `Profiles` | `POST /api/v1/auth/register`, `GET/PATCH /api/v1/me` | Sessão segura, RBAC/ABAC, bloqueio de brute-force | `PR-01` |
| **PRD-02** | Configurar perfil transportador e verificar identidade (KYC) | `Profiles`, `Verification` | `POST /api/v1/verification/cases`, `GET /api/v1/me` | Transições `NOT_STARTED -> PENDING -> IN_REVIEW -> VERIFIED/REJECTED` | `PR-01` |
| **PRD-03** | Publicar encomenda com origem/destino e peso | `Shipments` | `POST/GET /api/v1/shipments`, `GET/PATCH /api/v1/shipments/{id}` | Endereço exato oculto no feed público; validação 5/20/20 kg | `PR-02` |
| **PRD-04** | Publicar viagem/rota e capacidade | `Trips` | `POST/GET /api/v1/trips` | Validação de modal, janela temporal e capacidade em gramas | `PR-02` |
| **PRD-05** | Visualizar feed filtrado e oportunidades | `Feed`, `Matching` | `GET /api/v1/feed`, `GET /api/v1/matches` | Paginação por cursor, filtros por município MG/modal, privacidade | `PR-03` |
| **PRD-06** | Enviar propostas, contrapropostas e aceitar | `Negotiation`, `Orders` | `POST /api/v1/shipments/{id}/proposals`, `POST /api/v1/proposals/{id}/accept` | Aceite concorrente (`409 Conflict`), verificação KYC bilateral, snapshot | `PR-04` |
| **PRD-07** | Chat vinculado à negociação | `Messaging`, `Notifications` | `POST/GET /api/v1/conversations/{id}/messages`, Hub SignalR | Isolamento estrito a participantes (`403 Forbidden` para terceiros) | `PR-05` |
| **PRD-08** | Pagar com métodos disponíveis sem sobretaxa | `Payments`, `Orders` | `POST /api/v1/orders/{id}/checkout`, `POST /api/v1/webhooks/asaas` | Mesmo preço em todas as modalidades habilitadas; deduplicação de webhook | `PR-FIN-02`, `PR-FIN-03` |
| **PRD-09** | Confirmar entrega (Código + Foto ou Exceção) | `Fulfillment` | `POST /api/v1/orders/{id}/delivery-proof`, `POST /api/v1/orders/{id}/confirm-delivery` | Hash de código único, limite de tentativas, foto obrigatória, fluxo de exceção | `PR-06` |
| **PRD-10** | Receber repasse após entrega válida | `Payments`, `Ledger` | Processamento assíncrono elegível + `GET /api/v1/orders/{id}` | Bloqueio antes da elegibilidade; idempotência de transferência | `PR-FIN-04` |
| **PRD-11** | Avaliar após operação concluída | `Reviews` | `POST /api/v1/orders/{id}/reviews` | Uma avaliação por papel/pedido apenas após estado `DELIVERED`/`CLOSED` | `PR-06` |
| **PRD-12** | Abrir disputa e bloquear repasse | `Disputes`, `Fulfillment` | `POST /api/v1/orders/{id}/disputes` | Congelamento imediato de transferência pendente; trilha de evidências | `PR-06` |
| **PRD-13** | Alterar comissão pelo painel administrativo | `Administration`, `Audit` | `POST /api/v1/admin/commission-policies` | Vigência futura, justificativa obrigatória, auditoria e imutabilidade | `PR-FIN-01` |
| **PRD-14** | Relatórios de margem e tarifas por modalidade | `Administration`, `Ledger` | `GET /api/v1/admin/finance/summary`, `GET /api/v1/admin/payment-fees` | Separação de receita bruta, comissão, taxa Asaas absorvida e margem líquida | `PR-FIN-02`, `PR-FIN-05` |
| **PRD-15** | Assinar pacote Premium | `Subscriptions` | `POST /api/v1/subscriptions` | Cobrança separada, comissão de 7% apenas para novos aceites, sem burlar KYC | `PR-FIN-01`, `PR-FIN-05` |
