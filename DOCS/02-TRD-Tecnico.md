# 02 — TRD | Requisitos Técnicos e Arquitetura

# Topic Log — Atualização vinculante v2.0 (12/10/2026)

**Precedência:** estas decisões aprovadas substituem qualquer hipótese ou valor incompatível no documento histórico abaixo. A operação real depende de homologação técnica, jurídica e contratual.

| ID | Decisão aprovada |
|---|---|
| D01 | Nome **Topic Log**, domínio pretendido **www.topiclog.com.br**; registro e marca ainda não verificados |
| D02 | Atender **todo o estado de Minas Gerais**, com prioridade de implantação **João Monlevade**, depois **Belo Horizonte** |
| D03 | **Bicicleta, motocicleta e carro** desde o início; encomendas pequenas |
| D04 | Peso máximo padrão: **5 kg bicicleta**, **20 kg motocicleta** e **20 kg carro**, alterável pelo administrador e sujeito à capacidade real e legislação |
| D05 | Cadastro e navegação sem KYC concluído; **verificação obrigatória de cliente/remetente e transportador antes da contratação**, incluindo CPF, identidade, endereço e verificação facial por parceiro apropriado; LGPD e minimização de dados |
| D06 | **Seguro não comercializado** no MVP: usuário somente declara interesse, sem cobrança, apólice ou promessa de cobertura; futura integração configurável |
| D07 | **Asaas** como gateway prioritário, sujeito à homologação de cobrança e repasse posterior à entrega; sandbox até validação |
| D08 | Contratos distribuem responsabilidades entre remetente, transportador e Topic Log dentro da lei; nenhuma cláusula assegura isenção absoluta da plataforma |
| D09 | Regime empresarial pretendido **Lucro Presumido**, com adequação fiscal à Reforma Tributária brasileira, sujeito a validação contábil e jurídica |
| D10 | Comissão gratuita inicial **13%**, configurável pelo administrador, versionada, auditada e sem efeito retroativo |
| D11 | Premium inicial **R$ 39,90/mês** e **7%** de comissão; administrador pode configurar e criar novos pacotes com regras e vigências próprias |
| D12 | **Topic Log absorve taxas ordinárias de gateway**, incluindo Pix, débito, crédito, parcelamento e transferências disponíveis; sem sobretaxa ao remetente por modalidade |
| D13 | Métodos de pagamento configuráveis pelo administrador; ao desabilitar, mostrar aviso ao cliente e impedir novas seleções; só disponibilizar meios efetivamente suportados pelo Asaas |
| D14 | Inicialmente ambiente de **testes**; produção poderá ser AWS ou KingHost conforme custo variável e escala |
| D15 | Mapas com solução gratuita no protótipo respeitando licença e limites; Google Maps ou alternativa futuramente |
| D16 | Entrega normal exige **código de segurança válido + foto**, com procedimento de exceção auditado e revisão autorizada; não liberar repasse por ato unilateral do transportador |
| D17 | Transferência somente após pagamento confirmado/elegível, entrega validada e ausência de disputa/bloqueio; iniciar transferência não equivale a crédito bancário imediato |

**Segurança:** não armazenar biometria bruta ou documentos sem necessidade; avaliar prestador KYC. Para motofrete, bicicleta e carro, o teto comercial não dispensa limites legais, equipamentos e regras municipais. O seguro opcional permanece apenas manifestação de interesse até contrato com seguradora.

---

## Adendo TRD — implementação técnica

