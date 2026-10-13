# Backlog Ordenado e Critérios de Aceite da Fase PR-00

## 1. Subdivisão Verificável da Fase `PR-00`

Para garantir controle total, baixo consumo de recursos (~8 GB RAM) e revisão passo a passo, a fase `PR-00` está dividida em **3 subetapas**:

| Subetapa | Escopo | Critério de Verificação |
|---|---|---|
| **PR-00.1** *(Atual)* | Inicialização do Git local, arquivos de configuração raiz (`.gitignore`, `.editorconfig`, `global.json` .NET 10, `Directory.Build.props`), ADRs (`0001` a `0004`), Matriz de Rastreabilidade e preparação estrutural da Solution `.sln`, `.csproj` (`net10.0`) e manifesto `package.json`. | Diretórios e arquivos criados sem sobrescrever `DOCS/`; Solution `.NET 10` estruturada e validada pelo CLI do `.NET 10.0.401`. |
| **PR-00.2** | Código base do Backend (`TopicLog.Api` e `TopicLog.Worker` em `.NET 10`): `FeatureFlagsOptions` (`D01`–`D17`), políticas iniciais (5/20/20 kg, 13% Free, 7% Premium), `ProblemDetails`, `CorrelationIdMiddleware`, endpoints `/health/live`, `/health/ready`, `/api/v1/system/feature-flags`, contrato OpenAPI e suíte de testes unitários/integração do `PR-00`. | `dotnet build` e `dotnet test` passando 100% sem warnings e sem necessidade de dependências externas não autorizadas. |
| **PR-00.3** | Esqueleto do Frontend (`apps/web` com tokens do `04-Design-System.md` e tela de status do ambiente de testes), scripts PowerShell (`scripts/`) e verificação/configuração autorizada do PostgreSQL + PostGIS local. | Frontend e API executando localmente de forma integrada dentro do orçamento de 8 GB de RAM. |

---

## 2. Backlog Geral de PRs com Dependências Ajustadas

| Ordem | PR | Entrega Principal | Dependências | Gate |
|---|---|---|---|---|
| 1 | **PR-00** | Monorepo, `.NET 10`, Next.js, ADRs, Feature Flags, Health Checks, OpenAPI | Nenhuma | **G0** |
| 2 | **PR-01** | Cadastro e navegação sem KYC; RBAC/ABAC; estrutura `kyc_cases`/`kyc_checks` e bloqueio bilateral na contratação | `PR-00` | **G1** |
| 3 | **PR-02** | Municípios MG (`service_regions` com João Monlevade e BH priorizados), modais (`BICYCLE`, `MOTORCYCLE`, `CAR`), limites `5/20/20 kg`, encomendas, viagens, interesse em seguro (`D06`) e storage privado | `PR-01` | — |
| 4 | **PR-03** | Feed paginado, filtros MG/modal, matching geográfico PostGIS e mapa gratuito licenciado (`IMapsProvider`) | `PR-02` | — |
| 5 | **PR-04** | Propostas, contrapropostas, aceite único transacional (`409` em concorrência), validação KYC bilateral e snapshot imutável de comissão (`13%` / `7%`) | `PR-01`, `PR-02`, `PR-03` | **G2** |
| 6 | **PR-05** | Chat SignalR restrito aos participantes, anexos privados, denúncia/moderação e notificações | `PR-04` | — |
| 7 | **PR-06** | Execução do pedido, entrega com dupla prova (**código hash único + foto privada**), fluxo de exceção com revisor humano autorizado, disputas e avaliações | `PR-04`, `PR-05` | **G3** |
| 8 | **PR-FIN-01** | Gestão administrativa de comissões (`13%`), Premium (`R$ 39,90` / `7%`), criação de novos pacotes, vigência futura e auditoria | `PR-04` | — |
| 9 | **PR-FIN-02** | Métodos de pagamento e tarifas administráveis (`payment_method_capabilities`, `payment_fee_schedules`), aviso de desativação e absorção de custos pela Topic Log | `PR-FIN-01` | — |
| 10 | **PR-FIN-03** | `IPaymentProvider` + adaptador `AsaasProvider` (sandbox), `webhook_inbox` autenticado/deduplicado e conciliação | `PR-FIN-02` | — |
| 11 | **PR-FIN-04** | Ledger de partida dobrada (`ledger_accounts`, `ledger_entries`), elegibilidade de repasse pós-entrega e transferência idempotente (`transfers`, `payouts`) | `PR-06`, `PR-FIN-03` | **G4** |
| 12 | **PR-FIN-05** | Recorrência de assinatura, estornos, chargebacks, relatórios de margem líquida e segregação fiscal (Lucro Presumido / Reforma Tributária) | `PR-FIN-04` | — |
| 13 | **PR-07** | Hardening de segurança, acessibilidade WCAG 2.2 AA, testes E2E/carga e preparação do piloto em João Monlevade e Belo Horizonte | Todos os anteriores | **G5 / G6** |
