import { appState } from "./state.js";
import { getBundledLevelPath } from "./bundled-level-voices.js";

/* ג”€ג”€ Language-aware voice resolution. The voice-tab persists the user's language
     choice to localStorage; every gameplay clip (quiz titles, level progress,
     endings) is resolved against that language and falls back to English if the
     Spanish clip hasn't been generated yet. Team names, BGM, dong and ticking
     are language-invariant. */
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
const SUPPORTED_LANGUAGES = ["english", "spanish"];

function getCurrentLanguage() {
  try {
    const stored = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase();
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : "english";
  } catch { return "english"; }
}

const RUNNER_VARIANT = "Lineups Regular";

const QUIZ_TITLE_FILENAMES = {
  english: {
    "nat-by-club": "Guess the football national team name by players' club !!!.mp3",
  },
  spanish: {
    "nat-by-club": "Adivina el equipo nacional por el club de los jugadores !!!.mp3",
  },
};

const ENDING_FILENAMES = {
  english: {
    "think-you-know": "Think you know the answer_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
    "how-many": "How many did you get_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
  },
  spanish: {
    "think-you-know": "Crees saber la respuesta_ dinoslo en los comentarios!!! No olvides dar like y suscribirte .mp3",
    "how-many": "Cuantas acertaste_ dinoslo en los comentarios!!! No olvides dar like y suscribirte .mp3",
  },
};

function levelPathFor(levelKey, lang) {
  return getBundledLevelPath(levelKey, lang, appState.bundledVoiceVariants);
}

function quizTitlePathFor(quizType, lang) {
  const map = QUIZ_TITLE_FILENAMES[lang] || QUIZ_TITLE_FILENAMES.english;
  const filename = map[quizType];
  if (!filename) return "";
  return `../.Storage/Voices/Game name/${RUNNER_VARIANT}/${lang}/${filename}`;
}

function endingPathFor(endingType, lang) {
  const map = ENDING_FILENAMES[lang] || ENDING_FILENAMES.english;
  const filename = map[endingType];
  if (!filename) return "";
  return `../.Storage/Voices/Ending Guess/${lang}/${filename}`;
}

/** Build a fallback chain: preferred-language first, English as safety net. */
function langAwareCandidates(resolver, ...args) {
  // Each resolver takes its domain args first and `lang` LAST ג€” forward args in that
  // order so `levelPathFor(levelKey, lang)`, `quizTitlePathFor(quizType, lang)` etc. work.
  const lang = getCurrentLanguage();
  if (lang === "english") return [resolver(...args, "english")].filter(Boolean);
  const primary = resolver(...args, lang);
  const fallback = resolver(...args, "english");
  const list = [];
  if (primary) list.push(primary);
  if (fallback && fallback !== primary) list.push(fallback);
  return list;
}

const paths = {
  bgmPlaylist: [
    "../.Storage/Voices/Ringhton/Balada Gitana - House of the Gipsies.mp3",
    "../.Storage/Voices/Ringhton/Bolereando - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Camargue - House of the Gipsies.mp3",
    "../.Storage/Voices/Ringhton/Chica Linda - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Crack That Case - Nathan Moore.mp3",
    "../.Storage/Voices/Ringhton/Delta - TrackTribe.mp3",
    "../.Storage/Voices/Ringhton/Disco Knights - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Estrella - House of the Gipsies.mp3",
    "../.Storage/Voices/Ringhton/Girasol - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Greaser - TrackTribe.mp3",
    "../.Storage/Voices/Ringhton/Josefina - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Look Both Ways - Nathan Moore.mp3",
    "../.Storage/Voices/Ringhton/Los Cabos - House of the Gipsies.mp3",
    "../.Storage/Voices/Ringhton/Merengue de Limon - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Orquidario - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Paseo - House of the Gipsies.mp3",
    "../.Storage/Voices/Ringhton/Recess - TrackTribe.mp3",
    "../.Storage/Voices/Ringhton/Samba Gitana - House of the Gipsies.mp3",
    "../.Storage/Voices/Ringhton/Sing Swing Bada Bing - Doug Maxwell.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 1 - Los Angeles - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 10 - Austin - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 2 - St. Louis - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 3 - Detroit - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 4 - Tulsa - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 5 - Denver - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 6 - New Orleans - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 8 - Chicago - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 9 - Atlanta - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Up And At Em - Nathan Moore.mp3",
    "../.Storage/Voices/Ringhton/Wager With Angels - Nathan Moore.mp3",
    "../.Storage/Voices/Ringhton/We Got This - Nathan Moore.mp3"
  ],
  revealStinger: "../.Storage/Voices/Transitions/mixkit-arcade-bonus-alert-767.wav",
  ticking: "../.Storage/Voices/Ticking sound/ticking sound.mp3"
};

