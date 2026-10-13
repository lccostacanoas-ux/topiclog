# Módulos de Domínio — Topic Log (`services/api/Modules`)

O Monólito Modular está organizado nos **19 módulos** definidos no `02-TRD-Tecnico.md`:

1. `Identity` — Autenticação, sessões seguras, MFA administrativo e controle de acesso.
2. `Profiles` — Dados cadastrais públicos/privados e perfis de veículos (`user_vehicle_profiles`).
3. `Verification` — Fluxo de KYC progressivo (`IKycProvider`, `kyc_cases`, `kyc_checks`).
4. `Shipments` — Publicação de encomendas, validação de peso (5/20/20 kg), endereços privados e interesse em seguro (`D06`).
5. `Trips` — Publicação de viagens/rotas, paradas (`trip_waypoints`) e capacidade ociosa.
6. `Matching` — Cruzamento geoespacial PostGIS entre encomendas e viagens nos municípios de MG (`IMapsProvider`).
7. `Feed` — Listagem paginada e filtrada com preservação de privacidade geográfica.
8. `Negotiation` — Propostas, contrapropostas, expiração e aceite atômico concorrente.
9. `Messaging` — Conversas e mensagens em tempo real (SignalR) isoladas por participantes.
10. `Orders` — Contrato firmado e snapshot comercial imutável (`commission_rate`, `commission_cents`, `carrier_due_cents`).
11. `Fulfillment` — Marcos de transporte, dupla prova de entrega (código hash + foto privada) e fluxo de exceção auditado.
12. `Payments` — Integração de cobrança, webhooks autenticados (`webhook_inbox`) e transferências (`IPaymentProvider` / `AsaasProvider`).
13. `Ledger` — Contabilidade interna de partida dobrada em centavos inteiros (`ledger_accounts`, `ledger_entries`).
14. `Subscriptions` — Pacotes comerciais (`subscription_plans`, `subscription_plan_versions`, Premium R$ 39,90 / 7%).
15. `Reviews` — Avaliações bilaterais pós-operação.
16. `Disputes` — Contestações, evidências e bloqueio imediato de repasse.
17. `Notifications` — Eventos de notificação multicanal (`outbox_events`).
18. `Administration` — Gestão de regiões (MG/IBGE), limites de veículos, comissões, métodos de pagamento e relatórios de margem.
19. `Audit` — Trilha imutável de segurança (`audit_events`) e de políticas administrativas (`admin_policy_events`).

**Regra de Fronteira:** Nenhum módulo pode alterar diretamente entidades de persistência de outro módulo sem passar pelos contratos de aplicação correspondentes.
