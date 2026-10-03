$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv sync --extra dev --python 3.13
    exit $LASTEXITCODE
}
$uvDirectory = Join-Path $projectRoot '.local/uv'
$uvExecutable = Join-Path $uvDirectory 'uv.exe'
if (-not (Test-Path -LiteralPath $uvExecutable)) {
    New-Item -ItemType Directory -Path $uvDirectory -Force | Out-Null
    $uvArchive = Join-Path $projectRoot '.local/uv.zip'
    Invoke-WebRequest -Uri 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip' -OutFile $uvArchive
    Expand-Archive -LiteralPath $uvArchive -DestinationPath $uvDirectory -Force
}
& $uvExecutable --cache-dir .local/uv-cache python install 3.13 --install-dir .local/python --no-bin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$pythonDirectory = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.local/python') -Directory -Filter 'cpython-3.13*-windows-x86_64-none' | Sort-Object Name -Descending | Select-Object -First 1
if (-not $pythonDirectory) { throw 'Python installation failed.' }
& $uvExecutable --cache-dir .local/uv-cache sync --extra dev --python (Join-Path $pythonDirectory.FullName 'python.exe')
exit $LASTEXITCODE
