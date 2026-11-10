# TOPIC LOG — DIAGNÓSTICO E PLANO DE CONFIGURAÇÃO PARA TESTES HUMANOS EM WI-FI LOCAL

**Data:** 15 de Outubro de 2026  
**Fase:** Estágio 1 — Testes Humanos Controlados com Repositórios em Memória  
**Objetivo:** Permitir que voluntários com smartphones Android e iPhone, conectados à mesma rede Wi-Fi do computador Windows, acessem o protótipo da Topic Log com segurança, sem expor portas à internet e mantendo o backend restrito a loopback.

---

## 1. DIAGNÓSTICO TÉCNICO INICIAL

### 1.1. Identificação de Rede e IPv4 Local
- **Interface Ativa:** `Wi-Fi` (InterfaceIndex: 15, Status: Preferred)
- **Perfil de Rede do Windows:** `Private` (Rede Privada — `2G_NETVIRTUA6030 2`)
- **Endereço IPv4 Local da Máquina:** `192.168.0.11`
- **Endereço Completo de Acesso para Smartphones:** `http://192.168.0.11:3000`

### 1.2. Mapeamento de Serviços, Portas e Escuta Atual
| Serviço | Porta | Escuta Atual (Bind) | Acessível na Wi-Fi? |
|---|---|---|---|
| **Frontend Next.js 15** | `3000` | `::` (Dual-stack IPv6 / `0.0.0.0`) | **Sim** (`http://192.168.0.11:3000`) |
| **Backend ASP.NET Core .NET 10** | `5080` | `127.0.0.1` (Estritamente Loopback) | **Não** (Restrito à máquina local) |

- **Teste Empírico de Acesso:**  
  `curl.exe -s -I "http://192.168.0.11:3000"` retornou `HTTP/1.1 200 OK`. O servidor Next.js já está pronto para receber conexões pelo IP privado.

### 1.3. Regras de Firewall do Windows
- Verificado via `netsh advfirewall show allprofiles`:
  - **Perfil de Domínio:** `State: OFF`
  - **Perfil Privado:** `State: OFF`
  - **Perfil Público:** `State: OFF`
- O Firewall do Windows encontra-se atualmente desativado para tráfego de entrada na máquina de desenvolvimento.
- Conexões de entrada na porta 3000 provenientes de smartphones na rede Wi-Fi local **não serão bloqueadas**.
- Caso o Firewall seja reativado pelo administrador, apenas uma regra de entrada pontual para a porta TCP 3000 no Perfil Privado será necessária (ver Seção 3).

