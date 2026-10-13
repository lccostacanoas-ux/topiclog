# 04 — Design System | UI, UX e Acessibilidade

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

## Adendo Design System — Topic Log

- Usar Topic Log como nome de trabalho, sem afirmar registro de marca/domínio. Identidade visual e tokens do documento-base ainda precisam de aprovação estética.
- Home: cobertura planejada para Minas Gerais, piloto João Monlevade e BH; não prometer serviço disponível em todo município.
- Filtros de veículo bicicleta/moto/carro; campos de peso com limites exibidos e erros acessíveis.
- Tela de KYC progressivo: permitir navegação; na contratação mostrar status e instruções de verificação de ambas as partes, com informações de privacidade.
- Seguro: checkbox de interesse com texto explícito de que não existe apólice nem cobertura ativa.
- Checkout: mostrar meios habilitados, aviso de desativação e total sem acréscimo por forma de pagamento.
- Confirmação de entrega: duas etapas código + foto, indicadores de conclusão, ação de exceção e privacidade das imagens.
- Painel admin: editor de pacotes Premium, comissões, limites, métodos de pagamento, regiões, interesse em seguro, auditoria e pré-visualização das mudanças.

---

## Conteúdo-base histórico (subordinado às decisões v2.0)


**Projeto:** Marketplace independente de encomendas e rotas  
**Versão:** 1.0 | **Data:** 12/10/2026 | **Status:** especificação proposta para validação  
**Documentos-base:** Especificação Completa v2.0 e Especificação Financeira v1.2.

> **Precedência:** decisões aprovadas prevalecem sobre números antigos: comissão gratuita inicial **13%**, alterável pelo administrador com vigência e auditoria; taxas ordinárias do gateway **absorvidas pela plataforma**; Premium **R$ 39,90/mês e 7%** são hipóteses comerciais configuráveis. Repasse ao transportador somente após confirmação válida de entrega e verificação financeira. Asaas e Stripe Connect são candidatos, não provedores homologados. Nenhum pagamento real sem homologação.


## 1. Princípios
Design **original**, confiável, claro e inclusivo; mobile-first; linguagem simples; progressão por etapas; transparência de custos e status; confiança sem divulgar dados privados. Não replicar identidade visual do sistema de referência.

## 2. Tokens iniciais (propostas ajustáveis)
| Token | Valor proposto | Uso |
|---|---|---|
| `color.primary` | `#155EEF` | Ação principal |
| `color.primary.hover` | `#004EEB` | Hover |
| `color.success` | `#16803C` | Sucesso |
| `color.warning` | `#B54708` | Atenção |
| `color.danger` | `#B42318` | Erros |
| `color.text` | `#101828` | Texto principal |
| `color.muted` | `#475467` | Texto secundário |
| `color.surface` | `#FFFFFF` | Superfície |
| `color.background` | `#F8FAFC` | Fundo |
| `color.border` | `#D0D5DD` | Contorno |
| `radius.sm/md/lg` | `6/10/16px` | Componentes |
| `space` | `4,8,12,16,24,32,48px` | Ritmo |
| `font` | system-ui / sans-serif | Desempenho e legibilidade |

Tokens são sugestões de design, **não** cores aprovadas. Testar contraste WCAG AA, estados hover/focus/disabled e modo de alto contraste.

## 3. Tipografia e layout
Escala proposta: display 36/44, H1 30/38, H2 24/32, H3 20/28, body 16/24, small 14/20; evitar texto funcional abaixo de 14px. Grade 12 colunas desktop, 4 mobile; containers fluidos, largura máxima ~1200px; pontos de quebra orientados ao conteúdo.

## 4. Componentes base
Button (primary/secondary/tertiary/destructive, loading/disabled), Input, Textarea, Select, DateTimePicker, FileUploader, Checkbox, Radio, Switch, Badge, StatusPill, Tabs, Modal, Drawer, Toast, Alert, Skeleton, Pagination, EmptyState, Card, Stepper, Timeline, MapPanel, RouteCard, ShipmentCard, ProposalCard, ChatBubble, FinancialBreakdown, DataTable, ConfirmDialog.

Cada componente deve documentar propriedades, estados, teclado, ARIA, validação e exemplo em Storybook ou catálogo equivalente.

## 5. Padrões de tela
**Home pública:** proposta de valor, como funciona, CTAs publicar encomenda/publicar viagem, confiança e FAQ.
**Feed:** busca, filtros, cards com localizações aproximadas, opção mapa/lista, estados vazios.
**Publicação:** wizard com validação contextual e salvamento de rascunho.
**Proposta:** resumo da encomenda, preço, prazo, condições, CTA de negociação.
**Checkout:** preço do transporte destacado, meios disponíveis e mesmo total entre modalidades, política de cancelamento e estado do pagamento.
**Acompanhamento:** timeline de coleta/transporte/entrega, confirmação, disputa.
**Financeiro transportador:** valor contratado, comissão congelada, valor devido, status da transferência; diferenciar transferência de crédito bancário.
**Admin:** navegação por domínios, indicadores, tabelas com filtros, logs, configuração de comissão versionada e simulação de margem.

## 6. Cópias e microtextos
Usar “Valor do transporte”, “Comissão da plataforma”, “Você receberá”, “Pagamento confirmado”, “Entrega aguardando confirmação”, “Transferência solicitada”, “Transferência concluída”, “Crédito bancário pendente”. Evitar “dinheiro liberado” antes da confirmação real.

## 7. Acessibilidade
Meta WCAG 2.2 AA: contraste, foco visível, teclado completo, labels persistentes, mensagens de erro anunciadas, alvos de toque adequados, redução de movimento, alt text, ordenação semântica e não depender só de cor. Testes automatizados e revisão manual.

## 8. Segurança perceptível
Nunca mostrar documentos, endereços completos ou contatos privados em cards públicos. Exibir estado de verificação com linguagem precisa, sem sugerir garantia absoluta. Pedir confirmação reforçada para ações irreversíveis e financeiras.

## 9. Responsividade
Mobile: navegação simplificada, cards empilhados, chat em tela dedicada, CTA fixo quando apropriado. Desktop: filtros laterais, lista+mapa e painéis administrativos densos com acessibilidade. Tabelas extensas devem suportar rolagem e visualização adaptativa.

## 10. Entregáveis para Codex
Tokens centralizados, biblioteca de componentes, exemplos interativos, 10 telas prioritárias, estados vazios/erro, testes de acessibilidade, documentação de padrões e screenshots de revisão. Antes da identidade final, apresentar duas alternativas visuais para aprovação.
