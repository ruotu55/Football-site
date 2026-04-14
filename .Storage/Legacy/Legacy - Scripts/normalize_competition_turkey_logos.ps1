# Rename slug downloads to clean .png names; remove all *.football-logos.cc.png
# Maps align with Main Runner */js/teams.js SPECIAL_COMPETITIONS + Türkiye squad JSON stems.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$TI = Join-Path $Root "Teams Images"
$_e9 = [char]0x00E9
$_e4 = [char]0x00E4
$_f6 = [char]0x00F6
$_fc = [char]0x00FC
$_f3 = [char]0x00F3
$_f4 = [char]0x00F4
$_e7 = [char]0x00E7
$_ed = [char]0x00ED

function Ensure-Png($folder, $slugName, $cleanName) {
    $src = Join-Path $folder $slugName
    $dst = Join-Path $folder $cleanName
    if (-not (Test-Path -LiteralPath $src)) { return }
    if (Test-Path -LiteralPath $dst) {
        Remove-Item -LiteralPath $src -Force
        return
    }
    Move-Item -LiteralPath $src -Destination $dst -Force
}

function Strip-Slugs-InFolder($folder) {
    if (-not (Test-Path -LiteralPath $folder)) { return }
    Get-ChildItem -LiteralPath $folder -File -Filter "*.football-logos.cc.png" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Warning "Orphan slug (no mapping): $($_.FullName)"
    }
}

# --- Champions League -> SPECIAL short names ---
$clDir = Join-Path $TI "Competitions\Champions League"
$cl = [ordered]@{
    "ajax.football-logos.cc.png" = "Ajax.png"
    "arsenal.football-logos.cc.png" = "Arsenal.png"
    "as-monaco.football-logos.cc.png" = "Monaco.png"
    "atalanta.football-logos.cc.png" = "Atalanta.png"
    "athletic-club.football-logos.cc.png" = "Athletic Bilbao.png"
    "atletico-madrid.football-logos.cc.png" = "Atletico.png"
    "barcelona.football-logos.cc.png" = "Barcelona.png"
    "bayer-leverkusen.football-logos.cc.png" = "Bayer.png"
    "bayern-munchen.football-logos.cc.png" = "Bayern Munich.png"
    "benfica.football-logos.cc.png" = "Benfica.png"
    "bodo-glimt.football-logos.cc.png" = "Bodo.png"
    "borussia-dortmund.football-logos.cc.png" = "Borussia Dortmund.png"
    "chelsea.football-logos.cc.png" = "Chelsea.png"
    "club-brugge.football-logos.cc.png" = "Club Brugge.png"
    "copenhagen.football-logos.cc.png" = "Copenhagen.png"
    "eintracht-frankfurt.football-logos.cc.png" = "Eintracht Frankfurt.png"
    "galatasaray.football-logos.cc.png" = "Galatasaray.png"
    "inter.football-logos.cc.png" = "Inter Milan.png"
    "juventus.football-logos.cc.png" = "Juventus.png"
    "kairat.football-logos.cc.png" = "Kairat.png"
    "liverpool.football-logos.cc.png" = "Liverpool.png"
    "manchester-city.football-logos.cc.png" = "Manchester City.png"
    "marseille.football-logos.cc.png" = "Marseille.png"
    "napoli.football-logos.cc.png" = "Napoli.png"
    "newcastle.football-logos.cc.png" = "Newcastle.png"
    "olympiacos.football-logos.cc.png" = "Olympiacos.png"
    "pafos.football-logos.cc.png" = "Pafos.png"
    "paris-saint-germain.football-logos.cc.png" = "Paris Saint-Germain.png"
    "psv.football-logos.cc.png" = "PSV Eindhoven.png"
    "qarabag.football-logos.cc.png" = "Qaraba.png"
    "real-madrid.football-logos.cc.png" = "Real Madrid.png"
    "slavia-praha.football-logos.cc.png" = "Slavia Prague.png"
    "sporting-cp.football-logos.cc.png" = "Sporting CP.png"
    "tottenham.football-logos.cc.png" = "Tottenham.png"
    "union-saint-gilloise.football-logos.cc.png" = "Union Saint-Gilloise.png"
    "villarreal.football-logos.cc.png" = "Villarreal.png"
}
# Fix Atletico / Bodø keys (ordered hashtable cannot embed [char] in literal easily)
$cl["atletico-madrid.football-logos.cc.png"] = "Atl$([char]0x00E9)tico.png"
$cl["bodo-glimt.football-logos.cc.png"] = "Bod$([char]0x00F8).png"