### 1.4. Arquitetura de Comunicação e Proxy Interno
O arquivo [`apps/web/next.config.mjs`](file:///C:/Projetos/TOPICLOG/apps/web/next.config.mjs) já possui a regra canônica de reescrita:
```javascript
async rewrites() {
  const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:5080";
  return [
    {
      source: "/api/:path*",
      destination: `${apiBaseUrl}/api/:path*`
    }
  ];
}
```
**Testes reais executados via proxy interno Next.js no IP privado:**
- `GET http://192.168.0.11:3000/api/v1/system/feature-flags` ➔ **200 OK** (Feature flags retornadas).
- `POST http://192.168.0.11:3000/api/v1/auth/sandbox-token` ➔ **200 OK** (Token JWT emitido).
- `POST http://192.168.0.11:3000/api/v1/deliveries/.../delivery-proof` ➔ **201 Created** (Comprovante e SHA-256 processados).

### 1.5. Diagnóstico do Problema Encontrado: URLs de API no Frontend
- **Arquivo:** [`apps/web/src/lib/api-client.ts`](file:///C:/Projetos/TOPICLOG/apps/web/src/lib/api-client.ts) (linha 94):
  ```typescript
  export function getApiBaseUrl(): string {
    const configured = process.env["NEXT_PUBLIC_API_BASE_URL"];
    if (configured && configured.trim().length > 0) {
      return configured.trim().replace(/\/+$/, "");
    }
    return "http://localhost:5080";
  }
  ```
- **Comportamento Atual no Celular:**  
  Como `NEXT_PUBLIC_API_BASE_URL` não está definida, o navegador do celular recebe a URL `"http://localhost:5080"`. No celular, `localhost` aponta para o próprio smartphone e não para o computador. As requisições falhariam com `ERR_CONNECTION_REFUSED`.
- **CORS do Backend:**  
  Em [`services/api/Program.cs`](file:///C:/Projetos/TOPICLOG/services/api/Program.cs), o CORS permite apenas `localhost:3000` e `127.0.0.1:3000`. Se o celular tentasse acessar a porta 5080 diretamente pelo IP `192.168.0.11:5080`, seria bloqueado pelo CORS do navegador.
- **Solução Arquitetural Elegante (Proxy Transparente):**  
  Fazendo `getApiBaseUrl()` retornar `""` (string vazia) quando executado no navegador do cliente (`typeof window !== "undefined"`), toda chamada `${getApiBaseUrl()}${endpoint}` torna-se uma URL relativa (`/api/v1/...`).  
  O celular chama `http://192.168.0.11:3000/api/...` (Same-Origin, sem CORS). O Next.js recebe no servidor e repassa para `http://127.0.0.1:5080/api/...`. A porta 5080 permanece 100% blindada e invisível na rede Wi-Fi!

### 1.6. Diagnóstico de Câmera, Geolocalização e PWA em Smartphones
1. **Câmera Móvel (D16):**
   - Implementada através de `<input type="file" accept="image/*" capture="environment">`.
   - **Funciona 100% em HTTP no IP privado (`http://192.168.0.11:3000`)**.
   - Padrão W3C: A abertura do aplicativo de câmera via seletor nativo de arquivo não exige *Secure Context* (HTTPS), diferentemente da API `getUserMedia()` (streaming de vídeo). Tanto Android Chrome quanto iOS Safari abrem a câmera traseira perfeitamente em HTTP local.
2. **Geolocalização (`navigator.geolocation`):**
   - É uma *Powerful Feature* que exige HTTPS em origens não-locais. Em `http://192.168.0.11:3000`, os navegadores móveis desabilitam a leitura de GPS.
   - O código em `minhas-atividades/page.tsx` foi construído de forma **não-bloqueante**: caso o GPS esteja desabilitado, as coordenadas são enviadas como `null`, e o backend .NET (`FulfillmentModels.cs`) aceita perfeitamente sem interromper a conclusão da entrega.
3. **PWA / Service Worker (`navigator.serviceWorker`):**
   - O registro de Service Worker (`/sw.js`) requer HTTPS. Em HTTP, o navegador apenas gera um aviso silencioso no console (`console.warn`) capturado pelo componente `PwaRegister.tsx`, sem travar a interface.
   - No iOS Safari: O usuário pode tocar em *Compartilhar > Adicionar à Tela de Início* e utilizar o aplicativo em tela cheia com ícone nativo normalmente.
   - No Android Chrome: O atalho de tela inicial funciona pelo menu do navegador (*⋮ > Adicionar à tela inicial*).

---

## 2. PROPOSTA MÍNIMA DE CONFIGURAÇÃO (AGUARDANDO APROVAÇÃO)

Para viabilizar o teste sem qualquer dependência externa, alteração de banco ou abertura de portas:

### Alteração 1: Ajuste de Resolução de URL no Frontend
Modificar pontualmente a função `getApiBaseUrl()` em [`apps/web/src/lib/api-client.ts`](file:///C:/Projetos/TOPICLOG/apps/web/src/lib/api-client.ts) para:
```typescript
export function getApiBaseUrl(): string {
  const configured = process.env["NEXT_PUBLIC_API_BASE_URL"];
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, "");
  }
  // No navegador do cliente (desktop ou celular), usa URL relativa para aproveitar o proxy Next.js
  if (typeof window !== "undefined") {
    return "";
  }
  // No servidor Node.js (SSR), comunica diretamente com a API em loopback
  return process.env["API_BASE_URL"] || "http://127.0.0.1:5080";
}
```
**Impacto:** 
- Desktop `localhost:3000` continua funcionando perfeitamente.
- Celulares em `192.168.0.11:3000` passam a consumir as APIs via proxy interno do Next.js sem qualquer erro de rede ou CORS.
- O backend .NET continua restrito a `127.0.0.1:5080`.

---

## 3. COMANDOS EXATOS DE INICIALIZAÇÃO NO WINDOWS

Para iniciar a operação de testes em duas janelas do PowerShell:

### Janela 1: Backend ASP.NET Core .NET 10 (Loopback Seguro)
```powershell
cd C:\Projetos\TOPICLOG
dotnet run --project services/api/TopicLog.Api.csproj --urls=http://127.0.0.1:5080
```
*Garante que o backend fique isolado apenas no computador, sem exposição na rede Wi-Fi.*

### Janela 2: Frontend Next.js 15 (Escuta em Todas as Interfaces)
```powershell
cd C:\Projetos\TOPICLOG
npm.cmd --prefix apps/web run dev -- --hostname 0.0.0.0 --port 3000
```
*Garante a escuta na interface de rede Wi-Fi (`192.168.0.11`) e na interface loopback.*

### Configuração de Firewall (Apenas se o Firewall estiver ATIVO)
Como verificado, o Firewall está atualmente desativado. Caso venha a ser ativado, o comando PowerShell administrativo para liberar a porta 3000 na rede privada é:
```powershell
New-NetFirewallRule -DisplayName "TopicLog-NextJs-LocalTesting" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```
*(Não abrir porta para a rede Pública e não abrir porta 5080).*

---

## 4. ANÁLISE SOBRE HTTPS LOCAL: PRÓS, CONTRAS E DECISÃO

| Critério | Opção A: HTTP Direto no IP (`http://192.168.0.11:3000`) | Opção B: HTTPS Local com Certificado Autoassinado |
|---|---|---|
| **Complexidade** | **Zero.** Basta abrir o link no navegador do celular. | **Alta.** Exige gerar autoridade certificadora e instalar certificados em cada smartphone. |
| **Câmera Traseira (D16)** | **Funciona 100%** (via `<input type="file" capture>`). | Funciona 100%. |
| **Compressão Canvas** | **Funciona 100%** (API nativa do navegador). | Funciona 100%. |
| **Envio de Propostas e D16** | **Funciona 100%** (via proxy interno). | Funciona 100%. |
| **Geolocalização (GPS)** | Desabilitada pelo navegador (envia `null` sem travar). | Habilitada (se o usuário conceder permissão). |
| **Instalação no iPhone** | Funciona via *Compartilhar > Adicionar à Tela de Início*. | Funciona. Exige instalar e confiar no perfil raiz nos Ajustes do iOS. |
| **Instalação no Android** | Funciona adicionando atalho pelo menu do Chrome. | Habilita banner PWA nativo automático. |
| **Recomendação** | **RECOMENDADA PARA O ESTÁGIO 1.** Rápida, sem atrito e sem riscos de segurança nos aparelhos. | Desnecessária para a validação das regras D01–D17. |

**Passo a passo se a Opção B (HTTPS) fosse requerida no futuro:**
1. Instalar ferramenta `mkcert` no Windows (`choco install mkcert` ou binário local).
2. Gerar autoridade de certificação local: `mkcert -install`.
3. Criar certificado para o IP: `mkcert 192.168.0.11 localhost 127.0.0.1`.
4. Exportar a raiz `rootCA.pem`.
5. No iPhone: Enviar o arquivo `.pem`, ir em `Ajustes > Perfil Baixado > Instalar`, depois ir em `Ajustes > Geral > Sobre > Certificados Confiáveis` e ligar a chave de Confiança Total.
6. No Android: Ir em `Configurações > Segurança > Instalar certificado de CA`.

*Para os objetivos do Estágio 1, a Opção A atende integralmente a todos os requisitos funcionais.*

---

## 5. CHECKLIST PRÁTICO PARA TESTES EM SMARTPHONES FÍSICOS

### Preparação Prévia (Computador)
- [ ] Confirmar que o computador e os celulares estão na mesma rede Wi-Fi (`2G_NETVIRTUA6030 2`).
- [ ] Iniciar a API .NET no loopback (`127.0.0.1:5080`).
- [ ] Iniciar o Next.js com escuta aberta (`npm.cmd --prefix apps/web run dev -- --hostname 0.0.0.0 --port 3000`).

### Teste no Smartphone (Android / iPhone)
1. **Conexão e Carga Inicial:**
   - Abrir o navegador no celular (Safari no iPhone, Chrome no Android).
   - Digitar o endereço: `http://192.168.0.11:3000`.
   - Verificar carregamento limpo da página inicial, sem erros de layout ou imagens quebradas.
2. **Navegação e Menus:**
   - Testar o menu inferior mobile (*Início, Encomendas, Publicar, Atividades, Perfil*).
   - Abrir o menu hambúrguer superior e testar alternância de tema e links.
3. **Autenticação Sandbox:**
   - Acessar o alternador de sandbox (Remetente / Transportador).
   - Confirmar obtenção do token JWT sem erros de rede.
4. **Publicação e Feed:**
   - Acessar `/publicar` (ou `/encomendas`) e visualizar oportunidades.
   - Navegar até `/minhas-atividades`.
5. **Comprovação de Entrega e Câmera Móvel (D16):**
   - No painel do Transportador, localizar a encomenda em trânsito.
   - Tocar em *"📸 Anexar Foto da Entrega"*.
   - No modal, tocar em *"📸 Abrir Câmera Traseira do Celular"*.
   - **Verificar que o smartphone abre a câmera fotográfica nativa.**
   - Tirar uma foto real de um pacote / objeto.
   - Verificar a pré-visualização no modal:
     - Imagem exibida com proporção correta e sem distorção.
     - Métricas técnicas: Dimensão redimensionada para até 1280 px, tamanho otimizado exibido (~40 KB a 200 KB) e percentual de redução.
   - Tocar em *"Confirmar e Enviar Comprovante"*.
   - Confirmar que a mensagem de sucesso aparece **apenas após o retorno do backend**, com exibição do hash SHA-256 gerado pelo servidor.
   - Tocar em *"👁️ Ver Foto"* e conferir a visualização do comprovante com o hash auditado.
6. **Validação do Código D16:**
   - Digitar o código secreto de 4 dígitos do destinatário (`7492`).
   - Tocar em *"Concluir Entrega"*.
   - Verificar conclusão da entrega no Gate G3, liberação do repasse e atualização da timeline de 6 fases.

---

## 6. PROBLEMAS IDENTIFICADOS E ALTERAÇÃO QUE EXIGE APROVAÇÃO

| Item | Situação Atual | Proposta de Correção | Exige Aprovação? |
|---|---|---|---|
| **Resolução de URL da API (`apps/web/src/lib/api-client.ts`)** | `getApiBaseUrl()` retorna fixo `"http://localhost:5080"`, o que faz o celular tentar conectar em si mesmo. | Retornar `""` (string vazia) no navegador do cliente para usar chamadas relativas `/api/...` roteadas pelo proxy do Next.js. | **SIM (Código Frontend)** |
| **Porta do Backend .NET** | Fica restrita a loopback `127.0.0.1:5080`. | Manter exatamente como está, sem expor à Wi-Fi. | Não (Já é o estado atual) |
| **Firewall do Windows** | Atualmente desativado (`State: OFF`). | Manter como está; se ativado, criar regra na porta 3000 do Perfil Privado. | Não requer ação imediata |
| **HTTPS / Certificados** | Desnecessário para a câmera (`<input type="file" capture>`). | Adotar Opção A (HTTP direto no IP local) para o Estágio 1. | **SIM (Confirmação de Escopo)** |

**Nenhuma alteração de código ou de rede foi executada.** Aguardando a autorização do fundador para aplicar a alteração mínima em `apps/web/src/lib/api-client.ts` e iniciar os testes práticos na rede Wi-Fi.
