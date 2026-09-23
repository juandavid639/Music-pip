# Empaqueta la extension para la Chrome Web Store.
#
# Usa una LISTA BLANCA, no una lista de exclusiones. Es una decision
# deliberada: con exclusiones, cualquier carpeta nueva que aparezca en el
# proyecto (documentacion, notas, codigo de referencia como
# better-lyrics-master/, capturas, backups de OneDrive) acabaria dentro
# del ZIP sin que nadie se entere. Con lista blanca, lo que no esta
# declarado aqui simplemente no viaja.
#
# Uso:  powershell -ExecutionPolicy Bypass -File tools\empaquetar.ps1

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $raiz "dist"
$staging = Join-Path $dist "_staging"

# ---- Lo unico que se publica -------------------------------------------
$incluir = @(
  "manifest.json",
  "_locales",
  "src",
  "assets"
)

# Dentro de lo incluido, patrones que igualmente se descartan.
$descartar = @("*.map", "*.log", "Thumbs.db", "desktop.ini", ".DS_Store")

# ---- Version desde el manifest -----------------------------------------
$manifest = Get-Content (Join-Path $raiz "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
Write-Host "Empaquetando $($manifest.name) v$version"

# ---- Staging limpio ----------------------------------------------------
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

foreach ($item in $incluir) {
  $origen = Join-Path $raiz $item
  if (-not (Test-Path $origen)) {
    throw "Falta '$item' en la raiz del proyecto."
  }
  Copy-Item $origen -Destination $staging -Recurse -Force
}

foreach ($patron in $descartar) {
  Get-ChildItem $staging -Recurse -Filter $patron -Force -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

# ---- Verificacion ------------------------------------------------------
# El fallo que esto previene es silencioso: un ZIP de 4 MB con el codigo
# de otra extension dentro se sube igual de bien que uno correcto.
$prohibidos = @("better-lyrics-master", "tools", "tests", "node_modules", ".git")
foreach ($p in $prohibidos) {
  if (Test-Path (Join-Path $staging $p)) {
    throw "El paquete contiene '$p'. Revisa la lista blanca."
  }
}

$archivos = Get-ChildItem $staging -Recurse -File
$pesoMB = [math]::Round(($archivos | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
Write-Host "  $($archivos.Count) archivos, $pesoMB MB"

if ($archivos.Count -gt 200) {
  throw "Demasiados archivos ($($archivos.Count)). Algo se colo en el paquete."
}

# ---- ZIP ---------------------------------------------------------------
# NO se usa Compress-Archive: en Windows PowerShell 5.1 escribe las rutas
# internas con barra invertida ("src\pip\pip.js"), y la especificacion ZIP
# exige barra normal. Chrome puede rechazar o malinterpretar ese paquete.
# Se construye el archivo entrada por entrada nombrando las rutas a mano.
$zip = Join-Path $dist "music-pip-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::CreateNew)
try {
  $archivo = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $prefijo = (Resolve-Path $staging).Path.TrimEnd('\') + '\'
    foreach ($f in $archivos) {
      # Solo archivos: los directorios vacios (p. ej. src/pip/components/)
      # no aportan nada y ensucian el paquete.
      $relativa = $f.FullName.Substring($prefijo.Length).Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archivo, $f.FullName, $relativa,
        [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally {
    $archivo.Dispose()
  }
} finally {
  $fs.Dispose()
}

Remove-Item $staging -Recurse -Force

$zipMB = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "OK -> $zip ($zipMB MB)"