foreach ($kv in $cl.GetEnumerator()) { Ensure-Png $clDir $kv.Key $kv.Value }
Strip-Slugs-InFolder $clDir

# --- Europa League ---
$elDir = Join-Path $TI "Competitions\Europa League"
$el = [ordered]@{
    "aston-villa.football-logos.cc.png" = "Aston Villa.png"
    "basel.football-logos.cc.png" = "Basel.png"
    "bologna.football-logos.cc.png" = "Bologna.png"
    "brann.football-logos.cc.png" = "Brann.png"
    "celta.football-logos.cc.png" = "Celta de Vigo.png"
    "celtic.football-logos.cc.png" = "Celtic.png"
    "crvena-zvezda.football-logos.cc.png" = "Red Star Belgrade.png"
    "dinamo-zagreb.football-logos.cc.png" = "Dinamo Zagreb.png"
    "fc-porto.football-logos.cc.png" = "Porto.png"
    "fcsb.football-logos.cc.png" = "FCSB.png"
    "fc-utrecht.football-logos.cc.png" = "Utrecht.png"
    "fenerbahce.football-logos.cc.png" = "Fenerbahce.png"
    "ferencvaros.football-logos.cc.png" = "Ferencvaros.png"
    "feyenoord.football-logos.cc.png" = "Feyenoord.png"
    "freiburg.football-logos.cc.png" = "Freiburg.png"
    "genk.football-logos.cc.png" = "Genk.png"
    "go-ahead-eagles.football-logos.cc.png" = "Go Ahead Eagles.png"
    "lille.football-logos.cc.png" = "Lille.png"
    "ludogorets.football-logos.cc.png" = "Ludogorets.png"
    "lyon.football-logos.cc.png" = "Lyon.png"
    "m-tel-aviv.football-logos.cc.png" = "Maccabi Tel Aviv.png"
    "malmo.football-logos.cc.png" = "Malmo.png"
    "midtjylland.football-logos.cc.png" = "Midtjylland.png"
    "nice.football-logos.cc.png" = "Nice.png"
    "nottingham-forest.football-logos.cc.png" = "Nottingham Forest.png"
    "panathinaikos.football-logos.cc.png" = "Panathinaikos.png"
    "paok.football-logos.cc.png" = "PAOK.png"
    "rangers.football-logos.cc.png" = "Rangers.png"
    "real-betis.football-logos.cc.png" = "Real Betis.png"
    "roma.football-logos.cc.png" = "Roma.png"
    "salzburg.football-logos.cc.png" = "Red Bull Salzburg.png"
    "sc-braga.football-logos.cc.png" = "Braga.png"
    "sturm-graz.football-logos.cc.png" = "Sturm Graz.png"
    "vfb-stuttgart.football-logos.cc.png" = "Stuttgart.png"
    "viktoria-plzen.football-logos.cc.png" = "Viktoria Plzen.png"
    "young-boys.football-logos.cc.png" = "Young Boys.png"
}
$el["ferencvaros.football-logos.cc.png"] = "Ferencv$([char]0x00E1)ros.png"
$el["malmo.football-logos.cc.png"] = "Malm$([char]0x00F6).png"

foreach ($kv in $el.GetEnumerator()) { Ensure-Png $elDir $kv.Key $kv.Value }
Strip-Slugs-InFolder $elDir

