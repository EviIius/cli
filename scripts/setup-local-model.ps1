param([string]$Model = "qwen3:8b")
$ErrorActionPreference = "Stop"
$ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
if (-not (Test-Path -LiteralPath $ollamaExe)) {
  winget install --exact --id Ollama.Ollama --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
}
$listener = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(20)
  do { Start-Sleep -Milliseconds 500; $listener = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue } while (-not $listener -and (Get-Date) -lt $deadline)
}
if (-not $listener) { throw "Ollama did not start on port 11434" }
& $ollamaExe pull $Model
$body = @{ model=$Model; messages=@(@{role="user";content="Reply with exactly LOCAL_MODEL_OK"}); stream=$false } | ConvertTo-Json -Depth 6
$response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/v1/chat/completions" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 180
if ($response.choices[0].message.content -notmatch "LOCAL_MODEL_OK") { throw "The model responded, but failed its smoke test" }
Write-Output "Local model $Model is ready at http://127.0.0.1:11434/v1"
