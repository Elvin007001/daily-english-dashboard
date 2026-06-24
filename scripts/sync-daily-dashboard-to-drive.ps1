$ErrorActionPreference = "Stop"

$Source = "C:\Users\e.ibrahimli\Documents\Codex\2026-06-23\i-want-to-set-up-an-2\outputs\daily-english-dashboard.html"
$TargetDirectory = "G:\My Drive\Daily English Dashboard"
$Target = Join-Path $TargetDirectory "daily-english-dashboard.html"
$Log = "C:\Users\e.ibrahimli\Documents\Codex\2026-06-23\i-want-to-set-up-an-2\outputs\drive-sync.log"

function Write-Log {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  Add-Content -LiteralPath $Log -Value "$stamp $Message"
}

if (-not (Test-Path -LiteralPath $Source)) {
  Write-Log "ERROR source file not found: $Source"
  throw "Source file not found: $Source"
}

if (-not (Test-Path -LiteralPath "G:\")) {
  Write-Log "ERROR Google Drive disk G: is not available"
  throw "Google Drive disk G: is not available"
}

if (-not (Test-Path -LiteralPath $TargetDirectory)) {
  New-Item -ItemType Directory -Path $TargetDirectory -Force | Out-Null
}

Copy-Item -LiteralPath $Source -Destination $Target -Force
Write-Log "OK copied dashboard to $Target"
