// Single level: Real Madrid 4-3-3, taken from the "Champion League" save
// (recording-status.json -> blocks["1|long|1"].script.levels[2]).
//
// Formation coordinates (x, y in a 0..100 box) are the runner's real 4-3-3
// slots from js/formations.js. y=100 is the GK end (bottom), y=22 the front line.

export type Player = {
  slug: string; // matches public/players/<slug>.webp
  display: string; // short name shown on the plate
  number: number;
  x: number;
  y: number;
};

export const TEAM = {
  name: "REAL MADRID",
  crest: "brand/crest.png",
  flag: "brand/flag.png",
  flagLabel: "SPAIN",
} as const;

export const FORMATION: Player[] = [
  { slug: "courtois", display: "Courtois", number: 1, x: 50, y: 100 },
  { slug: "carvajal", display: "Carvajal", number: 2, x: 88, y: 75 },
  { slug: "militao", display: "Militão", number: 3, x: 63, y: 80 },
  { slug: "huijsen", display: "Huijsen", number: 24, x: 37, y: 80 },
  { slug: "mendy", display: "Mendy", number: 23, x: 12, y: 75 },
  { slug: "valverde", display: "Valverde", number: 15, x: 75, y: 52 },
  { slug: "tchouameni", display: "Tchouaméni", number: 14, x: 50, y: 52 },
  { slug: "bellingham", display: "Bellingham", number: 5, x: 25, y: 52 },
  { slug: "rodrygo", display: "Rodrygo", number: 11, x: 80, y: 22 },
  { slug: "mbappe", display: "Mbappé", number: 9, x: 50, y: 22 },
  { slug: "vinicius", display: "Vinícius Jr", number: 7, x: 20, y: 22 },
];
