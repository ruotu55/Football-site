# Fix mojibake folder names under Teams Images (Brazil Serie, Turkiye / Super Lig).
# Safe to run multiple times. Uses only ASCII + [char] so encoding cannot corrupt names.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File "Other Scripts\repair_teams_images_unicode.ps1"

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$TI = Join-Path $Root "Teams Images"
if (-not (Test-Path -LiteralPath $TI)) {
    Write-Error "Teams Images not found: $TI"
    exit 1
}

$e = [char]0x00E9   # Latin small letter e with acute (é in Série)
$u = [char]0x00FC   # Latin small letter u with diaeresis (ü in Türkiye, Süper)

$serieA = "Campeonato Brasileiro S${e}rie A"
$serieB = "Campeonato Brasileiro S${e}rie B"
$turkiye = "T${u}rkiye"
$superLig = "S${u}per Lig"

$br = Join-Path $TI "Brazil"
$brazilSerieAOk = $false
if (Test-Path -LiteralPath $br) {
    Get-ChildItem -LiteralPath $br -Directory | ForEach-Object {
        $n = $_.Name
        if ($n -eq $serieA -or $n -eq $serieB) { return }
        if ($n -like "*rie A*" -and $n -notlike "*rie B*") {
            Write-Host "Brazil: '$n' -> '$serieA'"
            Rename-Item -LiteralPath $_.FullName -NewName $serieA
        } elseif ($n -like "*rie B*") {
            Write-Host "Brazil: '$n' -> '$serieB'"
            Rename-Item -LiteralPath $_.FullName -NewName $serieB
        }
    }
    $brazilSerieAOk = Test-Path -LiteralPath (Join-Path $br $serieA)
}

$trParent = Get-ChildItem -LiteralPath $TI -Directory | Where-Object { $_.Name -match 'kiye$' } | Select-Object -First 1
if ($trParent) {
    $inner = Get-ChildItem -LiteralPath $trParent.FullName -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($inner -and $inner.Name -ne $superLig) {
        Write-Host "Türkiye child: '$($inner.Name)' -> '$superLig'"
        Rename-Item -LiteralPath $inner.FullName -NewName $superLig
    }
    if ($trParent.Name -ne $turkiye) {
        Write-Host "Country folder: '$($trParent.Name)' -> '$turkiye'"
        Rename-Item -LiteralPath $trParent.FullName -NewName $turkiye
    }
}

Write-Host "Unicode repair finished."
Write-Host "Brazil Serie A path ok: $brazilSerieAOk"
Write-Host "Türkiye Süper Lig ok: $(Test-Path -LiteralPath (Join-Path (Join-Path $TI $turkiye) $superLig))"
