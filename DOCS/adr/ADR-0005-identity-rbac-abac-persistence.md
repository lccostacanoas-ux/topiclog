# ADR-0005: Identidade, Criptografia Nativa, Autorização RBAC/ABAC e Persistência Temporária (PR-01.1)

- **Status:** Aceito para Desenvolvimento Inicial (`PR-01.1`) — **Pendente de Validação em PostgreSQL Real para Produção**
- **Data:** 2026-10-12
- **Decisões Vinculadas:** `DEC-01`, `DEC-02`, `DEC-03`, `D05`, `D08`, `PRD-01`, `PRD-02`

## Contexto

A Subetapa `PR-01.1` implementa o núcleo de Identidade, Perfis Multipapel, Autenticação JWT, Proteção de PII e Controle de Acesso por Papel (`RBAC`) e por Recurso (`ABAC`) da **Topic Log**, em um ambiente de desenvolvimento com **8 GB de RAM** onde o servidor PostgreSQL ainda não foi instalado.

## Decisões Técnicas Aprovadas

### 1. Persistência Desacoplada e Ressalva de Produção (`DEC-01`)
1. As operações de dados dependem exclusivamente das interfaces de contrato [`IUserRepository`](../../services/api/Modules/Identity/IdentityRepositories.cs), [`IRefreshTokenRepository`](../../services/api/Modules/Identity/IdentityRepositories.cs) e [`IAuditRepository`](../../services/api/Modules/Identity/IdentityRepositories.cs).
2. As implementações em memória (`InMemoryUserRepository`, `InMemoryRefreshTokenRepository`, `InMemoryAuditRepository`) são **exclusivamente temporárias** para desenvolvimento local e testes iniciais em máquinas de 8 GB de RAM.
3. O esquema relacional oficial está versionado em [`INFRA/sql/001_identity_kyc_audit.sql`](../../INFRA/sql/001_identity_kyc_audit.sql).
4. **Pendência Expressa:** A persistência real com PostgreSQL 16 e os testes de integração contra banco PostgreSQL real **continuam pendentes**. A `PR-01.1` **não é declarada validada para produção** enquanto esses testes em banco real não forem executados.

### 2. Segurança Criptográfica e Gestão de Segredos (`DEC-02`)
1. **Senhas (`PBKDF2-HMAC-SHA256`):** Hash unidirecional irreversível com salt aleatório individual de 128 bits (16 bytes) por senha, `210.000` iterações e chave derivada de 256 bits (32 bytes), armazenado no formato versionado `v1$pbkdf2-sha256$<iterations>$<saltBase64>$<hashBase64>`, permitindo upgrade futuro de algoritmo/iterações via `NeedsRehash`.
2. **Proteção de PII (`AES-256-GCM` e Hash Determinístico):** Telefone criptografado com `AesGcm` (nonce aleatório de 96 bits + tag de autenticação de 128 bits) e CPF protegido por HMAC-SHA256 + máscara (`***.456.789-**`).
3. **Tokens (`JWT HS256` + Refresh Rotativo):** Validação estrita de cabeçalho (`alg == "HS256"`, `typ == "JWT"`), assinatura verificada em tempo constante (`CryptographicOperations.FixedTimeEquals`), emissor (`iss`), audiência (`aud`), expiração (`exp`) e `nbf`.
4. **Proibição de Segredos no Código ou Git:** Nenhuma chave criptográfica ou segredo é gravado no código-fonte ou em `appsettings.json`. Em ambiente `Testing`/`Development`, caso as variáveis de ambiente não estejam definidas, chaves efêmeras de 256 bits são geradas em RAM via `RandomNumberGenerator.GetBytes(32)` na inicialização do processo. Em `Production`, a ausência de chaves configuradas via ambiente bloqueia a inicialização da API.
5. **Autorização RBAC + ABAC:** Todo acesso a recursos privados de usuário (`/api/v1/users/{userId}/private-profile`) valida se o ator autenticado é o titular do recurso ou possui papel autorizado (`SUPPORT` / `GENERAL_ADMIN`). Tentativas de acesso cruzado entre usuários geram evento `CROSS_ACCESS_DENIED` em `audit_events` e retornam `403 Forbidden`.
