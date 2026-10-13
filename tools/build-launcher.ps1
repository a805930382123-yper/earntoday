param(
    [switch]$LauncherOnly
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

# Always refresh the production app and its embedded frontend before publishing
# the launcher. A plain cargo build without custom-protocol points at devUrl.
if (-not $LauncherOnly) {
    Push-Location $root
    try {
        & npm.cmd run tauri -- build --no-bundle
        if ($LASTEXITCODE -ne 0) {
            throw "Production application build failed; launcher was not updated."
        }
    }
    finally {
        Pop-Location
    }
}

$app = Join-Path $root "src-tauri\target\release\earn-today.exe"
if (-not (Test-Path -LiteralPath $app)) {
    throw "Missing production application: $app. Run npm run build:exe first."
}

$cscCandidates = @(
    Join-Path $env:SystemRoot "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    Join-Path $env:SystemRoot "Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) {
    throw "Unable to find the .NET Framework C# compiler (csc.exe)."
}

$output = Join-Path $root "EarnToday.exe"
$icon = Join-Path $root "src-tauri\icons\icon.ico"

& $csc /nologo /target:winexe /platform:anycpu /optimize+ `
    /win32icon:$icon /out:$output `
    (Join-Path $PSScriptRoot "Launcher.cs")

if ($LASTEXITCODE -ne 0) {
    throw "Launcher compilation failed."
}

Write-Host "Created: $output"
