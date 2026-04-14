# Correct logo issues after sync_team_logos_from_slugs.ps1: Unicode folder names, wrong Spain matches, leftovers.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$TI = Join-Path $Root "Teams Images"
$CL = Join-Path $TI "Competitions\Champions League"

$_e9 = [char]0x00E9
$_fc = [char]0x00FC
$NameBrazilSerieA = "Campeonato Brasileiro S${_e9}rie A"
$NameBrazilSerieB = "Campeonato Brasileiro S${_e9}rie B"
$NameTurkiye = "T${_fc}rkiye"
$NameSuperLig = "S${_fc}per Lig"

function Copy-Logo($src, $dest) {
    if (-not (Test-Path -LiteralPath $src)) { Write-Warning "Missing: $src"; return }
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dest -Force
    Write-Host "  $([IO.Path]::GetFileName($src)) -> $([IO.Path]::GetFileName($dest))"
}

# --- 1) Brazil / Türkiye: fix mojibake folder names (same rules as repair_teams_images_unicode.ps1) ---
$br = Join-Path $TI "Brazil"
if (Test-Path -LiteralPath $br) {
    Get-ChildItem -LiteralPath $br -Directory | ForEach-Object {
        if ($_.Name -eq $NameBrazilSerieA -or $_.Name -eq $NameBrazilSerieB) { return }
        if ($_.Name -like "*rie A*" -and $_.Name -notlike "*rie B*") {
            Write-Host "Brazil folder -> Serie A"
            Rename-Item -LiteralPath $_.FullName -NewName $NameBrazilSerieA
        } elseif ($_.Name -like "*rie B*") {
            Write-Host "Brazil folder -> Serie B"
            Rename-Item -LiteralPath $_.FullName -NewName $NameBrazilSerieB
        }
    }
}

