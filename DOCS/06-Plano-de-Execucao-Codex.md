# 06 — Plano de Execução no Codex

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

## Adendo Plano Codex — ordem e gates

| Etapa | Entrega específica Topic Log |
|---|---|
| PR-00 | monorepo, ambientes de teste, documentação de decisões e feature flags |
| PR-01 | cadastro e navegação sem KYC; verificação bilateral obrigatória na contratação |
| PR-02 | MG completo configurável, João Monlevade/BH priorizados, veículos e limites 5/20/20 kg |
| PR-03 | feed, matching e mapa gratuito licenciado, com adaptação futura |
| PR-04 | propostas, aceite único e snapshot de comissão |
| PR-05 | chat, notificações e moderação |
| PR-06 | código + foto, exceções auditadas e disputa |
| PR-FIN-01 | comissão 13%, Premium R$39,90/7%, criação de novos pacotes |
| PR-FIN-02 | métodos e tarifas administráveis, aviso de desativação, custo gateway da plataforma |
| PR-FIN-03 | Asaas sandbox, webhook e conciliação |
| PR-FIN-04 | ledger e repasse condicionado, idempotência |
| PR-FIN-05 | estorno, chargeback, relatórios, regras fiscais sob validação |
| PR-07 | segurança, acessibilidade, testes de carga, piloto João Monlevade e BH |

**Gates para produção:** contratos e CDC revisados, limites legais de transporte verificados, prestador KYC e LGPD aprovados, Asaas homologado para o fluxo real, política de disputa/indenização definida, tratamento tributário validado, domínio/marca verificados. Nenhuma transação real antes dessas aprovações.

---

## Conteúdo-base histórico (subordinado às decisões v2.0)


**Projeto:** Marketplace independente de encomendas e rotas  
**Versão:** 1.0 | **Data:** 12/10/2026 | **Status:** especificação proposta para validação  
**Documentos-base:** Especificação Completa v2.0 e Especificação Financeira v1.2.

> **Precedência:** decisões aprovadas prevalecem sobre números antigos: comissão gratuita inicial **13%**, alterável pelo administrador com vigência e auditoria; taxas ordinárias do gateway **absorvidas pela plataforma**; Premium **R$ 39,90/mês e 7%** são hipóteses comerciais configuráveis. Repasse ao transportador somente após confirmação válida de entrega e verificação financeira. Asaas e Stripe Connect são candidatos, não provedores homologados. Nenhum pagamento real sem homologação.


## 1. Estratégia
Trabalhar por pull requests pequenos e testáveis, com **aprovação explícita entre fases**. Não construir todas as telas e integrações em uma única execução. Cada PR deve incluir código funcional, testes, documentação e instruções reproduzíveis.

## 2. Sequência recomendada
| Etapa | Entregáveis | Critério de saída |
|---|---|---|
| PR-00 | Monorepo, Next.js, API C#, PostgreSQL/PostGIS, Docker, CI, OpenAPI, ADRs | ambiente sobe localmente, health checks |
| PR-01 | cadastro, login, perfis, RBAC/ABAC, privacidade | testes de acesso cruzado negado |
| PR-02 | encomendas, viagens, endereços privados, upload | CRUD com validação e migrations |
| PR-03 | feed, filtros, mapas, matching | resultados geográficos explicáveis |
| PR-04 | propostas, contrapropostas, aceite único | teste de concorrência passa |
| PR-05 | chat SignalR, anexos, notificações | isolamento por conversa |
| PR-06 | pedidos, execução, provas, confirmação e disputa | transportador sozinho não libera repasse |
| PR-FIN-01 | políticas comerciais, 13%, Premium e auditoria | mudanças só futuras; snapshots corretos |
| PR-FIN-02 | tabela de tarifas, margem por método, checkout | mesmo preço por Pix/débito/crédito |
| PR-FIN-03 | IPaymentProvider, adaptadores sandbox, webhooks | assinatura, deduplicação, retries |
| PR-FIN-04 | ledger, conciliação, elegibilidade e transferência | nenhuma duplicação; bloqueios funcionam |
| PR-FIN-05 | assinatura, reembolso, chargeback e relatórios | trilha financeira consistente |
| PR-07 | hardening, segurança, performance, acessibilidade, piloto | critérios de homologação cumpridos |

