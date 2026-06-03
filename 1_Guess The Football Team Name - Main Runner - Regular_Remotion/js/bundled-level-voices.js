/** Five lines per milestone; variant 1 keeps legacy on-disk filenames. */
export const BUNDLED_MILESTONES = [
  {
    serverKey: "warm-up",
    audioKey: "warmUp",
    playsAt: { english: "Level 1", spanish: "Nivel 1" },
    variants: [
      {
        variant: 1,
        text: {
          english: "Warm-up round — don't mess this one up!",
          spanish: "Ronda de calentamiento — ¡no la arruines!",
        },
        filename: "Worm up round dont mess this one .mp3",
      },
      {
        variant: 2,
        text: {
          english: "Easy start — you should get this one!",
          spanish: "Empiezo fácil — ¡deberías acertar esta!",
        },
        filename: "bundled-warm-up-02.mp3",
      },
      {
        variant: 3,
        text: {
          english: "First level — nice and simple!",
          spanish: "Primer nivel — ¡fácil y sencillo!",
        },
        filename: "bundled-warm-up-03.mp3",
      },
      {
        variant: 4,
        text: {
          english: "This one's easy — don't miss it!",
          spanish: "Esta es fácil — ¡no la falles!",
        },
        filename: "bundled-warm-up-04.mp3",
      },
      {
        variant: 5,
        text: {
          english: "Round one — let's get off to a good start!",
          spanish: "Primera ronda — ¡empecemos bien!",
        },
        filename: "bundled-warm-up-05.mp3",
      },
    ],
  },
  {
    serverKey: "serious",
    audioKey: "serious",
    playsAt: { english: "~30% progress", spanish: "~30% de avance" },
    variants: [
      {
        variant: 1,
        text: {
          english: "OK — now it's getting serious.",
          spanish: "Bien — ahora se pone serio.",
        },
        filename: "OK now it's getting serious.mp3",
      },
      {
        variant: 2,
        text: {
          english: "It's a bit harder now — stay focused!",
          spanish: "Ahora es un poco más difícil — ¡concéntrate!",
        },
        filename: "bundled-serious-02.mp3",
      },
      {
        variant: 3,
        text: {
          english: "Not the easy ones anymore — think hard!",
          spanish: "Ya no son las fáciles — ¡piensa bien!",
        },
        filename: "bundled-serious-03.mp3",
      },
      {
        variant: 4,
        text: {
          english: "We're past the easy part — pay attention!",
          spanish: "Pasamos lo fácil — ¡presta atención!",
        },
        filename: "bundled-serious-04.mp3",
      },
      {
        variant: 5,
        text: {
          english: "About a third done — time to try harder!",
          spanish: "Casi un tercio — ¡hay que esforzarse más!",
        },
        filename: "bundled-serious-05.mp3",
      },
    ],
  },
  {
    serverKey: "nerds",
    audioKey: "nerds",
    playsAt: { english: "~60% progress", spanish: "~60% de avance" },
    variants: [
      {
        variant: 1,
        text: {
          english: "Only real football fans know this one!",
          spanish: "¡Solo los verdaderos fans del fútbol saben esta!",
        },
        filename: "Only true football nerd know this!!!.mp3",
      },
      {
        variant: 2,
        text: {
          english: "This one's tough — not for casual fans!",
          spanish: "Esta es difícil — ¡no es para fans casuales!",
        },
        filename: "bundled-nerds-02.mp3",
      },
      {
        variant: 3,
        text: {
          english: "Hard one — you need to know your football!",
          spanish: "Difícil — ¡tienes que saber de fútbol!",
        },
        filename: "bundled-nerds-03.mp3",
      },
      {
        variant: 4,
        text: {
          english: "Most people struggle here — good luck!",
          spanish: "La mayoría falla aquí — ¡suerte!",
        },
        filename: "bundled-nerds-04.mp3",
      },
      {
        variant: 5,
        text: {
          english: "Deep football knowledge needed for this!",
          spanish: "¡Hace falta mucho saber de fútbol para esta!",
        },
        filename: "bundled-nerds-05.mp3",
      },
    ],
  },
  {
    serverKey: "genius",
    audioKey: "genius",
    playsAt: { english: "~90% progress", spanish: "~90% de avance" },
    variants: [
      {
        variant: 1,
        text: {
          english: "If you get this, you're basically a genius!",
          spanish: "¡Si aciertas esto, eres básicamente un genio!",
        },
        filename: "If you get this you are basically a genius!!!.mp3",
      },
      {
        variant: 2,
        text: {
          english: "Almost at the end — this one's really hard!",
          spanish: "¡Casi al final — esta es muy difícil!",
        },
        filename: "bundled-genius-02.mp3",
      },
      {
        variant: 3,
        text: {
          english: "Very few people get this one right!",
          spanish: "¡Muy poca gente acierta esta!",
        },
        filename: "bundled-genius-03.mp3",
      },
      {
        variant: 4,
        text: {
          english: "Last hard one — only the best will know it!",
          spanish: "Última difícil — ¡solo los mejores la saben!",
        },
        filename: "bundled-genius-04.mp3",
      },
      {
        variant: 5,
        text: {
          english: "Nearly done — this is the toughest of all!",
          spanish: "¡Casi terminamos — esta es la más dura!",
        },
        filename: "bundled-genius-05.mp3",
      },
    ],
  },
];

export const BUNDLED_VARIANT_COUNT = 5;

export function getBundledVariantEntry(serverKey, variant) {
  const milestone = BUNDLED_MILESTONES.find((m) => m.serverKey === serverKey);
  if (!milestone) return null;
  const v = Number(variant) || 1;
  return milestone.variants.find((row) => row.variant === v) || milestone.variants[0] || null;
}

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
  if (!entry?.filename) return "";
  return `../.Storage/Voices/Levels/${lang}/${entry.filename}`;
}

/** One random variant per milestone (independent — e.g. 1, 3, 2, 5). */
export function pickRandomBundledVariants() {
  const out = {};
  for (const milestone of BUNDLED_MILESTONES) {
    const pick = milestone.variants[Math.floor(Math.random() * milestone.variants.length)];
    out[milestone.audioKey] = pick.variant;
  }
  try {
    document.dispatchEvent(new CustomEvent("bundled-voice-variants-change", { detail: out }));
  } catch { /* non-DOM contexts */ }
  return out;
}
