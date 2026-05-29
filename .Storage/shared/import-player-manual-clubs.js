/**
 * Manual player → club picks when the squad DB has duplicates or missing entries.
 * Used by calendar seed scripts and import resolution.
 */
export const PLAYER_MANUAL_CLUBS = {
  "alisson becker": "Liverpool FC",
  "gabriel magalhaes": "Arsenal FC",
  "rodri": "Manchester City",
  "marquinhos": "Paris Saint-Germain",
  "vitinha": "Paris Saint-Germain",
  "luis diaz": "Bayern Munich",
  "cristian romero": "Tottenham Hotspur",
  "diogo jota": "Liverpool FC",
  "ederson": "Manchester City",
  "emiliano martinez": "Aston Villa",
  "lucas hernandez": "Paris Saint-Germain",
  "pablo": "West Ham United",
  "alejandro baena": "Atlético de Madrid",
  "dani carvajal": "Real Madrid",
  "endrick": "Olympique Lyon",
  "enzo fernandez": "Chelsea FC",
  "fabinho": "Al-Ittihad Club",
  "gerson": "Cruzeiro Esporte Clube",
  "luis suarez": "Inter Miami CF",
  "sergio arribas": "UD Almería",
  "alex baena": "Atlético de Madrid",
  "joao pedro": "Chelsea FC",
  "emerson palmieri": "Olympique Marseille",
  "matheus cunha": "Manchester United",
  "alexander mitrovic": "Al-Rayyan SC",
};

export const PLAYER_IMPORT_ALIASES = {
  "alexander arnold": "trent alexander arnold",
  "gabriel magalhaes": "gabriel",
  "kim min jae": "min jae kim",
  "hwang hee chan": "hee chan hwang",
  "moussa al tamari": "mousa tamari",
  "alisson becker": "alisson",
  "trent alexander arnold": "trent alexander arnold",
  "son heung min": "heung min son",
  "ruben dias": "ruben dias",
  "rúben dias": "ruben dias",
  "lucas hernandez": "lucas hernandez",
  "alex baena": "alejandro baena",
  "emerson palmieri": "emerson",
  "heung min son": "heung min son",
  "neymar jr": "neymar",
  "alexander mitrovic": "aleksandar mitrovic",
};

export function manualClubForPlayer(rawName) {
  const key = String(rawName || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return PLAYER_MANUAL_CLUBS[key] || null;
}