- Interfaces `IKycProvider`, `IPaymentProvider` (adaptador `AsaasProvider`) e `IMapsProvider`; integrações em sandbox e feature flags. Verificar capacidade real do Asaas para cartão de débito online, Pix, parcelamento e transferência condicionada; não inventar escrow.
- Estados KYC `NOT_STARTED/PENDING/IN_REVIEW/VERIFIED/REJECTED/EXPIRED`. Autorização por recurso e papel; bloqueio transacional de contratação sem verificação bilateral válida.
- Limites por veículo, municípios e políticas comerciais versionados com data de vigência, auditoria e cache invalidado. Endereços exatos, fotos e documentos privados.
- Código de entrega com hash, validade, limite de tentativas e uso único; foto armazenada privadamente; exceção com motivo, evidências, revisor autorizado e bloqueio de repasse até decisão.
- Gateway: webhooks verificados e deduplicados, ledger de dupla entrada, conciliação, idempotência de transferência e cálculo em centavos; custos por método absorvidos pela plataforma.
- Tributação: modelar receitas de comissão e assinatura separadas de valores de terceiros e despesas de gateway; não codificar fórmulas IBS/CBS sem aprovação fiscal específica.
- Testes: concorrência de aceite, KYC bilateral, modalidade desativada, política 13%/7%, limite 5/20/20, código/foto, exceções e webhooks duplicados.

---

## Conteúdo-base histórico (subordinado às decisões v2.0)


**Projeto:** Marketplace independente de encomendas e rotas  
**Versão:** 1.0 | **Data:** 12/10/2026 | **Status:** especificação proposta para validação  
**Documentos-base:** Especificação Completa v2.0 e Especificação Financeira v1.2.

> **Precedência:** decisões aprovadas prevalecem sobre números antigos: comissão gratuita inicial **13%**, alterável pelo administrador com vigência e auditoria; taxas ordinárias do gateway **absorvidas pela plataforma**; Premium **R$ 39,90/mês e 7%** são hipóteses comerciais configuráveis. Repasse ao transportador somente após confirmação válida de entrega e verificação financeira. Asaas e Stripe Connect são candidatos, não provedores homologados. Nenhum pagamento real sem homologação.


## 1. Arquitetura
**Monólito modular** no backend ASP.NET Core/C#, frontend Next.js/React/TypeScript, PostgreSQL/PostGIS, SignalR, workers assíncronos, object storage privado S3-compatível e Redis opcional. APIs REST documentadas em OpenAPI. Evitar microserviços no MVP sem necessidade mensurada.

### Módulos
`Identity`, `Profiles`, `Verification`, `Shipments`, `Trips`, `Matching`, `Feed`, `Negotiation`, `Messaging`, `Orders`, `Fulfillment`, `Payments`, `Ledger`, `Subscriptions`, `Reviews`, `Disputes`, `Notifications`, `Administration`, `Audit`.

Cada módulo deve possuir contratos explícitos, serviços de aplicação, domínio, infraestrutura e testes; não permitir acesso direto arbitrário às tabelas de outro módulo.

## 2. Repositório sugerido
```text
/
  apps/web/                # Next.js
  services/api/            # ASP.NET Core
  services/worker/         # tarefas assíncronas
  tests/unit/
  tests/integration/
  tests/e2e/
  infra/docker/
  infra/deploy/
  docs/adr/
  docs/api/
  docs/product/
  scripts/
  .github/workflows/
```

## 3. Identidade e autorização
Sessões seguras, MFA para administradores, proteção contra brute-force, e-mail verificado, rotação de segredos. Autorização por papel **e por recurso**: somente dono/participantes autorizados podem consultar endereço detalhado, proposta, chat, cobrança e prova. Registro de ações administrativas. Verificação de identidade terceirizada somente com consentimento, base legal e contrato adequado.

## 4. Contratos REST propostos
| Método | Rota | Função |
|---|---|---|
| POST | `/api/v1/auth/register` | cadastro |
| GET/PATCH | `/api/v1/me` | perfil |
| POST/GET | `/api/v1/shipments` | criar/listar encomendas |
| GET/PATCH | `/api/v1/shipments/{id}` | detalhes/edição autorizada |
| POST/GET | `/api/v1/trips` | criar/listar viagens |
| GET | `/api/v1/feed` | oportunidades filtradas |
| GET | `/api/v1/matches` | matching geográfico |
| POST | `/api/v1/shipments/{id}/proposals` | ofertar |
| POST | `/api/v1/proposals/{id}/accept` | aceite transacional |
| POST/GET | `/api/v1/conversations/{id}/messages` | chat |
| GET | `/api/v1/orders/{id}` | status de contrato |
| POST | `/api/v1/orders/{id}/checkout` | iniciar pagamento sandbox |
| POST | `/api/v1/orders/{id}/delivery-proof` | evidência de entrega |
| POST | `/api/v1/orders/{id}/confirm-delivery` | confirmar entrega |
| POST | `/api/v1/orders/{id}/disputes` | contestação |
| GET | `/api/v1/admin/finance/summary` | margem e conciliação |
| POST | `/api/v1/admin/commission-policies` | criar versão futura |
| GET | `/api/v1/admin/payment-fees` | tabelas tarifárias |
| POST | `/api/v1/webhooks/stripe` | eventos autenticados |
| POST | `/api/v1/webhooks/asaas` | eventos autenticados |

