# ADR-0003: Provedores Externos Desacoplados e Governança por Feature Flags

- **Status:** Aprovado
- **Data:** 12/10/2026
- **Decisores:** Arquitetura Principal Topic Log
- **Decisões Vinculantes Relacionadas:** `D05`, `D06`, `D07`, `D13`, `D14`, `D15`

## Contexto
O projeto encontra-se inicialmente em **ambiente de testes** (`D14`). Pagamentos reais dependem de homologação contratual e técnica do **Asaas** (`D07`), a verificação de identidade/facial depende de contratação de parceiro **KYC** (`D05`), o seguro não é comercializado no MVP (`D06`) e os mapas utilizarão solução gratuita no protótipo com possibilidade de migração futura para Google Maps (`D15`).

## Decisão
1. **Interfaces de Infraestrutura Estritamente Desacopladas:**
   - `IPaymentProvider`: Operações de criação de cobrança, consulta de status, estorno, solicitação de transferência idempotente, consulta de transferência e validação criptográfica de webhook. Adaptador prioritário: `AsaasProvider` (operando exclusivamente em sandbox até homologação). Nenhum comportamento de *escrow* não documentado será presumido.
   - `IKycProvider`: Abertura de caso de verificação, submissão de referências seguras (CPF, documento, comprovante de endereço e verificação facial) e consulta de estado (`NOT_STARTED`, `PENDING`, `IN_REVIEW`, `VERIFIED`, `REJECTED`, `EXPIRED`), sem armazenar biometria facial bruta no banco da Topic Log.
   - `IMapsProvider`: Geocodificação de municípios de Minas Gerais (IBGE), cálculo de distância aproximada e renderização de mapas usando provedor gratuito licenciado no protótipo (OpenStreetMap/Leaflet), substituível por configuração.
   - `IObjectStorageProvider`: Gravação e leitura privada de imagens (encomendas e provas de entrega) com URLs temporárias assinadas.
2. **Governança Centralizada por Feature Flags (`FeatureFlagsOptions`):**
   - `EnvironmentMode`: `"Testing"` (bloqueia uso de chaves de produção).
   - `RealPaymentsEnabled`: `false` (trava de segurança contra transações financeiras reais).
   - `AsaasSandboxEnabled`: `true`.
   - `BilateralKycRequiredOnContract`: `true` (permite cadastro e navegação livres, mas bloqueia aceite de proposta sem KYC válido de remetente e transportador).
   - `InsuranceCommercializationEnabled`: `false` (exibe apenas manifestação de interesse com disclaimer obrigatório).
   - `RequireCodeAndPhotoForDelivery`: `true` (exige dupla evidência ou fluxo de exceção com revisão humana).
   - `RunWorkerInProcess`: `true` (otimização de memória para máquina com 8 GB de RAM).

## Consequências
- **Positivas:** Impede acidentes com cobranças reais antes dos Gates de Produção (`G5`); permite testar ponta a ponta todos os fluxos de negócio localmente sem depender de contratos comerciais ainda pendentes.
- **Negativas / Riscos:** Os adaptadores sandbox devem simular fielmente falhas, atrasos de webhook e duplicidades para não mascarar problemas de integração real.
