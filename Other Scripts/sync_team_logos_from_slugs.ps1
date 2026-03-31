# Sync Teams Images slug PNGs (e.g. river-plate.football-logos.cc.png) to official
# squad JSON names, rename league folders from LIGA 1/2 placeholders, update imagePath.
# Requires PowerShell 5.1+. Run from repo root: powershell -ExecutionPolicy Bypass -File "Other Scripts\sync_team_logos_from_slugs.ps1"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "Squad Formation"))) {
    $ProjectRoot = Split-Path $ProjectRoot -Parent
}
$TeamsImages = Join-Path $ProjectRoot "Teams Images"
$SquadTeams = Join-Path (Join-Path $ProjectRoot "Squad Formation") "Teams"

# Build non-ASCII folder names with [char] so the .ps1 file encoding cannot mangle Série / Süper / Türkiye.
$_e9 = [char]0x00E9
$_fc = [char]0x00FC
$NameBrazilSerieA = "Campeonato Brasileiro S${_e9}rie A"
$NameBrazilSerieB = "Campeonato Brasileiro S${_e9}rie B"
$NameTurkiye = "T${_fc}rkiye"
$NameSuperLig = "S${_fc}per Lig"

function Normalize-Key([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return "" }
    return ([regex]::Replace($s.ToLower(), '[^a-z0-9]', ''))
}

function Slug-FromPngName([string]$name) {
    $base = $name -replace '\.png$', ''
    $base = $base -replace '\.football-logos\.cc$', ''
    return (Normalize-Key $base)
}

function Score-Match([string]$teamKey, [string]$slugKey) {
    if ([string]::IsNullOrWhiteSpace($teamKey) -or [string]::IsNullOrWhiteSpace($slugKey)) { return 0 }
    if ($teamKey -eq $slugKey) { return 100 }
    if ($teamKey.EndsWith($slugKey) -or $slugKey.EndsWith($teamKey)) { return 92 }
    if ($teamKey.Contains($slugKey) -or $slugKey.Contains($teamKey)) { return 80 }
    $minL = [Math]::Min($teamKey.Length, $slugKey.Length)
    $maxL = [Math]::Max($teamKey.Length, $slugKey.Length)
    if ($minL -lt 4) { return 0 }
    $prefix = 0
    for ($i = 0; $i -lt $minL; $i++) {
        if ($teamKey[$i] -eq $slugKey[$i]) { $prefix++ } else { break }
    }
    return [int](50 * $prefix / $maxL)
}

# --- 1) Rename placeholder league folders under Teams Images ---
$folderJobs = @(
    @{ Country = "Argentina"; Old = "LIGA 1"; New = "Torneo Apertura" }
    @{ Country = "Belgium"; Old = "LIGA 1"; New = "Jupiler Pro League" }
    @{ Country = "Brazil"; Old = "LIGA 1"; New = $NameBrazilSerieA }
    @{ Country = "Netherlands"; Old = "LIGA 1"; New = "Eredivisie" }
    @{ Country = "Portugal"; Old = "LIGA 1"; New = "Liga Portugal" }
    @{ Country = "Romania"; Old = "LIGA 1"; New = "SuperLiga" }
    @{ Country = "Saudi Arabia"; Old = "LIGA 1"; New = "Saudi Pro League" }
    @{ Country = "Scotland"; Old = "LIGA 1"; New = "Scottish Premiership" }
    @{ Country = "United States"; Old = "LIGA 1"; New = "Major League Soccer" }
)

foreach ($job in $folderJobs) {
    $parent = Join-Path $TeamsImages $job.Country
    if (-not (Test-Path $parent)) { continue }
    $oldP = Join-Path $parent $job.Old
    $newP = Join-Path $parent $job.New
    if ((Test-Path $oldP) -and -not (Test-Path $newP)) {
        Write-Host "Rename folder: $($job.Country)/$($job.Old) -> $($job.New)"
        Rename-Item -LiteralPath $oldP -NewName $job.New
    }
}

# Brazil Serie B: folder may appear as corrupted "*LIGA 2*"
$brazilPath = Join-Path $TeamsImages "Brazil"
if (Test-Path $brazilPath) {
    $serieBName = $NameBrazilSerieB
    $serieBPath = Join-Path $brazilPath $serieBName
    if (-not (Test-Path $serieBPath)) {
        $odd = Get-ChildItem -LiteralPath $brazilPath -Directory | Where-Object { $_.Name -match "LIGA" -and $_.Name -match "2" }
        if ($odd) {
            Write-Host "Rename folder: Brazil/$($odd[0].Name) -> $serieBName"
            Rename-Item -LiteralPath $odd[0].FullName -NewName $serieBName
        }
    }
}

