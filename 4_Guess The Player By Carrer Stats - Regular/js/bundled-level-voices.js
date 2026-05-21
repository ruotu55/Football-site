const v = (variant, filename, english, spanish) => ({
  variant,
  filename,
  text: { english, spanish },
});

export const BUNDLED_MILESTONES = [
  {
    serverKey: "warm-up",
    audioKey: "warmUp",
    playsAt: { english: "Level 1", spanish: "Nivel 1" },
    variants: [
      v(1, "Worm up round dont mess this one .mp3", "Warm-up round — don't mess this one up!", "Ronda de calentamiento — ¡no la arruines!"),
      v(2, "bundled-warm-up-02.mp3", "Easy start — you should get this one!", "Empiezo fácil — ¡deberías acertar esta!"),
      v(3, "bundled-warm-up-03.mp3", "First level — nice and simple!", "Primer nivel — ¡fácil y sencillo!"),
      v(4, "bundled-warm-up-04.mp3", "This one's easy — don't miss it!", "Esta es fácil — ¡no la falles!"),
      v(5, "bundled-warm-up-05.mp3", "Round one — let's get off to a good start!", "Primera ronda — ¡empecemos bien!"),
    ],
  },
  {
    serverKey: "serious",
    audioKey: "serious",
    playsAt: { english: "~30% progress", spanish: "~30% de avance" },
    variants: [
      v(1, "OK now it's getting serious.mp3", "OK — now it's getting serious.", "Bien — ahora se pone serio."),
      v(2, "bundled-serious-02.mp3", "It's a bit harder now — stay focused!", "Ahora es un poco más difícil — ¡concéntrate!"),
      v(3, "bundled-serious-03.mp3", "Not the easy ones anymore — think hard!", "Ya no son las fáciles — ¡piensa bien!"),
      v(4, "bundled-serious-04.mp3", "We're past the easy part — pay attention!", "Pasamos lo fácil — ¡presta atención!"),
      v(5, "bundled-serious-05.mp3", "About a third done — time to try harder!", "Casi un tercio — ¡hay que esforzarse más!"),
    ],
  },
  {
    serverKey: "nerds",
    audioKey: "nerds",
    playsAt: { english: "~60% progress", spanish: "~60% de avance" },
    variants: [
      v(1, "Only true football nerd know this!!!.mp3", "Only real football fans know this one!", "¡Solo los verdaderos fans del fútbol saben esta!"),
      v(2, "bundled-nerds-02.mp3", "This one's tough — not for casual fans!", "Esta es difícil — ¡no es para fans casuales!"),
      v(3, "bundled-nerds-03.mp3", "Hard one — you need to know your football!", "Difícil — ¡tienes que saber de fútbol!"),
      v(4, "bundled-nerds-04.mp3", "Most people struggle here — good luck!", "La mayoría falla aquí — ¡suerte!"),
      v(5, "bundled-nerds-05.mp3", "Deep football knowledge needed for this!", "¡Hace falta mucho saber de fútbol para esta!"),
    ],
  },
  {
    serverKey: "genius",
    audioKey: "genius",
    playsAt: { english: "~90% progress", spanish: "~90% de avance" },
    variants: [
      v(1, "If you get this you are basically a genius!!!.mp3", "If you get this, you're basically a genius!", "¡Si aciertas esto, eres básicamente un genio!"),
      v(2, "bundled-genius-02.mp3", "Almost at the end — this one's really hard!", "¡Casi al final — esta es muy difícil!"),
      v(3, "bundled-genius-03.mp3", "Very few people get this one right!", "¡Muy poca gente acierta esta!"),
      v(4, "bundled-genius-04.mp3", "Last hard one — only the best will know it!", "Última difícil — ¡solo los mejores la saben!"),
      v(5, "bundled-genius-05.mp3", "Nearly done — this is the toughest of all!", "¡Casi terminamos — esta es la más dura!"),
    ],
  },
];

export const BUNDLED_VARIANT_COUNT = 5;

export function getSelectedBundledVariant(audioKey, variantsMap) {
  const n = Number(variantsMap?.[audioKey]) || 1;
  return Math.min(BUNDLED_VARIANT_COUNT, Math.max(1, Math.floor(n)));
}

export function getBundledLevelPath(audioKey, lang, variantsMap, variantOverride) {
  const milestone = BUNDLED_MILESTONES.find((m) => m.audioKey === audioKey);
  if (!milestone) return "";
  const variant = variantOverride != null
    ? Math.min(BUNDLED_VARIANT_COUNT, Math.max(1, Math.floor(Number(variantOverride) || 1)))
    : getSelectedBundledVariant(audioKey, variantsMap);
  const entry = milestone.variants.find((row) => row.variant === variant) || milestone.variants[0];
  return entry?.filename ? `../.Storage/Voices/Levels/${lang}/${entry.filename}` : "";
}

export function pickRandomBundledVariants() {
  const out = {};
  for (const milestone of BUNDLED_MILESTONES) {
    const pick = milestone.variants[Math.floor(Math.random() * milestone.variants.length)];
    out[milestone.audioKey] = pick.variant;
  }
  try {
    document.dispatchEvent(new CustomEvent("bundled-voice-variants-change", { detail: out }));
  } catch {}
  return out;
}