Padrões: paginação cursor, filtros validados, `ProblemDetails` para erros, `Idempotency-Key` em mutações críticas, versionamento de API, request-id, rate limits, OpenAPI e exemplos.

## 5. Consistência e concorrência
- Aceite único por encomenda via transação e constraint/lock; resposta `409` para aceite perdedor.
- Cálculos em centavos inteiros e taxas decimais; congelar snapshot da comissão ao contratar.
- Webhooks assinados e com deduplicação por evento/provider; inbox transacional.
- Outbox para efeitos externos e retries; nunca executar repasse duplo.
- Estado financeiro derivado de eventos confirmados do provedor e conciliação, não de redirecionamento de browser.
- Transferência só se `payment_confirmed && delivery_verified && !hold && !dispute && !fraud_flag`, respeitando regras de liquidação do provedor.

## 6. Máquina de estados
`shipment`: DRAFT→PUBLISHED→NEGOTIATING→CONTRACTED→IN_TRANSIT→DELIVERED→CLOSED; alternativas CANCELLED/DISPUTED.
`proposal`: SENT→COUNTERED/ACCEPTED/REJECTED/EXPIRED.
`payment`: CREATED→PENDING→AUTHORIZED/CONFIRMED→SETTLED; alternativas FAILED/REFUNDED/CHARGEBACK.
`transfer`: NOT_ELIGIBLE→ELIGIBLE→REQUESTED→PROCESSING→SUCCEEDED; alternativas BLOCKED/FAILED/REVERSED.
Definir transições proibidas, permissões e idempotência em testes.

## 7. Segurança e privacidade
OWASP ASVS como referência; HTTPS, headers seguros, CSRF conforme estratégia de sessão, CSP, validação de uploads, URLs temporárias, encryption at rest quando pertinente, mascaramento de PII, logs sem tokens, políticas de retenção, consentimentos e direitos do titular. Revisão jurídica LGPD e avaliação de risco.

## 8. Observabilidade e operação
Logs estruturados com correlation-id; métricas de latência, erros, matching, webhook lag, transfer backlog, divergência contábil; tracing; alertas; dashboards; migrations com rollback; backups automáticos e restauração ensaiada. Ambientes `local`, `staging` e `production` segregados; segredos via secret manager.

## 9. Provedor financeiro
Interface `IPaymentProvider` com operações de onboarding (quando suportado), cobrança, consulta, estorno, transferência, consulta de transferência e verificação de webhook. Implementar `StripeConnectProvider` e `AsaasProvider` por adaptadores; capacidades devem ser explicitamente descobertas/homologadas, não presumidas. Não habilitar transações reais sem contrato, conformidade e testes de sandbox.

## 10. Qualidade e testes
Unitários: cálculo 13%, taxas por modalidade, Premium, arredondamento, elegibilidade de repasse. Integração: migrations, isolamento por usuário, aceite concorrente, webhook duplicado/fora de ordem, reconciliação. E2E: jornada completa em sandbox, disputa, reembolso, recuperação de falhas. SAST, análise de dependências, varredura de segredos, carga e acessibilidade.

## 11. Requisitos de entrega
Cada PR inclui migração, contrato OpenAPI, testes, instruções de execução, evidência de comportamento, documentação e riscos residuais. A aprovação de uma fase é explícita; não avançar automaticamente.
