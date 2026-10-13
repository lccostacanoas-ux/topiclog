# 01 — PRD | Documento de Requisitos do Produto

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

## Adendo PRD — escopo e critérios de aceite

- Mercado: busca e cadastro para qualquer município mineiro, com João Monlevade como piloto prioritário e BH como segunda prioridade; não prometer transportadores ativos em todas as cidades.
- Perfis: remetente/cliente, transportador (bicicleta/moto/carro), destinatário, suporte e administradores. A mesma pessoa pode ter múltiplos papéis com permissões separadas.
- Jornadas: cadastro → navegação → publicação → negociação → bloqueio de contratação se KYC de qualquer parte pendente → contratação → pagamento Asaas sandbox → transporte → código + foto → repasse elegível → avaliação.
- Encomenda: peso, dimensões, descrição, categoria, valor declarado, embalagem, fotos, origem/destino e datas. Validar limite do veículo, capacidade e categorias proibidas.
- Seguro: opção “Tenho interesse em seguro”; texto obrigatório “Esta manifestação não contrata seguro e não garante cobertura”.
- Painel admin: regiões, pesos, modalidades, comissão, planos/pacotes, seguro futuro, usuários/KYC, provas de entrega, disputas e relatórios de margem.
- Aceite: usuário não verificado navega mas não contrata; 5,001 kg bloqueia bicicleta; 20,001 kg bloqueia moto/carro por padrão; método de pagamento removido mostra aviso; código sem foto não confirma; plano alterado não modifica contratos antigos.

---

## Conteúdo-base histórico (subordinado às decisões v2.0)


**Projeto:** Marketplace independente de encomendas e rotas  
**Versão:** 1.0 | **Data:** 12/10/2026 | **Status:** especificação proposta para validação  
**Documentos-base:** Especificação Completa v2.0 e Especificação Financeira v1.2.

> **Precedência:** decisões aprovadas prevalecem sobre números antigos: comissão gratuita inicial **13%**, alterável pelo administrador com vigência e auditoria; taxas ordinárias do gateway **absorvidas pela plataforma**; Premium **R$ 39,90/mês e 7%** são hipóteses comerciais configuráveis. Repasse ao transportador somente após confirmação válida de entrega e verificação financeira. Asaas e Stripe Connect são candidatos, não provedores homologados. Nenhum pagamento real sem homologação.


## 1. Problema e proposta de valor
Pessoas e pequenos negócios precisam enviar objetos entre localidades; transportadores que já percorrem rotas podem ter capacidade ociosa. O produto conecta as partes para publicar necessidades e viagens, negociar condições, contratar com segurança, acompanhar e avaliar a entrega. Não é serviço de transporte de passageiros.

## 2. Público e perfis
- **Visitante:** explorar informações públicas limitadas e conhecer o serviço.
- **Remetente:** criar encomenda, buscar transportador, negociar, pagar, acompanhar e confirmar recebimento.
- **Transportador:** declarar rota e disponibilidade, ofertar, conversar, realizar transporte e solicitar recebimento segundo as regras.
- **Destinatário:** visualizar status e confirmar entrega via mecanismo seguro, sem exigir exposição pública de dados.
- **Moderador/suporte:** investigar denúncias e disputas com acesso mínimo necessário.
- **Administrador financeiro:** gerenciar conciliação, regras financeiras e exceções autorizadas.
- **Administrador geral:** gerir configurações, usuários e políticas; ações sensíveis auditadas.

## 3. Objetivos e indicadores
Objetivos: contratação ponta a ponta com rastreabilidade; redução de fricção no matching; pagamento seguro; reputação confiável.
Indicadores propostos: publicações concluídas, proporção de matches, conversão proposta→aceite, entregas concluídas, tempo de negociação, disputas/100 entregas, custo de gateway por modalidade, margem de contribuição por entrega, retenção, adoção Premium, falhas de pagamento e tempo de suporte.
Metas quantitativas devem ser definidas no piloto, não presumidas.

## 4. Escopo funcional e histórias de usuário
| ID | História | Prioridade | Aceite resumido |
|---|---|---|---|
| PRD-01 | Como usuário, quero criar conta e autenticar-me | P0 | Sessão segura, recuperação e autorização |
| PRD-02 | Como transportador, quero configurar perfil e verificar identidade | P0 | Estados de verificação auditáveis |
| PRD-03 | Como remetente, quero publicar objeto com origem/destino | P0 | Validação de campos e endereços privados |
| PRD-04 | Como transportador, quero publicar viagem/rota e capacidade | P0 | Origem, destino, datas e restrições |
| PRD-05 | Como usuário, quero ver feed filtrado e oportunidades | P0 | Paginação, filtros, privacidade |
| PRD-06 | Como usuário, quero propostas e contrapropostas | P0 | Histórico, expiração e aceite único |
| PRD-07 | Como participantes, quero chat vinculado à negociação | P0 | Acesso somente a participantes |
| PRD-08 | Como remetente, quero pagar com métodos disponíveis | P0 | Valor final sem sobretaxa de modalidade |
| PRD-09 | Como destinatário/remetente, quero confirmar entrega | P0 | Prova válida, prevenção de fraude |
| PRD-10 | Como transportador, quero receber após entrega válida | P0 | Sem transferência antes da elegibilidade |
| PRD-11 | Como usuário, quero avaliar após operação concluída | P1 | Uma avaliação por papel/operação |
| PRD-12 | Como usuário, quero abrir disputa | P0 | Evidências e bloqueio de repasse |
| PRD-13 | Como administrador, quero alterar comissão | P0 | 13% inicial, versionamento e sem retroatividade |
| PRD-14 | Como gestor, quero relatórios de margem e tarifas | P0 | Pix/débito/crédito/parcelas separados |
| PRD-15 | Como transportador, quero assinar Premium | P1 | Preço e comissão próprios, sem privilégio de segurança |

