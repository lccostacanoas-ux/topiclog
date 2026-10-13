# Especificações OpenAPI — Topic Log

Esta pasta armazena os contratos REST OpenAPI (`v1`) e exemplos de payload do monólito modular.

## Convenções de Contrato (`02-TRD-Tecnico.md`)
- Versionamento explícito de rota: `/api/v1/...`
- Erros padronizados em formato RFC 9457 (`application/problem+json` / `ProblemDetails`).
- Rastreabilidade obrigatória via cabeçalho `X-Correlation-Id`.
- Mutações financeiras e aceites críticos protegidos por cabeçalho `Idempotency-Key`.
- Paginação baseada em cursor nas listagens públicas e administrativas.
