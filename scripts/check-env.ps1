# =============================================================================
# Topic Log — Diagnóstico Somente-Leitura do Ambiente Local (Windows 11)
# =============================================================================
$ErrorActionPreference = "Continue"

Write-Host "======================================================================"
Write-Host "Topic Log — Diagnóstico de Ambiente (PR-00)"
Write-Host "======================================================================"

$os = Get-CimInstance Win32_OperatingSystem
$totalRamGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeRamGb  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
Write-Host "Memória RAM Total : $totalRamGb GB | Livre: $freeRamGb GB"

Write-Host "`n--- .NET SDKs ---"
dotnet --list-sdks

Write-Host "`n--- Node.js & npm ---"
node -v
npm.cmd -v

Write-Host "`n--- Git ---"
if (Test-Path "C:\Program Files\Git\cmd\git.exe") {
    & "C:\Program Files\Git\cmd\git.exe" --version
} else {
    Write-Host "Git não localizado em C:\Program Files\Git\cmd\git.exe"
}

Write-Host "`n--- PostgreSQL (Opcional na PR-00) ---"
$psql = Get-ChildItem -Path "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $psql) {
    & $psql.FullName --version
} else {
    Write-Host "PostgreSQL nativo ainda não instalado (será necessário apenas a partir das migrations do PR-01/PR-02)."
}