## 5. Regras comerciais aprovadas
1. Comissão padrão: **13% do valor do transporte**, configurável por administrador com RBAC, justificativa, vigência e trilha de auditoria.
2. Taxas ordinárias de processamento, transferências e custos financeiros do gateway: **despesa da plataforma**, sem acréscimo ao remetente por modalidade e sem dedução adicional do transportador.
3. Congelar `commission_policy_version`, taxa, base de cálculo, comissão em centavos e valor devido ao transportador na contratação; mudanças posteriores não retroagem.
4. Premium: parâmetros propostos de R$39,90/mês e 7% de comissão; ativação sujeita a regras explícitas e cobrança separada.
5. Pagamento intermediado; **não** usar saldo próprio informal. Repasse automático significa emissão de ordem elegível, não promessa de liquidação bancária imediata.
6. Parcelamento, débito online e Pix dependem da disponibilidade contratual real do provedor; checkout só exibe opções homologadas.
7. Objeto proibido, fraude, disputas e estornos exigem políticas e fluxos específicos, sem promessa de responsabilidade ilimitada da plataforma.

## 6. Jornada do remetente
Cadastro → verificação exigida → criar encomenda → revisar dados → publicar → visualizar candidatos/matches → receber proposta/negociar → aceitar uma proposta → confirmar preço e condições → pagar → acompanhar → confirmar entrega/abrir disputa → avaliar.

## 7. Jornada do transportador
Cadastro → perfil/verificação → publicar rota/capacidade → visualizar oportunidades → propor preço/prazo → negociar → receber aceite e confirmação financeira → retirar objeto → atualizar marcos → registrar prova → aguardar validação → acompanhar ordem de transferência → avaliar.

## 8. Funcionalidades por tela
| Tela | Campos/ações centrais |
|---|---|
| Entrada | cadastro, login, recuperar acesso, termos |
| Perfil | nome público, contatos privados, documentos privados, status |
| Publicar encomenda | descrição, categoria, peso, dimensões, fotos, origem/destino aproximados, janela, valor declarado, observações |
| Publicar viagem | origem/destino, paradas, janela, capacidade, tipos aceitos |
| Feed | cards com localização aproximada, filtros, ordenação, detalhes |
| Proposta | preço, condições, prazo, expiração, aceitar/recusar/contrapropor |
| Chat | mensagens, anexos permitidos, denúncia, bloqueio |
| Checkout | valor do transporte, meio disponível, status, termos |
| Acompanhamento | linha do tempo, evidências, código de confirmação |
| Financeiro | status de cobrança, comissão, custos, transferência, extrato |
| Administração | usuários, moderação, comissão, tarifas, disputas, relatórios, auditoria |

## 9. Requisitos não funcionais
Acessibilidade WCAG 2.2 AA como objetivo; mobile-first; logs sem dados sensíveis; observabilidade; backups e restauração testada; internacionalização futura; políticas de retenção LGPD; consistência financeira forte; operações assíncronas resilientes. Metas de SLA, latência e RPO/RTO a aprovar no piloto.

## 10. Fora do MVP
Transporte de passageiros; custódia financeira própria; garantia automática de seguro; precificação dinâmica por IA; rastreamento GPS contínuo obrigatório; apps nativos; expansão internacional. São itens futuros sujeitos a avaliação.

## 11. Dependências e decisões pendentes
Provedor financeiro homologado; contrato e tributação; identidade e política de verificação; lista de itens proibidos; seguros; limites por envio; regras de cancelamento/reembolso; tratamento de chargeback; prazo máximo de entrega; provedores de mapa/SMS/e-mail; limites de parcelamento; marca e área geográfica inicial.

## 12. Critérios de aceite de produto
Cenário de sucesso: publicação→match→proposta→aceite→pagamento sandbox→entrega confirmada→ordem de repasse sandbox→avaliação.
Cenários de falha: aceite concorrente; pagamento recusado; webhook duplicado; disputa antes de repasse; mudança da comissão entre proposta e aceite; crédito parcelado com taxa absorvida; endereço privado exposto; transportador marcando entrega unilateralmente.
