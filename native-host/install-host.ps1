<#
.SYNOPSIS
  Registers (or removes) the ASTRA native messaging host for Chrome and Edge.

.DESCRIPTION
  Writes %LOCALAPPDATA%\ASTRA\com.astra.host.json pointing at this directory's
  host.bat, then registers it under
    HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.astra.host
    HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.astra.host

  Chrome requires the manifest's allowed_origins to contain the EXACT id of the
  unpacked extension, so pass it with -ExtensionId (chrome://extensions ->
  Developer mode -> ASTRA Browser Bridge -> Copy ID).

.PARAMETER ExtensionId
  32-character Chrome extension id (letters a-p). If omitted you will be
  prompted interactively.

.PARAMETER HostDir
  Directory containing host.bat / host.js. Defaults to this script's folder.

.PARAMETER Uninstall
  Removes the registry keys and the manifest file.

.EXAMPLE
  .\install-host.ps1 -ExtensionId abcdefghijklmnopabcdefghijklmnop
.EXAMPLE
  .\install-host.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$ExtensionId = "",
  [string]$HostDir = "",
  [switch]$Uninstall,
  [switch]$ChromeOnly,
  [switch]$EdgeOnly
)

$ErrorActionPreference = 'Stop'

function Write-Step  { param($m) Write-Host "  $m" }
function Write-Ok    { param($m) Write-Host ("  [OK]   " + $m) -ForegroundColor Green }
function Write-Warn2 { param($m) Write-Host ("  [WARN] " + $m) -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host ("  [FAIL] " + $m) -ForegroundColor Red }

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  ASTRA Native Messaging Host - installer"                -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# ── resolve host directory ────────────────────────────────────────────────
if (-not $HostDir) {
  $HostDir = $PSScriptRoot
  if (-not $HostDir) { $HostDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
}
$hostBat = Join-Path $HostDir 'host.bat'
$hostJs  = Join-Path $HostDir 'host.js'

if ($Uninstall) {
  Write-Step "Removing ASTRA native host registration…"
  foreach ($hive in 'Software\Google\Chrome\NativeMessagingHosts\com.astra.host',
                     'Software\Microsoft\Edge\NativeMessagingHosts\com.astra.host') {
    try {
      Remove-Item -Path ("HKCU:\" + $hive) -Recurse -Force -ErrorAction Stop
      Write-Ok "deleted HKCU:\$hive"
    } catch {
      Write-Warn2 "registry key not found: HKCU:\$hive"
    }
  }
  $manifest = Join-Path $env:LOCALAPPDATA 'ASTRA\com.astra.host.json'
  if (Test-Path $manifest) {
    Remove-Item $manifest -Force
    Write-Ok "deleted $manifest"
  }
  Write-Host ""
  Write-Ok "ASTRA native host uninstalled. Restart Chrome/Edge to apply."
  Write-Host ""
  exit 0
}

if (-not (Test-Path $hostBat) -or -not (Test-Path $hostJs)) {
  Write-Fail "host.bat / host.js not found in '$HostDir'."
  Write-Host "  Use -HostDir to point at the folder that contains them"
  Write-Host "  (installed layout: %LOCALAPPDATA%\Programs\ASTRA\resources\native-host)."
  exit 1
}

# ── extension id ──────────────────────────────────────────────────────────
if (-not $ExtensionId) {
  Write-Host "The Chrome extension id is required to authorise this host."        -ForegroundColor White
  Write-Host "How to find it:"                                                      -ForegroundColor Gray
  Write-Host "  1. Open  chrome://extensions"                                       -ForegroundColor Gray
  Write-Host "  2. Enable 'Developer mode' (top-right)"                             -ForegroundColor Gray
  Write-Host "  3. Find 'ASTRA Browser Bridge' and click 'Copy ID'"                 -ForegroundColor Gray
  Write-Host ""
  $ExtensionId = (Read-Host 'Paste the extension ID').Trim()
  if (-not $ExtensionId) {
    Write-Fail "No extension id given. Aborting."
    exit 1
  }
}
$ExtensionId = $ExtensionId.Trim()
if ($ExtensionId -notmatch '^[a-p]{32}$') {
  Write-Warn2 "'$ExtensionId' does not look like a Chrome extension id (32 chars, letters a-p)."
  $answer = (Read-Host 'Continue anyway? [y/N]').Trim().ToLower()
  if ($answer -ne 'y' -and $answer -ne 'yes') { Write-Fail "Aborted."; exit 1 }
}

# ── write manifest ────────────────────────────────────────────────────────
Write-Step "Writing native messaging manifest…"

$astraDir   = Join-Path $env:LOCALAPPDATA 'ASTRA'
$manifestPath = Join-Path $astraDir 'com.astra.host.json'
New-Item -ItemType Directory -Path $astraDir -Force | Out-Null

$manifestObj = [ordered]@{
  name        = 'com.astra.host'
  description = 'ASTRA Native Messaging Host'
  path        = $hostBat
  type        = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$json = $manifestObj | ConvertTo-Json -Depth 4
# UTF-8 WITHOUT BOM (a BOM can make Chrome reject the manifest).
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "manifest written: $manifestPath"

# ── registry ──────────────────────────────────────────────────────────────
Write-Step "Registering host in the registry…"

$targets = @()
if (-not $EdgeOnly) { $targets += @{ Name = 'Chrome'; Key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.astra.host' } }
if (-not $ChromeOnly) { $targets += @{ Name = 'Edge';   Key = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.astra.host' } }

foreach ($t in $targets) {
  try {
    New-Item -Path $t.Key -Force | Out-Null
    Set-ItemProperty -Path $t.Key -Name '(Default)' -Value $manifestPath
    Write-Ok ("{0,-6} -> {1}" -f $t.Name, $t.Key)
  } catch {
    Write-Fail ("{0} registration failed: {1}" -f $t.Name, $_.Exception.Message)
    exit 1
  }
}

# ── node check (informational) ────────────────────────────────────────────
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
  try {
    $nodeVersion = (& node --version) 2>$null
    $major = [int]($nodeVersion -replace '^v(\d+)\..*$', '$1')
    if ($major -ge 22) { Write-Ok "Node.js $nodeVersion detected (host needs >= 22)."
    } else { Write-Warn2 "Node.js $nodeVersion found, but the native host needs >= 22 (global WebSocket API). Install from https://nodejs.org" }
  } catch { Write-Warn2 "Could not query node --version." }
} elseif (Test-Path (Join-Path $env:ProgramFiles 'nodejs\node.exe')) {
  Write-Ok "Node.js found at $env:ProgramFiles\nodejs\node.exe"
} else {
  Write-Warn2 "Node.js was not found. Install Node.js 22+ from https://nodejs.org and restart Chrome."
}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Ok "ASTRA native host registered!"
Write-Host ""
Write-Host "  Manifest : $manifestPath"        -ForegroundColor White
Write-Host "  Host     : $hostBat"             -ForegroundColor White
Write-Host "  Origin   : chrome-extension://$ExtensionId/" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:"                                     -ForegroundColor Gray
Write-Host "    1. Fully restart Chrome/Edge (all windows)."   -ForegroundColor Gray
Write-Host "    2. Start the ASTRA desktop app."               -ForegroundColor Gray
Write-Host "    3. Open the ASTRA Browser Bridge popup — it"   -ForegroundColor Gray
Write-Host "       should show 'Connected to ASTRA'."           -ForegroundColor Gray
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
