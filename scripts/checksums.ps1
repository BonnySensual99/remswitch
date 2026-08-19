$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseDir = Join-Path $projectRoot 'release'
if (-not (Test-Path -LiteralPath $releaseDir)) { throw 'No existe la carpeta release.' }

$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$versionPattern = "-$([regex]::Escape([string]$package.version))-x64\.exe$"
$artifacts = Get-ChildItem -LiteralPath $releaseDir -File -Filter '*.exe' |
    Where-Object { $_.Name -match $versionPattern } |
    Sort-Object Name
if ($artifacts.Count -lt 2) { throw 'No se encontraron el instalador y la versión portable.' }
$lines = foreach ($artifact in $artifacts) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($artifact.FullName)
        $digest = $sha256.ComputeHash($bytes)
        $hex = [System.BitConverter]::ToString($digest).Replace('-', '')
        "$hex  $($artifact.Name)"
    } finally {
        $sha256.Dispose()
    }
}
Set-Content -LiteralPath (Join-Path $releaseDir 'SHA256SUMS.txt') -Value $lines -Encoding ascii
Write-Host 'Checksums SHA-256 generados.'