# --- 2) Load club JSON entries ---
$entries = @()
Get-ChildItem -LiteralPath $SquadTeams -Recurse -Filter "*.json" -File | ForEach-Object {
    $jf = $_
    try {
        $raw = Get-Content -LiteralPath $jf.FullName -Raw -Encoding UTF8
        $data = $raw | ConvertFrom-Json
    } catch { return }
    if ($data.kind -ne "club") { return }
    $rel = $jf.FullName.Substring($SquadTeams.Length).TrimStart("\")
    $parts = $rel -split "\\"
    if ($parts.Count -lt 3) { return }
    $country = $parts[0]
    $league = $parts[1]
    $stem = $jf.BaseName
    $entries += [PSCustomObject]@{
        JsonPath   = $jf.FullName
        RawText    = $raw
        Country    = $country
        League     = $league
        Stem       = $stem
        Name       = [string]$data.name
        LeagueDir  = Join-Path (Join-Path $TeamsImages $country) $league
        DestPng    = Join-Path (Join-Path (Join-Path $TeamsImages $country) $league) "$stem.png"
        CanonRel   = "Teams Images/$country/$league/$stem.png"
    }
}

# --- 3) Per league, match slug PNGs to stems (greedy: longer stems first) ---
$byLeague = $entries | Group-Object { "$($_.Country)|$($_.League)" }

foreach ($lg in $byLeague) {
    $first = $lg.Group[0]
    $dir = $first.LeagueDir
    if (-not (Test-Path $dir)) {
        Write-Warning "Missing league image folder: $dir"
        continue
    }
    $slugFiles = @(Get-ChildItem -LiteralPath $dir -File | Where-Object {
            $_.Name -like "*.football-logos.cc.png" -or ($_.Name -like "*.png" -and $_.Name -notmatch '^[^\s]+\.png$')
        })
    # Only treat obvious slug downloads as movable sources
    $slugFiles = @($slugFiles | Where-Object { $_.Name -like "*.football-logos.cc.png" })
    if ($slugFiles.Count -eq 0) { continue }

    $unused = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($f in $slugFiles) { [void]$unused.Add($f.FullName) }

    $sorted = $lg.Group | Sort-Object { $_.Stem.Length } -Descending

    foreach ($e in $sorted) {
        $teamKey = Normalize-Key $e.Stem
        $dest = $e.DestPng
        if ((Test-Path $dest) -and -not ($dest -in $unused)) {
            continue
        }

        $bestFile = $null
        $bestScore = 0
        foreach ($sf in @($unused)) {
            $fn = [System.IO.Path]::GetFileName($sf)
            $sk = Slug-FromPngName $fn
            $sc = Score-Match $teamKey $sk
            # Extra: last word of team vs slug (e.g. platense / platanense typo)
            if ($sc -gt $bestScore) {
                $bestScore = $sc
                $bestFile = $sf
            }
        }
        if ($bestScore -ge 75 -and $bestFile) {
            if ((Test-Path $dest) -and (Resolve-Path $dest).Path -ne (Resolve-Path $bestFile).Path) {
                Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
            }
            if (-not (Test-Path $dest)) {
                Write-Host "  $($first.Country)/$($first.League): $(Split-Path $bestFile -Leaf) -> $($e.Stem).png"
                Move-Item -LiteralPath $bestFile -Destination $dest -Force
            }
            [void]$unused.Remove($bestFile)
        } elseif (-not (Test-Path $dest)) {
            Write-Warning "No slug match ($bestScore): $($e.Country)/$($e.League)/$($e.Stem)"
        }
    }
}

# --- 4) Update imagePath in each club JSON (canonical) ---
foreach ($e in $entries) {
    $jf = $e.JsonPath
    $raw = Get-Content -LiteralPath $jf -Raw -Encoding UTF8
    if ($raw -notmatch '"imagePath"\s*:\s*"([^"]*)"') { continue }
    $newLine = '"imagePath": "' + ($e.CanonRel -replace '\\', '/') + '"'
    $updated = [regex]::Replace($raw, '"imagePath"\s*:\s*"[^"]*"', $newLine, 1)
    if ($updated -ne $raw) {
        Set-Content -LiteralPath $jf -Value $updated -Encoding UTF8 -NoNewline
    }
}

Write-Host "Done. Re-run build-teams-index.py if you changed JSON paths (not needed for imagePath only)."