let bgMusic = null;
let currentBgmIndex = 0;
/* True-shuffle bag for BGM: play every track once in a random order before any
   repeats, reshuffle on each loop, and never repeat the same track back-to-back
   across the reshuffle boundary. Reset (bgmShuffleOrder = []) at each play start
   so every recording gets a fresh random order. */
let bgmShuffleOrder = [];
let bgmShufflePos = 0;
let lastBgmIndex = -1;
function reshuffleBgmOrder() {
  bgmShuffleOrder = paths.bgmPlaylist.map((_, i) => i);
  shuffleInPlace(bgmShuffleOrder);
  if (bgmShuffleOrder.length > 1 && bgmShuffleOrder[0] === lastBgmIndex) {
    const j = 1 + Math.floor(Math.random() * (bgmShuffleOrder.length - 1));
    [bgmShuffleOrder[0], bgmShuffleOrder[j]] = [bgmShuffleOrder[j], bgmShuffleOrder[0]];
  }
  bgmShufflePos = 0;
}
function nextBgmIndex() {
  if (bgmShufflePos >= bgmShuffleOrder.length) reshuffleBgmOrder();
  const idx = bgmShuffleOrder[bgmShufflePos++];
  lastBgmIndex = idx;
  return idx;
}
let currentVoice = null;
let tickingAudio = null;

// Timeouts and Intervals for fading
let fadeInterval = null;
let duckingTimeout = null;
let restoreTimeout = null;
let progressTimeout = null;
let bgmCrossfadeInterval = null;
let isBgmCrossfading = false;

const STARTING_VOL = 1.0;
const NORMAL_VOL = 1.0;
const DUCKED_VOL = 0.2; // 20% absolute ג€” applied during any voice clip (intro, reveal, progress, ending, bundled)
const BGM_CROSSFADE_MS = 3000;
const BGM_CROSSFADE_BUFFER_S = 0.15;
/* Wait this long after a voice ends before fading BGM back up. Long enough that
   when a follow-up voice plays (rules ג†’ warm-up, reveal ג†’ progress, etc.), its
   playVoice() can cancel restoreTimeout BEFORE the restore fires. Otherwise the
   BGM swings up toward NORMAL_VOL then has to be ducked back down for the next
   voice ג€” audible as "BGM gets loud, then suddenly quiet again". */
const RESTORE_WAIT_STANDALONE_MS = 2500;
/* When the voice that just ended was itself part of a chain (it started shortly
   after a previous voice ended), no further voice is expected immediately ג€” this
   IS the tail of the chain. Restore fast. */
const RESTORE_WAIT_AFTER_CHAIN_MS = 0;
/* A voice that starts within this window after the previous voice ended is
   considered "in a chain" (e.g., warm-up arriving ~1ג€“2 s after rules ends). */
const VOICE_CHAIN_GAP_MS = 3000;
const RESTORE_FADE_MS = 1500;

/* Tracks when the last voice's `ended` event fired ג€” used so the NEXT voice can
   classify itself as "in a chain" vs "standalone" by comparing its start time. */
let lastVoiceEndedAt = 0;
let bgMusicTargetVolume = STARTING_VOL;

function fadeBgm(targetVolume, durationMs) {
  if (!bgMusic) return;
  clearInterval(fadeInterval);

  const steps = 20; // 20 frames for the smooth fade
  const stepTime = Math.max(10, durationMs / steps);
  const startVolume = bgMusic.volume;
  const volumeDiff = targetVolume - startVolume;
  let currentStep = 0;

  fadeInterval = setInterval(() => {
    if (!bgMusic) {
      clearInterval(fadeInterval);
      return;
    }
    currentStep++;
    let newVol = startVolume + (volumeDiff * (currentStep / steps));

    // Safety clamp volume to avoid browser errors
    if (newVol > 1) newVol = 1;
    if (newVol < 0) newVol = 0;

    bgMusic.volume = newVol;

    if (currentStep >= steps) {
      bgMusic.volume = targetVolume;
      clearInterval(fadeInterval);
    }
  }, stepTime);
}

function clearBgmEventHandlers(audioEl) {
  if (!audioEl) return;
  audioEl.removeEventListener("ended", onBgmEnded);
  audioEl.removeEventListener("timeupdate", onBgmTimeUpdate);
}

function bindBgmEventHandlers(audioEl) {
  if (!audioEl) return;
  audioEl.addEventListener("ended", onBgmEnded);
  audioEl.addEventListener("timeupdate", onBgmTimeUpdate);
}

function onBgmEnded() {
  queueNextBgm(true);
}

