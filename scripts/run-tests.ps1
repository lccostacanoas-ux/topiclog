# =============================================================================
# Topic Log — Execução Unificada de Build e Testes (Backend .NET 10 + Frontend)
# =============================================================================
$ErrorActionPreference = "Stop"

Write-Host "1. Compilando Solution .NET 10 LTS..."
dotnet build TopicLog.sln --no-restore -v minimal
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n2. Executando Testes Unitários (TopicLog.UnitTests)..."
dotnet run --project tests\unit\TopicLog.UnitTests.csproj --no-build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n3. Executando Testes de Integração (TopicLog.IntegrationTests)..."
dotnet run --project tests\integration\TopicLog.IntegrationTests.csproj --no-build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (Test-Path "apps\web\node_modules") {
    Write-Host "`n4. Validando TypeScript estrito no Frontend (apps/web)..."
    Push-Location "apps\web"
    try {
        npm.cmd run typecheck
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}

Write-Host "`nTodas as verificações concluídas com sucesso!"
