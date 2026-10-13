# ADR-0004: Consolidação do Modelo de Dados PostgreSQL + PostGIS e Privacidade

- **Status:** Aprovado
- **Data:** 12/10/2026
- **Decisores:** Arquitetura Principal Topic Log
- **Decisões Vinculantes Relacionadas:** `D02`, `D03`, `D04`, `D05`, `D06`, `D10`, `D11`, `D13`, `D16`

## Contexto
O documento `05-Banco-de-Dados.md` possui um **Adendo v2.0** (com precedência vinculante) e um **Catálogo Histórico v1.0**. A leitura cruzada identificou sobreposições de nomenclatura entre tabelas do Adendo e do Catálogo Histórico, além da necessidade de vincular explicitamente os municípios de Minas Gerais (IBGE) e os tipos de veículos (`BICYCLE`, `MOTORCYCLE`, `CAR`) às encomendas e viagens.

## Decisão
1. **Unificação de Tabelas Sobrepostas:**
   - **Verificação de Identidade (KYC):** Adotar `kyc_cases` e `kyc_checks` (em substituição a `verification_cases`), armazenando apenas referências seguras, metadados de status e validade, sem biometria bruta.
   - **Planos de Assinatura:** Adotar `subscription_plans` (identificador do plano, ex.: `FREE`, `PREMIUM`) em conjunto com `subscription_plan_versions` (preço em centavos, vínculo com `commission_policy_versions`, benefícios e vigência).
   - **Capacidades e Tarifas de Pagamento:** Manter `payment_method_capabilities` (habilitação administrativa, homologação Asaas, máximo de parcelas e aviso de desativação) vinculada a `payment_fee_schedules` (custos reais do gateway por método e parcela para apuração de margem).
   - **Auditoria:** Manter `audit_events` para trilha de segurança geral (append-only) e `admin_policy_events` para mudanças de políticas comerciais/operacionais com justificativa, estado anterior/posterior e vigência.
2. **Enriquecimento Geográfico (MG) e de Modais em `shipments` e `trips`:**
   - `service_regions` armazena todos os municípios atendidos (`uf = 'MG'`, `ibge_code`, `name`, `priority_order`, `is_enabled`, `is_pilot`), com **João Monlevade** (`ibge_code = '3136207'`, prioridade 1) e **Belo Horizonte** (`ibge_code = '3106200'`, prioridade 2).
   - `shipments` e `trips` referenciam explicitamente os códigos IBGE de origem/destino e os modais (`BICYCLE`, `MOTORCYCLE`, `CAR`), validando `weight_g` contra a versão vigente de `vehicle_limit_versions` (seeds iniciais: `5000 g`, `20000 g`, `20000 g`).
3. **Privacidade Geográfica e de Dados Pessoais (LGPD):**
   - `shipment_addresses` separa o ponto geográfico aproximado (`approximate_point` PostGIS `geography(Point, 4326)`, único campo exposto no feed e usado no índice `GIST`) do endereço completo criptografado (`address_encrypted`), acessível exclusivamente às partes autorizadas após contratação/permissão.

## Consequências
- **Positivas:** Elimina ambiguidades antes da geração das migrations no `PR-01`/`PR-02`; garante conformidade nativa com as regras `D02`, `D03`, `D04` e `D05`.
- **Negativas / Riscos:** Requer que a extensão `postgis` esteja instalada na instância PostgreSQL local quando os testes de integração geoespacial forem executados.
