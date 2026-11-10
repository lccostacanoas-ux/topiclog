# ADR-0006: Modelo de Domínio e Privacidade para Encomendas (Shipments), Viagens (Trips) e Endereços Privados

## Status
Aprovado

## Contexto
A fase PR-02 estabelece as bases de cadastro e oferta no marketplace da Topic Log:
1. Publicação de encomendas pelo remetente (`PRD-03`).
2. Cadastro de viagens e rotas com capacidade ociosa pelo transportador (`PRD-04`).
3. Respeito às decisões vinculantes de cobertura territorial em Minas Gerais (`D02`), modais permitidos (`D03`: Bicicleta, Moto e Carro), limites de peso padrão (`D04`: 5 kg para bicicleta, 20 kg para moto/carro), manifestação de interesse em seguro sem cobrança (`D06`) e proteção rigorosa de dados pessoais e endereços exatos (LGPD / `02-TRD-Tecnico.md`).

## Decisões

### 1. Separação Estrita de Endereços Privados e Pontos Aproximados
- O endereço completo da encomenda (`ShipmentAddress`) contém logradouro, número e complemento, os quais são dados pessoais sensíveis (PII) e representam risco físico se expostos abertamente.
- No catálogo público e no feed de oportunidades, são expostos exclusivamente:
  - Município (com código IBGE quando georreferenciado).
  - Estado (UF: `MG`).
  - Bairro (para balizamento de proximidade).
  - Ponto geográfico aproximado (`ApproximatePoint`), com imprecisão deliberada para proteger o domicílio do usuário.
- O endereço exato é retornado exclusivamente ao remetente proprietário da encomenda (`sender_id`) e, em etapas futuras (PR-04), ao transportador cuja proposta tenha sido formalmente aceita e confirmada.

### 2. Validação Vinculante de Pesos e Modais (D03 e D04)
- A validação de peso é executada de forma pura pelo domínio (`TopicLogRules.ValidateVehicleWeight`) tanto na API quanto no frontend.
- Limites vinculantes:
  - `BICYCLE`: máximo 5.000 g (5 kg). 5.001 g resulta em erro `VEHICLE_WEIGHT_LIMIT_EXCEEDED`.
  - `MOTORCYCLE`: máximo 20.000 g (20 kg). 20.001 g resulta em erro `VEHICLE_WEIGHT_LIMIT_EXCEEDED`.
  - `CAR`: máximo 20.000 g (20 kg). 20.001 g resulta em erro `VEHICLE_WEIGHT_LIMIT_EXCEEDED`.
- Para viagens (`Trips`), a capacidade declarada disponível pelo transportador não pode exceder o teto do modal e não pode ser inferior a 1 grama.

### 3. Manifestação de Interesse em Seguro (D06)
- Não há venda de apólice nem cobrança de taxa de seguro no MVP.
- O campo `interested_in_insurance` é registrado na encomenda com valor cobrado estritamente igual a `0`.
- É obrigatório persistir e exibir o aviso legal padronizado:
  > *"Esta manifestação não contrata seguro e não garante cobertura"*

### 4. Armazenamento Privado de Fotos de Encomendas
- Fotos de encomendas nunca possuem URLs públicas estáticas ou diretórios abertos.
- São armazenadas via `IObjectStorageProvider`, gerando uma referência privada (`storageKey`). O acesso ocorre apenas mediante autorização ou links temporários assinados.

### 5. Cobertura Geográfica Piloto (D02)
- O catálogo de regiões (`service_regions`) abrange o estado de Minas Gerais com prioridade piloto expressa:
  - 1º: João Monlevade (IBGE `3136207`).
  - 2º: Belo Horizonte (IBGE `3106200`).

## Consequências
- Os endpoints de `Shipments` e `Trips` garantem consistência antes de qualquer negociação (PR-04) ou matching geoespacial (PR-03).
- Impossibilidade de vazamento de endereços residenciais no feed público.
- Isolamento total entre remetentes e transportadores com auditoria de regras de domínio.