A ordem fina entre PR-06 e PR-FIN pode ser ajustada por dependências, mas não realizar transação real antes de todas as verificações.

## 3. Entregáveis obrigatórios por PR
Resumo do objetivo; requisitos PRD/TRD cobertos; ADR quando houver escolha arquitetural; alterações de banco; rotas API; componentes UI; testes unitários/integrados/E2E; comandos executados e resultados; riscos e limitações; checklist de segurança; instruções de demonstração; pendências. Não declarar “feito” se houver mocks ou integrações simuladas.

## 4. Gates de aprovação
- **G0:** arquitetura e escopo revisados.
- **G1:** identidade/privacidade testadas.
- **G2:** marketplace e aceite concorrente funcionando.
- **G3:** ciclo de entrega e disputa auditáveis.
- **G4:** sandbox financeiro concilia centavos e bloqueia repasse indevido.
- **G5:** homologação jurídica, contratual, segurança e operação.
- **G6:** piloto fechado com métricas e plano de suporte.

## 5. Backlog de decisões
Nome e domínio; provedores de mapa e comunicação; limites de encomenda; políticas de objetos proibidos; responsabilidade e seguro; termos e privacidade; verificações de identidade; preço final Premium; taxas efetivas Stripe/Asaas; disponibilidade de débito online e parcelamento; regras de reembolso e chargeback; jurisdição tributária; estratégia de deploy.

## 6. Critérios de qualidade
CI verde; testes financeiros e de concorrência; cobertura baseada em risco; revisão de segredos; migrações reproduzíveis; documentação OpenAPI; logs estruturados; acessibilidade; restauração de backup; validação de permissões; ausência de PII em logs; testes em staging.

## 7. Comando inicial para Codex
```text
Leia integralmente, nesta ordem:
01-PRD-Produto.md
02-TRD-Tecnico.md
03-Fluxos.md
04-Design-System.md
05-Banco-de-Dados.md
06-Plano-de-Execucao-Codex.md

Use também Especificacao-Completa-Plataforma-Entregas-Codex-v2.md
e Especificacao-Financeira-Codex-v1.md como documentos-base.

Antes de escrever código, produza:
(1) matriz de rastreabilidade requisito→módulo→teste;
(2) arquitetura e ADRs;
(3) estrutura de repositório;
(4) modelo inicial de dados e plano de migrations;
(5) backlog ordenado com dependências;
(6) riscos e decisões pendentes;
(7) critérios de aceite do PR-00.

Respeite as decisões: comissão padrão 13% configurável com auditoria e
vigência futura; plataforma absorve tarifas de gateway; Premium 7% e
R$39,90 são hipóteses configuráveis; repasse só após entrega validada;
provedor financeiro ainda não escolhido; sem dinheiro real.
Não copie o sistema de referência.
Não implemente todas as fases agora. Aguarde aprovação do PR-00.
```

## 8. Comando para cada PR
```text
Execute apenas o PR-[ID] aprovado do plano. Mostre os requisitos atendidos,
arquivos alterados, migrations, APIs, testes executados e evidências.
Corrija falhas antes de concluir. Registre o que está mockado, pendente
ou não testado. Aguarde minha autorização para a próxima fase.
```

## 9. Critérios de conclusão do projeto
Fluxo E2E íntegro, sem violações de autorização, sem repasse antes de confirmação válida, sem duplicidade de aceite/pagamento/transferência, margem transparente por meio de pagamento, comissão editável com histórico e sem retroatividade, backups testados, políticas aprovadas e homologação de provedor concluída.
