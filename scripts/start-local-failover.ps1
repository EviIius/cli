param([switch]$SkipModelCheck, [switch]$PrepareOnly)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Output "Created .env from .env.example. Add hosted-provider keys only if you want them available locally."
}

docker compose up -d postgres redis
$deadline = (Get-Date).AddSeconds(60)
do {
  $healthy = docker compose ps --format json | ConvertFrom-Json | Where-Object { $_.Service -in @("postgres", "redis") -and $_.Health -eq "healthy" }
  if (@($healthy).Count -eq 2) { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (@($healthy).Count -ne 2) { throw "PostgreSQL or Redis did not become healthy within 60 seconds." }

pnpm db:migrate
if (-not $SkipModelCheck) { & "$PSScriptRoot/setup-local-model.ps1" }
if ($PrepareOnly) { Write-Output "Local failover preparation completed successfully."; exit 0 }
Write-Output "Local dependencies are ready. Starting Relay at http://localhost:5173"
pnpm dev