function onBgmTimeUpdate() {
  if (!bgMusic || bgMusic !== this || isBgmCrossfading) return;
  if (!Number.isFinite(bgMusic.duration) || bgMusic.duration <= 0) return;
  const timeLeft = bgMusic.duration - bgMusic.currentTime;
  if (timeLeft <= (BGM_CROSSFADE_MS / 1000) + BGM_CROSSFADE_BUFFER_S) {
    queueNextBgm(false);
  }
}

function queueNextBgm(forceHardSwitch = false) {
  if (!bgMusic || isBgmCrossfading) return;

  const outgoing = bgMusic;
  const outgoingStartVolume = Math.max(0, Math.min(1, outgoing.volume));

  currentBgmIndex = nextBgmIndex();
  const incoming = new Audio(paths.bgmPlaylist[currentBgmIndex]);
  incoming.volume = forceHardSwitch ? outgoingStartVolume : 0;

  if (forceHardSwitch) {
    clearBgmEventHandlers(outgoing);
    outgoing.pause();
    outgoing.currentTime = 0;
    bgMusic = incoming;
    bindBgmEventHandlers(bgMusic);
    bgMusic.play().catch((err) => console.warn("BGM play error:", err));
    return;
  }

  isBgmCrossfading = true;
  clearBgmEventHandlers(outgoing);
  clearInterval(bgmCrossfadeInterval);

  bgMusic = incoming;
  bindBgmEventHandlers(bgMusic);

  const steps = 30;
  const stepTime = Math.max(10, BGM_CROSSFADE_MS / steps);
  let currentStep = 0;

  bgMusic.play().catch((err) => {
    console.warn("BGM play error:", err);
    clearInterval(bgmCrossfadeInterval);
    isBgmCrossfading = false;
    clearBgmEventHandlers(bgMusic);
    bgMusic = outgoing;
    bindBgmEventHandlers(bgMusic);
    queueNextBgm(true);
  });

  bgmCrossfadeInterval = setInterval(() => {
    currentStep++;
    const t = currentStep / steps;
    outgoing.volume = Math.max(0, outgoingStartVolume * (1 - t));
    if (bgMusic) {
      bgMusic.volume = Math.max(0, Math.min(1, outgoingStartVolume * t));
    }

    if (currentStep >= steps) {
      clearInterval(bgmCrossfadeInterval);
      outgoing.pause();
      outgoing.currentTime = 0;
      outgoing.volume = outgoingStartVolume;
      if (bgMusic) {
        bgMusic.volume = outgoingStartVolume;
      }
      isBgmCrossfading = false;
    }
  }, stepTime);
}

export function startBgMusic() {
  clearInterval(bgmCrossfadeInterval);
  isBgmCrossfading = false;
  if (bgMusic) {
    bgMusic.pause();
    clearBgmEventHandlers(bgMusic);
  }
  // Start with a random song from the list
  bgmShuffleOrder = [];
  currentBgmIndex = nextBgmIndex();
  bgMusic = new Audio(paths.bgmPlaylist[currentBgmIndex]);
  bgMusicTargetVolume = STARTING_VOL;
  bgMusic.volume = bgMusicTargetVolume;
  bindBgmEventHandlers(bgMusic);
  bgMusic.play().catch(err => console.warn("BGM play error:", err));
}

export function setBgMusicForLevel(levelIndex) {
  const nextTargetVolume = levelIndex >= 1 ? NORMAL_VOL : STARTING_VOL;
  const isRampingUp = nextTargetVolume > bgMusicTargetVolume;
  bgMusicTargetVolume = nextTargetVolume;
  if (!bgMusic) return;
  if (isRampingUp) {
    fadeBgm(bgMusicTargetVolume, 1800);
  }
  /* Don't directly write bgMusic.volume in the non-ramping branch. The voice
     ducking system owns the actual playback volume; forcing it here on every
     level switch was overriding an active duck (e.g., rules-voice-end ג†’
     switchLevel(2) was kicking BGM to 100% instantly, just before the warm-up
     voice ducked it back down). Target stays updated either way. */
}

export function stopAllAudio() {
  clearTimeout(duckingTimeout);
  clearTimeout(restoreTimeout);
  clearTimeout(progressTimeout);
  clearInterval(fadeInterval);
  clearInterval(bgmCrossfadeInterval);
  isBgmCrossfading = false;
  /* Reset chain tracking so the FIRST voice of the next run doesn't get
     misclassified as "in a chain" just because the previous run ended recently. */
  lastVoiceEndedAt = 0;

  if (bgMusic) {
    clearBgmEventHandlers(bgMusic);
    bgMusic.pause();
    bgMusic.currentTime = 0;
    bgMusicTargetVolume = STARTING_VOL;
    bgMusic.volume = bgMusicTargetVolume;
  }
  if (currentVoice) {
    currentVoice.pause();
    currentVoice.currentTime = 0;
  }
  if (tickingAudio) {
    tickingAudio.pause();
    tickingAudio.currentTime = 0;
  }
}

