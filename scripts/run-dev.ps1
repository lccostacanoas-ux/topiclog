# =============================================================================
# Topic Log — Inicialização Enxuta da API + Worker In-Process (~60 MB RAM)
# =============================================================================
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:FeatureFlags__RunWorkerInProcess = "true"
$env:FeatureFlags__RealPaymentsEnabled = "false"

Write-Host "Iniciando TopicLog.Api (.NET 10 LTS) com Worker In-Process em http://localhost:5080 ..."
dotnet run --project services\api\TopicLog.Api.csproj --urls=http://localhost:5080