# --- Conference League ---
$cfDir = Join-Path $TI "Competitions\Conference League"
$cf = [ordered]@{
    "aberdeen.football-logos.cc.png" = "Aberdeen.png"
    "aek-athens.football-logos.cc.png" = "AEK Athens.png"
    "aek-larnaca.football-logos.cc.png" = "AEK Larnaca.png"
    "az-alkmaar.football-logos.cc.png" = "Alkmaar.png"
    "breidablik.football-logos.cc.png" = "Breidablik.png"
    "celje.football-logos.cc.png" = "Celje.png"
    "crystal-palace.football-logos.cc.png" = "Crystal Palace.png"
    "drita.football-logos.cc.png" = "Drita.png"
    "dynamo-kyiv.football-logos.cc.png" = "Dynamo Kyiv.png"
    "fiorentina.football-logos.cc.png" = "Fiorentina.png"
    "hacken.football-logos.cc.png" = "H$([char]0x00E4)cken.png"
    "hamrun-spartans.football-logos.cc.png" = "Hamrun.png"
    "jagiellonia.football-logos.cc.png" = "Jagiellonia.png"
    "kups.football-logos.cc.png" = "Kuopion.png"
    "lausanne-sport.football-logos.cc.png" = "Lausanne.png"
    "lech-poznan.football-logos.cc.png" = "Lech Poznan.png"
    "legia-warszawa.football-logos.cc.png" = "Legia.png"
    "lincoln-red-imps.football-logos.cc.png" = "Lincoln Red Imps.png"
    "mainz-05.football-logos.cc.png" = "Mainz.png"
    "noah.football-logos.cc.png" = "Noah.png"
    "olomouc.football-logos.cc.png" = "Sigma.png"
    "omonoia.football-logos.cc.png" = "Omonia Nicosia.png"
    "rakow.football-logos.cc.png" = "Rak$([char]0x00F3)w.png"
    "rapid-vienna.football-logos.cc.png" = "Rapid Vienna.png"
    "rayo-vallecano.football-logos.cc.png" = "Rayo Vallecano.png"
    "rc-strasbourg-alsace.football-logos.cc.png" = "Strasbourg.png"
    "rijeka.football-logos.cc.png" = "Rijeka.png"
    "samsunspor.football-logos.cc.png" = "Samsunspor.png"
    "s-bratislava.football-logos.cc.png" = "Slovan Bratislava.png"
    "shakhtar.football-logos.cc.png" = "Shakhtar.png"
    "shamrock-rovers.football-logos.cc.png" = "Shamrock Rovers.png"
    "shelbourne.football-logos.cc.png" = "Shelbourne.png"
    "shkendija.football-logos.cc.png" = "Shkendija.png"
    "sparta-praha.football-logos.cc.png" = "Sparta Prague.png"
    "u-craiova.football-logos.cc.png" = "Craiova.png"
    "zrinjski.football-logos.cc.png" = "Zrinjski.png"
}
foreach ($kv in $cf.GetEnumerator()) { Ensure-Png $cfDir $kv.Key $kv.Value }
Strip-Slugs-InFolder $cfDir

# --- World Cup 2026 country names (exact SPECIAL strings) ---
$wcDir = Join-Path $TI "Competitions\World Cup"
$wc = [ordered]@{
    "algeria-national-team.football-logos.cc.png" = "Algeria.png"
    "argentina-national-team.football-logos.cc.png" = "Argentina.png"
    "australia-national-team.football-logos.cc.png" = "Australia.png"
    "austria-national-team.football-logos.cc.png" = "Austria.png"
    "belgium-national-team.football-logos.cc.png" = "Belgium.png"
    "brazil-national-team.football-logos.cc.png" = "Brazil.png"
    "cabo-verde-national-team.football-logos.cc.png" = "Cabo Verde.png"
    "canada-national-team.football-logos.cc.png" = "Canada.png"
    "colombia-national-team.football-logos.cc.png" = "Colombia.png"
    "cote-d-ivoire-national-team.football-logos.cc.png" = "C$([char]0x00F4)te d'Ivoire.png"
    "croatia-national-team.football-logos.cc.png" = "Croatia.png"
    "curacao-national-team.football-logos.cc.png" = "Cura$([char]0x00E7)ao.png"
    "dutch-national-team.football-logos.cc.png" = "Netherlands.png"
    "ecuador-national-team.football-logos.cc.png" = "Ecuador.png"
    "egypt-national-team.football-logos.cc.png" = "Egypt.png"
    "england-national-team.football-logos.cc.png" = "England.png"
    "france-national-team.football-logos.cc.png" = "France.png"
    "germany-national-team.football-logos.cc.png" = "Germany.png"
    "ghana-national-team.football-logos.cc.png" = "Ghana.png"
    "haiti-national-team.football-logos.cc.png" = "Haiti.png"
    "iran-national-team.football-logos.cc.png" = "Iran.png"
    "italy-national-team.football-logos.cc.png" = "Italy.png"
    "japan-national-team.football-logos.cc.png" = "Japan.png"
    "jordan-national-team.football-logos.cc.png" = "Jordan.png"
    "mexico-national-team.football-logos.cc.png" = "Mexico.png"
    "morocco-national-team.football-logos.cc.png" = "Morocco.png"
    "new-zealand-national-team.football-logos.cc.png" = "New Zealand.png"
    "norway-national-team.football-logos.cc.png" = "Norway.png"
    "panama-national-team.football-logos.cc.png" = "Panama.png"
    "paraguay-national-team.football-logos.cc.png" = "Paraguay.png"
    "portuguese-football-federation.football-logos.cc.png" = "Portugal.png"
    "qatar-national-team.football-logos.cc.png" = "Qatar.png"
    "saudi-arabia-national-team.football-logos.cc.png" = "Saudi Arabia.png"
    "scotland-national-team.football-logos.cc.png" = "Scotland.png"
    "senegal-national-team.football-logos.cc.png" = "Senegal.png"
    "south-africa-national-team.football-logos.cc.png" = "South Africa.png"
    "south-korea-national-team.football-logos.cc.png" = "South Korea.png"
    "spain-national-team.football-logos.cc.png" = "Spain.png"
    "switzerland-national-team.football-logos.cc.png" = "Switzerland.png"
    "tunisia-national-team.football-logos.cc.png" = "Tunisia.png"
    "uruguay-national-team.football-logos.cc.png" = "Uruguay.png"
    "usa-national-team.football-logos.cc.png" = "United States.png"
    "uzbekistan-national-team.football-logos.cc.png" = "Uzbekistan.png"
}
foreach ($kv in $wc.GetEnumerator()) { Ensure-Png $wcDir $kv.Key $kv.Value }
Strip-Slugs-InFolder $wcDir