export function playVoice(src, delayMs = 1000) {
  if (currentVoice) {
    currentVoice.pause();
  }

  clearTimeout(duckingTimeout);
  clearTimeout(restoreTimeout);

  // 1. Immediately start smoothly fading down over the delay period
  fadeBgm(DUCKED_VOL, delayMs);

  /* Classify THIS voice based on how recently the previous voice ended. If it
     started shortly after the last voice's end, it's the tail of a chain ג€” no
     follow-up is expected, so we'll restore the BGM fast when it ends. If the
     previous voice ended long ago (or never), this voice might be the START of
     a new chain, so use the long wait to protect against a follow-up arriving
     late. Captured here in closure so it's not racy across calls. */
  const isChainedVoice =
    lastVoiceEndedAt > 0 && (Date.now() - lastVoiceEndedAt) < VOICE_CHAIN_GAP_MS;
  const restoreWaitMs = isChainedVoice
    ? RESTORE_WAIT_AFTER_CHAIN_MS
    : RESTORE_WAIT_STANDALONE_MS;

  // 2. Play the voice after the delay finishes
  return new Promise((resolve) => {
    duckingTimeout = setTimeout(() => {
      currentVoice = new Audio(src);
      currentVoice.play().catch(err => {
        console.warn("Voice play error:", err);
        resolve();
      });

      /* 3. When voice finishes, wait restoreWaitMs (long for standalone-start
         voices, ~0 for tail-of-chain voices) then fade back up over
         RESTORE_FADE_MS. Any follow-up voice that calls playVoice() during the
         wait clears restoreTimeout, so chained voices stay ducked across the
         whole chain instead of swinging up between them. */
      currentVoice.addEventListener('ended', () => {
        lastVoiceEndedAt = Date.now();
        resolve();
        restoreTimeout = setTimeout(() => {
          fadeBgm(NORMAL_VOL, RESTORE_FADE_MS);
        }, restoreWaitMs);
      });
      currentVoice.addEventListener('error', () => {
        lastVoiceEndedAt = Date.now();
        resolve();
      });
    }, delayMs);
  });
}

/** Probe candidates and resolve to the first URL that `canplay`s. */
function pickExistingSrc(candidates) {
  const list = (candidates || []).filter((s) => !!s);
  if (list.length === 0) return Promise.resolve("");
  if (list.length === 1) return Promise.resolve(list[0]);
  return new Promise((resolve) => {
    let i = 0;
    const tryNext = () => {
      if (i >= list.length) { resolve(""); return; }
      const src = list[i++];
      if (i === list.length) { resolve(src); return; }
      const probe = new Audio();
      const cleanup = () => {
        probe.removeEventListener("error", onErr);
        probe.removeEventListener("canplay", onOk);
      };
      const onErr = () => { cleanup(); tryNext(); };
      const onOk = () => {
        cleanup();
        probe.pause(); probe.removeAttribute("src"); probe.load();
        resolve(src);
      };
      probe.addEventListener("error", onErr, { once: true });
      probe.addEventListener("canplay", onOk, { once: true });
      probe.src = src;
      probe.load();
    };
    tryNext();
  });
}

/**
 * Probe a fallback chain and playVoice the first entry that canplay.
 * Used when the gameplay needs language-specific clips but the Spanish file
 * might not have been generated yet ג€” fall back to English silently.
 */
function playVoiceFromCandidates(candidates, delayMs = 1000) {
  const list = (candidates || []).filter((s) => !!s);
  if (list.length === 0) return Promise.resolve();
  if (list.length === 1) return playVoice(list[0], delayMs);
  return new Promise((resolve) => {
    let i = 0;
    const tryNext = () => {
      if (i >= list.length) { resolve(); return; }
      const src = list[i++];
      if (i === list.length) { playVoice(src, delayMs).then(resolve); return; }
      const probe = new Audio();
      const cleanup = () => {
        probe.removeEventListener("error", onErr);
        probe.removeEventListener("canplay", onOk);
      };
      const onErr = () => { cleanup(); tryNext(); };
      const onOk = () => {
        cleanup();
        probe.pause(); probe.removeAttribute("src"); probe.load();
        playVoice(src, delayMs).then(resolve);
      };
      probe.addEventListener("error", onErr, { once: true });
      probe.addEventListener("canplay", onOk, { once: true });
      probe.src = src;
      probe.load();
    };
    tryNext();
  });
}

export function playTicking() {
  if (tickingAudio) {
    tickingAudio.pause();
    tickingAudio.currentTime = 0;
  }
  tickingAudio = new Audio(paths.ticking);
  tickingAudio.play().catch(err => console.warn("Ticking play error:", err));
}

