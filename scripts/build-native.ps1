$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildDir = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.native-build'))
$stageDir = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'native'))

foreach ($target in @($buildDir, $stageDir)) {
    if (-not $target.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Directorio de compilación fuera del proyecto: $target"
    }
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

New-Item -ItemType Directory -Path $buildDir, $stageDir | Out-Null

$qtDir = $env:Qt6_DIR
if (-not $qtDir) {
    $qtDir = Get-ChildItem 'C:\Qt' -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'msvc2022_64\lib\cmake\Qt6' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
}
if (-not $qtDir -or -not (Test-Path -LiteralPath $qtDir)) {
    throw 'No se encontró Qt 6 para MSVC 2022. Define Qt6_DIR antes de compilar.'
}

cmake -S $projectRoot -B $buildDir "-DQt6_DIR=$qtDir"
if ($LASTEXITCODE -ne 0) { throw 'CMake no pudo configurar el puente nativo.' }
cmake --build $buildDir --config Release
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el puente nativo.' }

$bridgeExe = Join-Path $buildDir 'bin\Release\RiotManagerBridge.exe'
Copy-Item -LiteralPath $bridgeExe -Destination $stageDir

$qtRoot = [System.IO.Path]::GetFullPath((Join-Path $qtDir '..\..\..'))
$deployTool = Join-Path $qtRoot 'bin\windeployqt.exe'
if (-not (Test-Path -LiteralPath $deployTool)) { throw 'No se encontró windeployqt.exe.' }

& $deployTool --release --no-translations --no-system-d3d-compiler --no-opengl-sw --no-compiler-runtime (Join-Path $stageDir 'RiotManagerBridge.exe')
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron desplegar las dependencias Qt.' }

$redistRoot = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Redist\MSVC'
$crtDir = Get-ChildItem -LiteralPath $redistRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\Microsoft.VC143.CRT' } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1
if (-not $crtDir) { throw 'No se encontró el runtime x64 de Visual C++.' }
Copy-Item -LiteralPath (Join-Path $crtDir 'vcruntime140.dll') -Destination $stageDir
Copy-Item -LiteralPath (Join-Path $crtDir 'vcruntime140_1.dll') -Destination $stageDir

Write-Host "Puente nativo preparado en $stageDir"
