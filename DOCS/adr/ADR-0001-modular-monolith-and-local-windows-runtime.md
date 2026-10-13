# ADR-0001: Monólito Modular em .NET 10 LTS e Execução Local Nativa (Sem Docker)

- **Status:** Aprovado
- **Data:** 12/10/2026
- **Decisores:** Arquitetura Principal Topic Log

## Contexto
O projeto Topic Log exige alta consistência transacional (especialmente em aceite único de propostas, verificação bilateral de KYC, congelamento de snapshot de comissão e ledger de partida dobrada) e compreende 19 domínios funcionais.
Além disso, a estação de desenvolvimento atual possui **Windows 11, processador Intel Core i3-7020U (2 cores / 4 threads), ~8 GB de RAM e SSD NVMe**, com a restrição explícita de **não utilizar Docker ou Podman nesta primeira fase**.

## Decisão
1. **Arquitetura de Monólito Modular (.NET 10 LTS):**
   - O backend será construído sobre o **.NET 10 LTS (`net10.0`, SDK `10.0.401`)** como um único executável de implantação (`services/api/TopicLog.Api.csproj`), estruturado internamente em 19 módulos de domínio com fronteiras explícitas:
     `Identity`, `Profiles`, `Verification`, `Shipments`, `Trips`, `Matching`, `Feed`, `Negotiation`, `Messaging`, `Orders`, `Fulfillment`, `Payments`, `Ledger`, `Subscriptions`, `Reviews`, `Disputes`, `Notifications`, `Administration`, `Audit`.
   - Cada módulo expõe contratos explícitos e não acessa diretamente tabelas ou estados internos mutáveis de outro módulo sem passar pelos serviços/contratos de domínio.
2. **Worker Assíncrono Híbrido (`services/worker`):**
   - O projeto `TopicLog.Worker` encapsula o processamento de `outbox_events`, `webhook_inbox` e tarefas agendadas.
   - Para economizar memória RAM (~150–250 MB) no ambiente de 8 GB, durante o desenvolvimento local o Worker pode ser hospedado **in-process** dentro do `TopicLog.Api` controlado pela configuração `FeatureFlags:RunWorkerInProcess = true`, mantendo a capacidade de rodar em processo isolado em staging/produção.
3. **Execução Nativa Windows 11 (Sem Docker/Podman):**
   - Banco de dados PostgreSQL + PostGIS executado nativamente no Windows como serviço local configurável sob demanda.
   - Armazenamento de objetos privados (fotos de encomendas e provas de entrega) abstraído por `IObjectStorageProvider`, utilizando sistema de arquivos local privado (`storage-private/`) em desenvolvimento e S3-compatível em produção.
   - Cache local via `IMemoryCache` e locks transacionais no PostgreSQL, dispensando instância local de Redis no MVP.

## Consequências
- **Positivas:** Consumo de memória drasticamente reduzido (adequado para 8 GB de RAM e CPU dual-core); transações ACID locais simples entre módulos críticos (`Negotiation` -> `Orders` -> `Ledger`); zero overhead de virtualização WSL2/Hyper-V.
- **Negativas / Riscos:** Requer disciplina de fronteiras entre diretórios/namespaces para evitar acoplamento espaguete (mitigado por testes de arquitetura e revisão por PR).
