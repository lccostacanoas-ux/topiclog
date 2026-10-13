# ADR-0002: Consistência Financeira, Snapshot de Comissão e Ledger de Partida Dobrada

- **Status:** Aprovado
- **Data:** 12/10/2026
- **Decisores:** Arquitetura Principal Topic Log
- **Decisões Vinculantes Relacionadas:** `D07`, `D09`, `D10`, `D11`, `D12`, `D16`, `D17`

## Contexto
A plataforma intermedia pagamentos de entregas com as seguintes regras comerciais imutáveis:
- Comissão padrão do plano gratuito: **13%** (`D10`), configurável pelo administrador com vigência futura e sem efeito retroativo.
- Plano Premium inicial: **R$ 39,90/mês** com comissão de **7%** (`D11`), também configurável em pacotes versionados.
- **Absorção integral das taxas ordinárias de gateway** (Pix, débito, crédito, parcelamento e transferência) pela Topic Log (`D12`): o remetente paga exatamente o valor do transporte acordado na proposta, sem sobretaxa por método, e o transportador recebe o valor do transporte menos a comissão aplicável.
- Repasse ao transportador permitido **exclusivamente** após pagamento confirmado, entrega validada (código de segurança + foto privada, ou exceção revisada por humano autorizado) e ausência de disputa ou bloqueio antifraude (`D16`, `D17`).

## Decisão
1. **Aritmética Monetária em Centavos Inteiros:**
   - Todos os valores monetários são armazenados e calculados como inteiros em centavos (`long` / `bigint` em C# e PostgreSQL, ex.: `R$ 39,90` = `3990`).
   - Percentuais de comissão e tarifas são armazenados como `decimal` / `numeric(9,6)` (ex.: `13%` = `0.130000m`, `7%` = `0.070000m`).
   - Política de arredondamento explícita (`MidpointRounding.AwayFromZero`) com invariante validada por constraint de banco e domínio:
     `commission_cents + carrier_due_cents == amount_cents`.
2. **Snapshot Comercial Imutável na Contratação (`orders`):**
   - No instante exato do aceite atômico da proposta, o sistema consulta a versão vigente de `commission_policy_versions` (considerando se o transportador possui assinatura ativa em `subscriptions`) e grava no registro de `orders`:
     - `amount_cents` (valor do transporte)
     - `commission_policy_version_id`
     - `commission_rate`
     - `commission_cents`
     - `carrier_due_cents`
   - Qualquer alteração posterior de comissão ou vencimento de assinatura Premium afeta apenas novas contratações.
3. **Ledger Interno de Partida Dobrada (`ledger_accounts` e `ledger_entries`):**
   - Cada evento financeiro confirmado gera uma transação contábil balanceada (`SUM(DEBIT) == SUM(CREDIT)`), segregando:
     - Valores em trânsito de terceiros (obrigação com o transportador);
     - Receita bruta de intermediação (comissão Topic Log);
     - Receita de assinaturas Premium;
     - Despesa financeira de processamento/transferência do gateway (`Asaas`), absorvida pela plataforma.
   - Lançamentos nunca são editados ou excluídos; estornos e chargebacks geram lançamentos compensatórios.

## Consequências
- **Positivas:** Rastreabilidade contábil e fiscal completa para o regime de Lucro Presumido e transição para a Reforma Tributária (`D09`); proteção contra erros de ponto flutuante e contra efeitos retroativos de mudanças de comissão.
- **Negativas / Riscos:** Exige rigor transacional e idempotência em todos os handlers de webhook e comandos de transferência.
