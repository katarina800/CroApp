# scripts/dev-android.ps1
#
# One-shot setup + run of the LOCAL DEBUG build on a USB-connected Android phone.
#
# A debug build loads its JavaScript from Metro, so every code change shows up on
# the phone. (An app installed from a release/EAS build has its JavaScript baked
# in and never shows changes.)
#
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File scripts\dev-android.ps1
#
# The file is deliberately ASCII-only: Windows PowerShell 5.1 reads BOM-less files
# as ANSI and garbles other characters.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- 1. tools
Step "Checking tools"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { Fail "adb.exe not found at $adb. Install Android Studio (SDK Platform-Tools)." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js not found." }
if (-not (Test-Path "node_modules")) {
  Write-Host "node_modules missing - running npm install"
  npm install
}

$freeGb = [math]::Round((Get-PSDrive -Name ($PWD.Drive.Name)).Free / 1GB, 1)
Write-Host "Free disk space on $($PWD.Drive.Name): $freeGb GB"
if ($freeGb -lt 8) { Fail "Less than 8 GB free. The Android build needs several GB - free some space and run again." }

if (-not $env:JAVA_HOME) {
  $jbr = "C:\Program Files\Android\Android Studio\jbr"
  if (Test-Path $jbr) { $env:JAVA_HOME = $jbr; Write-Host "JAVA_HOME = $jbr" }
  else { Write-Host "JAVA_HOME is not set and Android Studio's JDK was not found; the build may fail." -ForegroundColor Yellow }
}

# ---------------------------------------------------------------- 2. .env
Step "Checking .env keys"
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
$envText = Get-Content ".env" -Raw

function Ensure-Key($name, $what) {
  $m = [regex]::Match($script:envText, "(?m)^$name=(.*)$")
  $current = if ($m.Success) { $m.Groups[1].Value.Trim() } else { "" }
  if ($current) { Write-Host "$name is set"; return }
  $value = Read-Host "Paste $what ($name) - or press Enter to skip"
  if (-not $value) { Write-Host "$name left empty" -ForegroundColor Yellow; return }
  if ($m.Success) { $script:envText = [regex]::Replace($script:envText, "(?m)^$name=.*$", "$name=$value") }
  else { $script:envText = $script:envText.TrimEnd() + "`r`n$name=$value`r`n" }
  Set-Content ".env" $script:envText -NoNewline
}
Ensure-Key "EXPO_PUBLIC_ANDROID_MAPS_API_KEY" "the Android MAP key (without it the map stays blank)"
Ensure-Key "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY" "the Google PLACES key (without it only OpenStreetMap places are used)"

# ---------------------------------------------------------------- 3. phone
Step "Checking the phone"
& $adb start-server | Out-Null
$lines = (& $adb devices) | Select-Object -Skip 1 | Where-Object { $_.Trim() }
if (-not $lines) { Fail "No phone found. Plug it in, unlock it, set USB mode to File transfer." }
if ($lines -match "unauthorized") {
  Fail "Phone is 'unauthorized'. On the phone: Settings > Developer options > Revoke USB debugging authorizations, replug, tap Allow. (Samsung: turn off Settings > Security and privacy > Auto Blocker.)"
}
if (-not ($lines -match "\sdevice$")) { Fail "Phone is not in 'device' state: $lines" }
Write-Host "Phone connected: $($lines -join '; ')"
& $adb reverse tcp:8081 tcp:8081 | Out-Null
Write-Host "USB port forwarding for Metro (8081) set"

# ---------------------------------------------------------------- 4. old app
Step "Old app"
$installed = (& $adb shell pm list packages com.zivac.vara) -match "com.zivac.vara"
if ($installed) {
  Write-Host "An app with the same id (com.zivac.vara) is installed. If it was signed differently (EAS/Play build),"
  Write-Host "Android refuses to replace it, and an old release build has stale JavaScript baked in."
  $answer = Read-Host "Uninstall it first? You will have to log in again. (y/n)"
  if ($answer -eq "y") { & $adb uninstall com.zivac.vara }
}

# ---------------------------------------------------------------- 5. SHA-1 hint
Step "Debug signing SHA-1 (add to the Google Maps key restrictions if the map is blank)"
$keytool = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME "bin\keytool.exe" } else { "keytool" }
$keystore = Join-Path $env:USERPROFILE ".android\debug.keystore"
if ((Test-Path $keystore) -and (Test-Path $keytool)) {
  try {
    & $keytool -list -v -keystore $keystore -alias androiddebugkey -storepass android -keypass android |
      Select-String "SHA1:" | ForEach-Object { Write-Host $_.Line.Trim() }
  } catch { Write-Host "(could not read the debug keystore)" }
} else {
  Write-Host "(debug keystore is created by the first build; run this script again afterwards to see it)"
}

# ---------------------------------------------------------------- 6. build + run
Step "Building and installing the debug app (first build: 5-15 minutes)"
Write-Host "When it finishes, Metro prints 'Android Bundled ...' and the map's loading bar shows 'load-v3'."
npx expo run:android