export function stopTicking() {
  if (tickingAudio) {
    tickingAudio.pause();
    tickingAudio.currentTime = 0;
  }
}

function getRulesVoicePath(quizType) {
  return getRulesVoiceCandidates(quizType)[0] || "";
}

function getRulesVoiceCandidates(quizType) {
  return langAwareCandidates(quizTitlePathFor, quizType);
}

export function playRules(quizType, delayMs = 1000) {
  if (!appState.isVideoPlaying) return Promise.resolve();
  const playFallback = () => {
    playVoiceFromCandidates(getRulesVoiceCandidates(quizType), delayMs);
  };
  const resolver = window.__resolveQuizTitleVoiceSrc;
  if (typeof resolver !== "function") {
    playFallback();
    return Promise.resolve();
  }
  return Promise.resolve(resolver(quizType))
    .then((src) => {
      const clipSrc = String(src || "").trim();
      if (clipSrc) {
        return playVoice(clipSrc, delayMs);
      } else {
        playFallback();
      }
    })
    .catch(() => {
      playFallback();
    });
}

export const TEAM_NAME_VOICE_EXTS = [".mp3", ".wav", ".m4a"];

/** Phrase variants for the reveal voice. Keep in sync with run_site.py TEAM_PHRASE_TEMPLATES. */
export const TEAM_PHRASE_KEYS = [
  "plain",
  "correct-answer",
  "right-answer",
  "and-the-answer",
  "answer-is",
  "and-its",
  "team-is",
];
export const TEAM_SENTENCE_PHRASE_KEYS = TEAM_PHRASE_KEYS.filter((k) => k !== "plain");

export const TEAM_PHRASE_TEMPLATES = {
  english: {
    "plain": "{team}",
    "correct-answer": "The correct answer is {team}",
    "right-answer": "The right answer is {team}",
    "and-the-answer": "And the answer is {team}",
    "answer-is": "Answer is {team}",
    "and-its": "And it's {team}",
    "team-is": "The team is {team}",
  },
  spanish: {
    "plain": "{team}",
    "correct-answer": "La respuesta correcta es {team}",
    "right-answer": "La respuesta acertada es {team}",
    "and-the-answer": "Y la respuesta es {team}",
    "answer-is": "La respuesta es {team}",
    "and-its": "Y es {team}",
    "team-is": "El equipo es {team}",
  },
};

export function renderTeamPhrase(phraseKey, teamName, language) {
  const lang = language === "spanish" ? "spanish" : "english";
  const map = TEAM_PHRASE_TEMPLATES[lang] || TEAM_PHRASE_TEMPLATES.english;
  const tpl = map[phraseKey] || map.plain || "{team}";
  return tpl.replace("{team}", String(teamName || ""));
}

/** Relative to runner; trailing slash. `club-by-nat` = guess the club; else = guess the national team. */
export function revealVoiceDirForQuizType(quizType) {
  return quizType === "club-by-nat"
    ? "../.Storage/Voices/Team names/"
    : "../.Storage/Voices/Nationality teams names/";
}

/** Map squad/header names to bundled voice file stem when the on-disk filename differs. Keys are lowercased. */
const TEAM_NAME_VOICE_FILE_ALIASES = {
  "arsenal fc": "Arsenal",
  "as monaco": "Monaco",
  "atalanta bc": "Atalanta",
  "ajax amsterdam": "Ajax",
  "atlֳ©tico de madrid": "Atletico Madrid",
  "bayer 04 leverkusen": "Bayer Leverkusen",
  "chelsea fc": "Chelsea",
  "club brugge kv": "Club Brugge",
  "fc barcelona": "Barcelona",
  "fc copenhagen": "Copenhagen",
  "fk bodֳ¸/glimt": "Bodo Glimt",
  "juventus fc": "Juventus",
  "liverpool fc": "Liverpool",
  "olympiacos piraeus": "Olympiacos",
  "pafos fc": "Pafos",
  "qarabaִ fk": "Qarabag",
  "sk slavia prague": "Slavia Prague",
  "sl benfica": "Benfica Lisbon",
  "ssc napoli": "Napoli",
  "sporting cp": "Sporting Lisbon",
  "villarreal cf": "Villarreal",
};

const TEAM_NAME_VOICE_PREFIXES = ["FC", "FK", "SK", "SL", "AS", "SSC", "RC"];
const TEAM_NAME_VOICE_SUFFIXES = ["FC", "CF", "BC", "SC", "AC", "SK", "FK", "KV", "AFC"];
const TEAM_NAME_VOICE_TRAILING_LOCATION_WORDS = ["Amsterdam", "Piraeus"];

