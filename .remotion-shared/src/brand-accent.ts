// Per-competition BRAND ACCENT — so the intro emblem/name, the quiz-title kicker/chips,
// and the bonus screen aren't all the same gold. Each background gets a distinct accent
// chosen to pop on it. Used across UltimateIntro / Intro (title) / BonusIntro.
export type Accent = { main: string; light: string; dark: string; ring: string; linear: string; glow: (a: number) => string };

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const i = parseInt(n, 16);
  return { r: (i >> 16) & 255, g: (i >> 8) & 255, b: i & 255 };
};
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const lighten = (hex: string, t: number) => {
  const { r, g, b } = hexToRgb(hex);
  return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
};
const scaleC = (hex: string, f: number) => {
  const { r, g, b } = hexToRgb(hex);
  return toHex(r * f, g * f, b * f);
};

// Curated accent (main) per competition background. Each accent is the rough
// COMPLEMENT (the "negative") of that background's dominant colour so it pops hard,
// and the set is kept varied across the channel. Background dominant colour noted.
const ACCENT_BY_LABEL: Record<string, string> = {
  "Champions League": "#eef3ff", // bg royal-blue  → silver-white (max-lightness pop, UCL silver)
  "Europa League": "#2bd4ff", //    bg orange      → electric cyan (complement)
  "Conference League": "#ff4d9e", // bg green       → hot magenta-pink (complement)
  "Premier League": "#2fe6c0", //   bg magenta     → mint-teal (complement)
  "La Liga": "#ffd24a", //          bg red         → gold (Spanish red + gold)
  "Bundesliga": "#f4f8ff", //       bg pure red    → white (German red + white)
  "Serie A": "#ffc23a", //          bg blue        → amber-gold (Italy blue + gold; was blue-on-blue)
  "Ligue 1": "#c45bff", //          bg lime        → violet (true complement; was off-pink)
  "World Cup": "#36d0ff", //        bg gold        → sky-blue (complement; was gold-on-gold wash)
  "Euro": "#ff9466", //             bg navy        → coral (warm complement)
  "Generic 1": "#37e0e6", //        bg crimson     → cyan (complement; was 3rd gold)
  "Generic 2": "#4fe3ff", //        bg brown-gold  → aqua (complement; was cream-on-warm wash)
  "Generic 3": "#b8f24a", //        bg slate       → lime-chartreuse (vivid on neutral; was teal-on-cool)
  "Generic 4": "#ff9a4d", //        bg steel-blue  → orange (complement)
};

export const brandAccent = (competitionLabel: string | null | undefined): Accent => {
  const main = (competitionLabel && ACCENT_BY_LABEL[competitionLabel]) || "#ffce4d";
  const light = lighten(main, 0.42);
  const dark = scaleC(main, 0.62);
  const { r, g, b } = hexToRgb(main);
  return {
    main,
    light,
    dark,
    ring: `conic-gradient(from 120deg, ${dark}, ${light}, ${main}, ${light}, ${dark})`,
    linear: `linear-gradient(180deg, ${light} 0%, ${main} 48%, ${dark} 100%)`,
    glow: (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`,
  };
};
