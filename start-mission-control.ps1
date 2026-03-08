$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = "C:\Users\lamar\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
$port = if ($env:MISSION_CONTROL_PORT) { $env:MISSION_CONTROL_PORT } else { "8765" }
$url = "http://127.0.0.1:$port"

if (-not (Test-Path $python)) {
    throw "Hermes Python runtime not found at $python"
}

Write-Host "Starting Hermes Mission Control on $url"
Start-Process $url | Out-Null

& $python "$root\server.py"