# --- Türkiye Süper Lig: JSON stems + extras; drop slug if clean exists ---
$trDir = Join-Path (Join-Path $TI "T$([char]0x00FC)rkiye") "S$([char]0x00FC)per Lig"
if (-not (Test-Path -LiteralPath $trDir)) { Write-Warning "Türkiye folder missing: $trDir"; exit 0 }

$tr = [ordered]@{
    "alanyaspor.football-logos.cc.png" = "Alanyaspor.png"
    "antalyaspor.football-logos.cc.png" = "Antalyaspor.png"
    "besiktas.football-logos.cc.png" = "Besiktas JK.png"
    "eyupspor.football-logos.cc.png" = "Ey$([char]0x00FC)pspor.png"
    "fenerbahce.football-logos.cc.png" = "Fenerbahce.png"
    "galatasaray.football-logos.cc.png" = "Galatasaray.png"
    "gaziantep.football-logos.cc.png" = "Gaziantep FK.png"
    "genclerbirligi.football-logos.cc.png" = "Genclerbirligi Ankara.png"
    "goztepe-izmir.football-logos.cc.png" = "G$([char]0x00F6)ztepe.png"
    "kasimpasa.football-logos.cc.png" = "Kasimpasa.png"
    "kayserispor.football-logos.cc.png" = "Kayserispor.png"
    "kocaelispor.football-logos.cc.png" = "Kocaelispor.png"
    "konyaspor.football-logos.cc.png" = "Konyaspor.png"
    "rizespor.football-logos.cc.png" = "Caykur Rizespor.png"
    "samsunspor.football-logos.cc.png" = "Samsunspor.png"
    "trabzonspor.football-logos.cc.png" = "Trabzonspor.png"
    "basaksehir.football-logos.cc.png" = "Istanbul Basaksehir FK.png"
    "fatih-karagumruk.football-logos.cc.png" = "Fatih Karag$([char]0x00FC)mr$([char]0x00FC)k.png"
}
foreach ($kv in $tr.GetEnumerator()) { Ensure-Png $trDir $kv.Key $kv.Value }

# Fix mojibake duplicate clean names if present
Get-ChildItem -LiteralPath $trDir -File -Filter "*.png" | ForEach-Object {
    if ($_.Name -match "Ey.*pspor") { Rename-Item -LiteralPath $_.FullName -NewName "Ey$([char]0x00FC)pspor.png" -Force -ErrorAction SilentlyContinue }
    if ($_.Name -match "^G.*ztepe") { Rename-Item -LiteralPath $_.FullName -NewName "G$([char]0x00F6)ztepe.png" -Force -ErrorAction SilentlyContinue }
}

Get-ChildItem -LiteralPath $trDir -File -Filter "*.football-logos.cc.png" -ErrorAction SilentlyContinue | Remove-Item -Force

$left = @(Get-ChildItem -LiteralPath $TI -Recurse -File -Filter "*.football-logos.cc.png" -ErrorAction SilentlyContinue)
Write-Host "Done. Remaining .football-logos.cc.png under Teams Images: $($left.Count)"
if ($left.Count -gt 0) { $left | ForEach-Object { Write-Host "  $($_.FullName)" } }