# --- 2) Turkey -> Türkiye / Süper Lig ---
$trOld = Join-Path $TI "Turkey"
if (Test-Path $trOld) {
    $trLeagueDir = (Get-ChildItem -LiteralPath $trOld -Directory | Select-Object -First 1).FullName
    $trNew = Join-Path $TI $NameTurkiye
    $sl = Join-Path $trNew $NameSuperLig
    New-Item -ItemType Directory -Path $sl -Force | Out-Null
    if ($trLeagueDir) {
        Get-ChildItem -LiteralPath $trLeagueDir -File -Filter "*.png" | ForEach-Object {
            Move-Item -LiteralPath $_.FullName -Destination (Join-Path $sl $_.Name) -Force
        }
        Remove-Item -LiteralPath $trLeagueDir -Force -Recurse -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $trOld -Force -Recurse -ErrorAction SilentlyContinue
    Write-Host "Moved Turkey logos -> Türkiye/Süper Lig"
}

# --- 3) Türkiye: slug -> official stem ---
$slPath = Join-Path (Join-Path $TI $NameTurkiye) $NameSuperLig
if (Test-Path -LiteralPath $slPath) {
    @{
        "alanyaspor.football-logos.cc.png"           = "Alanyaspor.png"
        "antalyaspor.football-logos.cc.png"          = "Antalyaspor.png"
        "besiktas.football-logos.cc.png"             = "Besiktas JK.png"
        "eyupspor.football-logos.cc.png"             = "Eyüpspor.png"
        "fenerbahce.football-logos.cc.png"           = "Fenerbahce.png"
        "galatasaray.football-logos.cc.png"          = "Galatasaray.png"
        "gaziantep.football-logos.cc.png"            = "Gaziantep FK.png"
        "genclerbirligi.football-logos.cc.png"       = "Genclerbirligi Ankara.png"
        "goztepe-izmir.football-logos.cc.png"        = "Göztepe.png"
        "kasimpasa.football-logos.cc.png"            = "Kasimpasa.png"
        "kayserispor.football-logos.cc.png"          = "Kayserispor.png"
        "kocaelispor.football-logos.cc.png"          = "Kocaelispor.png"
        "konyaspor.football-logos.cc.png"            = "Konyaspor.png"
        "rizespor.football-logos.cc.png"             = "Caykur Rizespor.png"
        "samsunspor.football-logos.cc.png"           = "Samsunspor.png"
        "trabzonspor.football-logos.cc.png"          = "Trabzonspor.png"
    }.GetEnumerator() | ForEach-Object {
        Copy-Logo (Join-Path $slPath $_.Key) (Join-Path $slPath $_.Value)
    }
}

# --- 4) Brazil Série A: explicit slug map ---
$brA = Join-Path $br $NameBrazilSerieA
if (Test-Path -LiteralPath $brA) {
    @{
        "corinthians.football-logos.cc.png"      = "Sport Club Corinthians Paulista.png"
        "internacional.football-logos.cc.png"    = "Sport Club Internacional.png"
        "sao-paulo.football-logos.cc.png"        = "São Paulo Futebol Clube.png"
        "palmeiras.football-logos.cc.png"        = "Sociedade Esportiva Palmeiras.png"
        "santos.football-logos.cc.png"           = "Santos FC.png"
        "mirassol.football-logos.cc.png"         = "Mirassol Futebol Clube (SP).png"
        "rb-bragantino.football-logos.cc.png"    = "Red Bull Bragantino.png"
        "fluminense.football-logos.cc.png"       = "Fluminense Football Club.png"
        "gremio.football-logos.cc.png"           = "Grêmio Foot-Ball Porto Alegrense.png"
        "athletico-paranaense.football-logos.cc.png" = "Club Athletico Paranaense.png"
        "vitoria.football-logos.cc.png"          = "Esporte Clube Vitória.png"
        "cruzeiro.football-logos.cc.png"         = "Cruzeiro Esporte Clube.png"
        "bahia.football-logos.cc.png"            = "Esporte Clube Bahia.png"
        "clube-do-remo.football-logos.cc.png"    = "Clube do Remo (PA).png"
        "coritiba.football-logos.cc.png"         = "Coritiba Foot Ball Club.png"
        "botafogo.football-logos.cc.png"         = "Botafogo de Futebol e Regatas.png"
        "atletico-mineiro.football-logos.cc.png" = "Clube Atlético Mineiro.png"
        "vasco-da-gama.football-logos.cc.png"    = "Clube de Regatas Vasco da Gama.png"
        "flamengo.football-logos.cc.png"         = "CR Flamengo.png"
        "chapecoense.football-logos.cc.png"      = "Associação Chapecoense de Futebol.png"
    }.GetEnumerator() | ForEach-Object {
        Copy-Logo (Join-Path $brA $_.Key) (Join-Path $brA $_.Value)
    }
}

# --- 5) Spain LaLiga ---
$es1 = Join-Path $TI "Spain\LaLiga"
if (Test-Path $es1) {
    Copy-Logo (Join-Path $CL "barcelona.football-logos.cc.png") (Join-Path $es1 "FC Barcelona.png")
    Copy-Logo (Join-Path $es1 "espanyol.football-logos.cc.png") (Join-Path $es1 "RCD Espanyol Barcelona.png")
    Copy-Logo (Join-Path $es1 "athletic-club.football-logos.cc.png") (Join-Path $es1 "Athletic Bilbao.png")
    Copy-Logo (Join-Path $es1 "atletico-madrid.football-logos.cc.png") (Join-Path $es1 "Atlético de Madrid.png")
    Remove-Item (Join-Path $es1 "espanyol.football-logos.cc.png") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $es1 "athletic-club.football-logos.cc.png") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $es1 "atletico-madrid.football-logos.cc.png") -Force -ErrorAction SilentlyContinue
}