function normalizeVoiceStemText(value) {
  return String(value || "")
    .trim()
    .replace(/[ֳ˜ֳ¸]/g, "o")
    .replace(/[ֳֳ°]/g, "d")
    .replace(/[ֳֳ¾]/g, "th")
    .replace(/[ֳ†ֳ¦]/g, "ae")
    .replace(/[ֵ’ֵ“]/g, "oe")
    .replace(/[ֵֵ‚]/g, "l")
    .replace(/[ִִ]/g, "g")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ג€™'`ֲ´]/g, "")
    .replace(/[\/\\]+/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pushUniqueExactVoiceStem(out, value) {
  const clean = String(value || "").trim().replace(/\s+/g, " ");
  if (clean && !out.includes(clean)) out.push(clean);
}

function pushUniqueVoiceStem(out, value) {
  const clean = normalizeVoiceStemText(value);
  if (clean && !out.includes(clean)) out.push(clean);
}

function addShortVoiceStemVariants(out, stem) {
  const clean = normalizeVoiceStemText(stem);
  if (!clean) return;

  for (const prefix of TEAM_NAME_VOICE_PREFIXES) {
    pushUniqueVoiceStem(out, clean.replace(new RegExp(`^${prefix}\\s+`, "i"), ""));
  }
  for (const suffix of TEAM_NAME_VOICE_SUFFIXES) {
    pushUniqueVoiceStem(out, clean.replace(new RegExp(`\\s+${suffix}$`, "i"), ""));
  }
  for (const word of TEAM_NAME_VOICE_TRAILING_LOCATION_WORDS) {
    pushUniqueVoiceStem(out, clean.replace(new RegExp(`\\s+${word}$`, "i"), ""));
  }

  pushUniqueVoiceStem(out, clean.replace(/\b0+[0-9]+\b/g, "").replace(/\s+/g, " "));
  pushUniqueVoiceStem(out, clean.replace(/\bde\s+/gi, ""));
}

function resolveTeamNameVoiceFileStems(displayName) {
  const trimmed = String(displayName || "").trim();
  if (!trimmed) return [];
  const stems = [];
  const alias = TEAM_NAME_VOICE_FILE_ALIASES[trimmed.toLowerCase()];
  if (alias) pushUniqueExactVoiceStem(stems, alias);
  pushUniqueExactVoiceStem(stems, trimmed);
  if (alias) pushUniqueVoiceStem(stems, alias);
  pushUniqueVoiceStem(stems, trimmed);

  const baseCount = stems.length;
  for (let i = 0; i < baseCount; i++) {
    addShortVoiceStemVariants(stems, stems[i]);
  }
  return stems;
}

function resolveTeamNameVoiceFileStem(displayName) {
  return resolveTeamNameVoiceFileStems(displayName)[0] || "";
}

/** Build candidate URLs in priority order for a given (team, quizType, phraseKey, language).
    Probes new layout `<dir>/<lang>/<phrase>/<Team>.ext` plus, for English plain only, the
    legacy flat `<dir>/<Team>.ext` so pre-existing clips keep working. */
function buildPhraseCandidates(dirRel, cleanNames, language, phraseKey) {
  const out = [];
  const lang = language === "spanish" ? "spanish" : "english";
  const stems = Array.isArray(cleanNames) ? cleanNames : [cleanNames];
  for (const cleanName of stems) {
    for (const ext of TEAM_NAME_VOICE_EXTS) {
      out.push(`${dirRel}${lang}/${phraseKey}/${encodeURIComponent(cleanName)}${ext}`);
    }
  }
  if (lang === "english" && phraseKey === "plain") {
    for (const cleanName of stems) {
      for (const ext of TEAM_NAME_VOICE_EXTS) {
        out.push(`${dirRel}${encodeURIComponent(cleanName)}${ext}`);
      }
    }
  }
  return out;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

/* Shuffled queue of sentence phrases. Pop one per odd-question pick so we cycle through
   every sentence variant before any repeats. Reset whenever `appState.levelsData` is
   swapped to a new array (saved-script load, level rebuild). `lastSentencePhrase` is
   tracked across refills so we can swap the first element of a new shuffle if it
   matches the last pop ג€” prevents the same Spanish sentence appearing on two adjacent
   levels at the queue boundary (e.g. Nivel 6 and Nivel 7 both "Y la respuesta es..."). */
let sentenceQueueLevelsRef = null;
const sentenceQueueStateByLanguage = {
  english: { queue: [], last: "" },
  spanish: { queue: [], last: "" },
};

function sentenceLanguage(language) {
  return language === "spanish" ? "spanish" : "english";
}

function getSentenceQueueState(language) {
  const ref = appState.levelsData;
  if (ref !== sentenceQueueLevelsRef) {
    sentenceQueueLevelsRef = ref;
    for (const state of Object.values(sentenceQueueStateByLanguage)) {
      state.queue = [];
      state.last = "";
    }
  }
  return sentenceQueueStateByLanguage[sentenceLanguage(language)] || sentenceQueueStateByLanguage.english;
}

function nextSentencePhrase(language = getCurrentLanguage()) {
  const state = getSentenceQueueState(language);
  if (state.queue.length === 0) {
    state.queue = shuffleInPlace(TEAM_SENTENCE_PHRASE_KEYS.slice());
    if (state.last && state.queue[0] === state.last && state.queue.length > 1) {
      const swapIdx = 1 + Math.floor(Math.random() * (state.queue.length - 1));
      [state.queue[0], state.queue[swapIdx]] = [state.queue[swapIdx], state.queue[0]];
    }
  }
  const picked = state.queue.shift() || "plain";
  state.last = picked;
  return picked;
}

/** Phrase pick for one reveal slot.
    - English: odd questionIndex -> sentence (from the shuffled queue), even -> plain.
    - Spanish: never plain - always pull a sentence so the team name is never spoken alone. */
function pickRevealPhraseForQuestion(questionIndex, language = getCurrentLanguage()) {
  const lang = sentenceLanguage(language);
  if (lang === "spanish") return nextSentencePhrase(lang);
  if (!Number.isFinite(questionIndex)) return "plain";
  if ((questionIndex % 2) === 0) return "plain";
  return nextSentencePhrase(lang);
}

/** Sticky per-level phrase pick. Stored per language so opening the Voice tab,
    switching language, recording, or validating cannot reroll another language's
    selected phrase. A new saved-script load replaces `levelsData`, which naturally
    creates fresh level objects and fresh phrase picks. */
export function getOrAssignRevealPhrase(levelData, questionIndex, language = getCurrentLanguage()) {
  if (!levelData || typeof levelData !== "object") return "plain";
  const lang = sentenceLanguage(language);
  const byLanguage = levelData.__revealPhraseByLanguage && typeof levelData.__revealPhraseByLanguage === "object"
    ? levelData.__revealPhraseByLanguage
    : {};
  const cached = typeof byLanguage[lang] === "string" ? byLanguage[lang] : "";
  if (cached) return cached;

  const hasLanguageCache = Object.keys(byLanguage).length > 0;
  const legacy = typeof levelData.__revealPhrase === "string" ? levelData.__revealPhrase : "";
  const legacyValidForLang = !hasLanguageCache && legacy && !(lang === "spanish" && legacy === "plain");
  const picked = legacyValidForLang ? legacy : pickRevealPhraseForQuestion(questionIndex, lang);
  try {
    levelData.__revealPhraseByLanguage = { ...byLanguage, [lang]: picked };
    levelData.__revealPhrase = picked;
  } catch {}
  return picked;
}

/** Build the candidate chain for one reveal, given the chosen phrase. Tries the chosen
    phrase first (current language ג†’ English fallback only for the SAME phrase). Never
    falls back to "plain" when a sentence phrase was assigned ג€” that used to silently
    play just the team name instead of the full sentence. Missing sentence clip =
    silence (PROD validation must catch it before play time). */
function buildRevealCandidates(displayName, quizType, phraseKey) {
  const stems = resolveTeamNameVoiceFileStems(displayName);
  if (!stems.length) return [];
  const dir = revealVoiceDirForQuizType(quizType);
  const lang = getCurrentLanguage();
  const phrase = phraseKey || "plain";
  const out = [];
  if (phrase !== "plain") {
    if (lang === "spanish") out.push(...buildPhraseCandidates(dir, stems, "spanish", phrase));
    out.push(...buildPhraseCandidates(dir, stems, "english", phrase));
  } else {
    if (lang === "spanish") out.push(...buildPhraseCandidates(dir, stems, "spanish", "plain"));
    out.push(...buildPhraseCandidates(dir, stems, "english", "plain"));
  }
  return out;
}

/** Probe candidates and play first that loads. Returns silently if none. */
function playFirstExistingClip(candidates, delayMs) {
  const list = (candidates || []).filter(Boolean);
  if (list.length === 0) return;
  let i = 0;
  const tryNext = () => {
    if (i >= list.length) return;
    const src = list[i++];
    const probe = new Audio();
    const cleanup = () => {
      probe.removeEventListener("error", onErr);
      probe.removeEventListener("canplay", onOk);
    };
    const onErr = () => { cleanup(); tryNext(); };
    const onOk = () => {
      cleanup();
      probe.pause(); probe.removeAttribute("src"); probe.load();
      playVoice(src, delayMs);
    };
    probe.addEventListener("error", onErr, { once: true });
    probe.addEventListener("canplay", onOk, { once: true });
    probe.src = src;
    probe.load();
  };
  tryNext();
}

export function buildTeamNameVoiceSrc(displayName, quizType, ext = ".mp3") {
  const cleanName = resolveTeamNameVoiceFileStem(displayName);
  if (!cleanName) return "";
  const cleanExt = String(ext || ".mp3").startsWith(".") ? String(ext || ".mp3") : `.${String(ext || "mp3")}`;
  return `${revealVoiceDirForQuizType(quizType)}${encodeURIComponent(cleanName)}${cleanExt}`;
}

/** Build the URL for a specific (team, quizType, phrase, language) cell ג€” used by the voice tab. */
export function buildTeamPhraseVoiceSrc(displayName, quizType, phraseKey, language, ext = ".mp3") {
  const cleanName = resolveTeamNameVoiceFileStem(displayName);
  if (!cleanName) return "";
  const lang = language === "spanish" ? "spanish" : "english";
  const dir = revealVoiceDirForQuizType(quizType);
  const cleanExt = String(ext || ".mp3").startsWith(".") ? String(ext || ".mp3") : `.${String(ext || "mp3")}`;
  return `${dir}${lang}/${phraseKey}/${encodeURIComponent(cleanName)}${cleanExt}`;
}

/** Manual preview helper for header controls: probe extensions and play the plain variant if found. */
export function playTeamNameVoiceIfExists(displayName, quizType = "nat-by-club", delayMs = 0) {
  const stems = resolveTeamNameVoiceFileStems(displayName);
  if (!stems.length) return;
  const dir = revealVoiceDirForQuizType(quizType);
  const lang = getCurrentLanguage();
  const candidates = [];
  if (lang === "spanish") candidates.push(...buildPhraseCandidates(dir, stems, "spanish", "plain"));
  candidates.push(...buildPhraseCandidates(dir, stems, "english", "plain"));
  playFirstExistingClip(candidates, delayMs);
}

export function playTheAnswerIs(
  includeVoice = true,
  teamDisplayName = "",
  quizType = "nat-by-club",
  /** ms before team name clip after `canplay`; default ducks BGM then plays. Use `0` when synced to UI (e.g. panel slide). */
  teamNameVoiceDelayMs = 600,
  /** Phrase variant chosen by `getOrAssignRevealPhrase` for this level. Falls back to plain. */
  phraseKey = "plain"
) {

  setTimeout(() => {
    const revealStinger = new Audio(paths.revealStinger);
    revealStinger.volume = 0.5;
    revealStinger.play().catch((err) => console.warn("Reveal stinger play error:", err));
  }, 150);

  if (includeVoice && appState.isVideoPlaying) {
    const candidates = buildRevealCandidates(teamDisplayName, quizType, phraseKey);
    playFirstExistingClip(candidates, teamNameVoiceDelayMs);
  }
}

export function playCommentBelow() {
  if (!appState.isVideoPlaying) return Promise.resolve();
  const endingType = typeof window.__getSelectedEndingType === "function"
    ? window.__getSelectedEndingType()
    : "think-you-know";
  return playEndingVoice(endingType);
}

export function playEndingVoice(endingType) {
  if (!appState.isVideoPlaying) return Promise.resolve();
  // Try server-generated voice first via resolver, then fall back to bundled files.
  const resolver = window.__resolveEndingVoiceSrc;
  if (typeof resolver === "function") {
    return Promise.resolve(resolver(endingType))
      .then((src) => {
        const clipSrc = String(src || "").trim();
        if (clipSrc) {
          return playVoice(clipSrc, 100);
        }
        return playEndingVoiceFallback(endingType);
      })
      .catch(() => playEndingVoiceFallback(endingType));
  }
  return playEndingVoiceFallback(endingType);
}

function playEndingVoiceFallback(endingType) {
  return playVoiceFromCandidates(langAwareCandidates(endingPathFor, endingType), 100);
}

export function playProgressVoice(levelIndex, totalLevelsCount) {
  if (!appState.isVideoPlaying) return;
  clearTimeout(progressTimeout);

  const questionIndex = levelIndex - 1;
  const totalQuestions = totalLevelsCount - 3; // Minus Logo, Landing, Outro

  if (questionIndex === 1) {
    playVoiceFromCandidates(langAwareCandidates(levelPathFor, "warmUp"), 1000);
    return;
  }

  const target30 = Math.max(2, Math.round(totalQuestions * 0.3));
  const target60 = Math.max(2, Math.round(totalQuestions * 0.6));
  const target90 = Math.max(2, Math.round(totalQuestions * 0.9));

  if (questionIndex === target30) {
    playVoiceFromCandidates(langAwareCandidates(levelPathFor, "serious"), 1000);
  } else if (questionIndex === target60) {
    playVoiceFromCandidates(langAwareCandidates(levelPathFor, "nerds"), 1000);
  } else if (questionIndex === target90) {
    playVoiceFromCandidates(langAwareCandidates(levelPathFor, "genius"), 1000);
  }
}
