$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDirectory = Join-Path $projectDirectory "backend"
$pythonExecutable = Join-Path $backendDirectory ".venv\Scripts\python.exe"
$cloudflaredExecutable = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw "No se encontró el entorno virtual del backend."
}
if (-not (Test-Path -LiteralPath $cloudflaredExecutable)) {
    throw "No se encontró cloudflared. Vuelve a instalarlo con winget."
}

Write-Host "Iniciando Bizantino POS..." -ForegroundColor Yellow
$apiProcess = Start-Process `
    -FilePath $pythonExecutable `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $backendDirectory `
    -WindowStyle Hidden `
    -PassThru

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8000/api/health" -TimeoutSec 1
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $ready) {
        throw "FastAPI no respondió. Revisa la configuración del backend."
    }

    Write-Host ""
    Write-Host "Busca abajo el enlace terminado en trycloudflare.com y compártelo con la barbería." -ForegroundColor Green
    Write-Host "Mantén esta ventana abierta. Para terminar la prueba presiona Ctrl + C." -ForegroundColor Green
    Write-Host ""
    & $cloudflaredExecutable tunnel --url http://127.0.0.1:8000 --no-autoupdate
} finally {
    if ($apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -Force
    }
    Write-Host "Bizantino POS detenido." -ForegroundColor Yellow
}