# --- 6) Spain LaLiga2 ---
$es2 = Join-Path $TI "Spain\LaLiga2"
if (Test-Path $es2) {
    @{
        "almeria.football-logos.cc.png"          = "UD Almería.png"
        "cadiz.football-logos.cc.png"            = "Cádiz CF.png"
        "castellon.football-logos.cc.png"        = "CD Castellón.png"
        "cordoba.football-logos.cc.png"          = "Córdoba CF.png"
        "deportivo-la-coruna.football-logos.cc.png" = "Deportivo de La Coruña.png"
        "leganes.football-logos.cc.png"          = "CD Leganés.png"
        "malaga.football-logos.cc.png"           = "Málaga CF.png"
        "mirandes.football-logos.cc.png"         = "CD Mirandés.png"
        "sporting-gijon.football-logos.cc.png"   = "Sporting Gijón.png"
    }.GetEnumerator() | ForEach-Object {
        Copy-Logo (Join-Path $es2 $_.Key) (Join-Path $es2 $_.Value)
    }
}

# --- 7) Argentina fixes (Gimnasia swap + remaining slugs) ---
$ar = Join-Path $TI "Argentina\Torneo Apertura"
if (Test-Path $ar) {
    $wrongLaPlata = Join-Path $ar "Club de Gimnasia y Esgrima La Plata.png"
    $mendoza = Join-Path $ar "Gimnasia y Esgrima de Mendoza.png"
    if ((Test-Path $wrongLaPlata) -and -not (Test-Path $mendoza)) {
        Move-Item -LiteralPath $wrongLaPlata -Destination $mendoza -Force
        Write-Host "  Renamed La Plata (wrong crest) -> Gimnasia y Esgrima de Mendoza.png"
    }
    Copy-Logo (Join-Path $ar "gimnasia-lp.football-logos.cc.png") (Join-Path $ar "Club de Gimnasia y Esgrima La Plata.png")
    @{
        "argeninos-juniors.football-logos.cc.png" = "AA Argentinos Juniors.png"
        "atletico-tucuman.football-logos.cc.png"  = "Club Atlético Tucumán.png"
        "ca-huracan.football-logos.cc.png"        = "CA Huracán.png"
        "central-cordoba.football-logos.cc.png"   = "CA Central Córdoba (SdE).png"
        "club-atletico-platanense.football-logos.cc.png" = "Club Atlético Platense.png"
        "estudiantes-de-rio-cuarto.football-logos.cc.png" = "AA Estudiantes (Río Cuarto).png"
        "instituto-cordoba.football-logos.cc.png" = "Instituto ACC.png"
        "lanus.football-logos.cc.png"             = "CA Lanús.png"
        "union.football-logos.cc.png"           = "CA Unión (Santa Fe).png"
        "velez-sarsfield.football-logos.cc.png" = "CA Vélez Sarsfield.png"
    }.GetEnumerator() | ForEach-Object {
        Copy-Logo (Join-Path $ar $_.Key) (Join-Path $ar $_.Value)
    }
}

# --- 8) Belgium ---
$be = Join-Path $TI "Belgium\Jupiler Pro League"
if (Test-Path $be) {
    Copy-Logo (Join-Path $be "standard-liege.football-logos.cc.png") (Join-Path $be "Standard Liège.png")
    Copy-Logo (Join-Path $be "raal-la-louviere.football-logos.cc.png") (Join-Path $be "RAAL La Louvière.png")
}

# --- 9) England Premier League ---
$epl = Join-Path $TI "England\Premier League"
if (Test-Path $epl) {
    Copy-Logo (Join-Path $epl "wolves.football-logos.cc.png") (Join-Path $epl "Wolverhampton Wanderers.png")
}

# --- 10) MLS ---
$mls = Join-Path $TI "United States\Major League Soccer"
if (Test-Path $mls) {
    Copy-Logo (Join-Path $mls "la-galaxy.football-logos.cc.png") (Join-Path $mls "Los Angeles Galaxy.png")
    Copy-Logo (Join-Path $mls "new-york-red-bulls.football-logos.cc.png") (Join-Path $mls "Red Bull New York.png")
    Copy-Logo (Join-Path $mls "cf-montreal.football-logos.cc.png") (Join-Path $mls "CF Montréal.png")
    Copy-Logo (Join-Path $mls "austins-fc.football-logos.cc.png") (Join-Path $mls "Austin FC.png")
}

Write-Host "Round2 fixes done."
