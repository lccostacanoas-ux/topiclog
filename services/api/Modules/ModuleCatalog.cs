namespace TopicLog.Api.Modules;

public sealed record ModuleDescriptor(
    string Name,
    string BoundedContextResponsibility,
    string TargetPrPhase);

/// <summary>
/// Catálogo oficial dos 19 módulos do Monólito Modular (02-TRD-Tecnico.md, Seção 1).
/// </summary>
public static class ModuleCatalog
{
    public static IReadOnlyList<ModuleDescriptor> All { get; } =
    [
        new("Identity", "Autenticação, sessões seguras, MFA admin e autorização RBAC/ABAC", "PR-01"),
        new("Profiles", "Perfis de usuário e cadastro de veículos por modal (BICYCLE, MOTORCYCLE, CAR)", "PR-01 / PR-02"),
        new("Verification", "Fluxo de KYC progressivo e bloqueio bilateral na contratação (D05)", "PR-01"),
        new("Shipments", "Publicação de encomendas, limites 5/20/20 kg, endereços privados e interesse em seguro", "PR-02"),
        new("Trips", "Publicação de rotas/viagens, paradas e capacidade disponível", "PR-02"),
        new("Matching", "Cruzamento geoespacial PostGIS nos municípios de Minas Gerais (D02, D15)", "PR-03"),
        new("Feed", "Busca paginada por cursor e filtros com preservação de privacidade", "PR-03"),
        new("Negotiation", "Propostas, contrapropostas, expiração e aceite atômico único", "PR-04"),
        new("Messaging", "Chat SignalR vinculado à negociação e restrito aos participantes", "PR-05"),
        new("Orders", "Contratos e snapshot imutável de comissão (13% Free / 7% Premium)", "PR-04"),
        new("Fulfillment", "Código de segurança + foto privada e fluxo de exceção com revisão humana (D16)", "PR-06"),
        new("Payments", "Integração Asaas Sandbox, webhooks deduplicados e absorção de taxas (D07, D12, D13)", "PR-FIN-02 / PR-FIN-03"),
        new("Ledger", "Contabilidade interna de partida dobrada em centavos inteiros e repasse (D17)", "PR-FIN-04"),
        new("Subscriptions", "Planos e pacotes configuráveis (Premium inicial R$ 39,90/mês e 7% — D11)", "PR-FIN-01 / PR-FIN-05"),
        new("Reviews", "Avaliações bilaterais pós-conclusão da entrega", "PR-06"),
        new("Disputes", "Abertura de disputas, coleta de evidências e bloqueio imediato de repasse", "PR-06"),
        new("Notifications", "Disparo assíncrono de notificações via Outbox transacional", "PR-05"),
        new("Administration", "Gestão de regiões MG, pesos, comissões, pacotes, métodos de pagamento e margem", "PR-FIN-01 / PR-FIN-02"),
        new("Audit", "Trilha imutável de segurança (audit_events) e políticas (admin_policy_events)", "PR-01 / PR-FIN-01")
    ];
}
