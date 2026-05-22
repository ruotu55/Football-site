import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

/* ── Language-aware voice resolution. The voice-tab persists the user's language
     choice to localStorage; every gameplay clip (quiz titles, level progress,
     endings) is resolved against that language and falls back to English if
     the Spanish clip hasn't been generated yet. Player names, BGM, dong and
     ticking are language-invariant. */
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
const SUPPORTED_LANGUAGES = ["english", "spanish"];

function getCurrentLanguage() {
  try {
    const stored = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase();
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : "english";
  } catch { return "english"; }
}

const RUNNER_VARIANT = "Four Params Shorts";

const LEVEL_FILENAMES = {
  warmUp: "Worm up round dont mess this one .mp3",
  serious: "OK now it's getting serious.mp3",
  nerds: "Only true football nerd know this!!!.mp3",
  genius: "If you get this you are basically a genius!!!.mp3",
};

/* Client-side filenames MUST match `QUIZ_TITLE_VOICE_FILE_BY_QUIZ_TYPE` in
   run_site.py. The `player-by-fake-info` key is re-used by this runner to mean
   the team-name quiz; filename matches the prompt so it doesn't collide with
   folder 6 Shorts in the shared "Four Params Shorts" voice dir. */
const QUIZ_TITLE_FILENAMES = {
  english: {
    "player-by-career": "Guess the football player by career path !!!.mp3",
    "player-by-fake-info": "Guess the football team name !!!.mp3",
  },
  spanish: {
    "player-by-career": "Adivina al jugador por trayectoria !!!.mp3",
    "player-by-fake-info": "Adivina el nombre del equipo de futbol !!!.mp3",
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
  const filename = LEVEL_FILENAMES[levelKey];
  if (!filename) return "";
  return `../.Storage/Voices/Levels/${lang}/${filename}`;
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

/** Build a fallback chain: preferred-language first, English as safety net.
    Each resolver takes its domain args first and `lang` LAST — this helper
    forwards args in that order so `levelPathFor(levelKey, lang)` etc. work. */
function langAwareCandidates(resolver, ...args) {
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
    "../.Storage/Voices/Ringhton/Chica Linda - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Delta - TrackTribe.mp3",
    "../.Storage/Voices/Ringhton/Los Cabos - House of the Gipsies.mp3",
    "../.Storage/Voices/Ringhton/Orquidario - Quincas Moreira.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 1 - Los Angeles - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 2 - St. Louis - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Swing Haven 6 - New Orleans - Reed Mathis.mp3",
    "../.Storage/Voices/Ringhton/Up And At Em - Nathan Moore.mp3"
  ],
  dong: "../.Storage/Voices/the answer is/dong.wav",
  revealStinger: "../.Storage/Voices/Transitions/universfield-new-notification-09-352705.mp3",
  ticking: "../.Storage/Voices/Ticking sound/ticking sound.mp3"
};

let bgMusic = null;
let currentBgmIndex = 0;
let currentVoice = null;
/** Resolves `playRulesShortsLanding` when the clip ends or `stopAllAudio` interrupts. */
let pendingShortsRulesVoiceFinish = null;
/** Single ticking track for countdown red phase (no overlapping clips). */
let tickingAudioEl = null;

// Timeouts and Intervals for fading
let fadeInterval = null;
let duckingTimeout = null;
let restoreTimeout = null;
let progressTimeout = null;
let bgmCrossfadeInterval = null;
let isBgmCrossfading = false;

const STARTING_VOL = 0.05;
const NORMAL_VOL = 0.6;
const DUCKED_VOL = 0.3; // half of NORMAL_VOL (0.6)
const BGM_CROSSFADE_MS = 3000;
const BGM_CROSSFADE_BUFFER_S = 0.15;
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

  currentBgmIndex = (currentBgmIndex + 1) % paths.bgmPlaylist.length;
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
  currentBgmIndex = Math.floor(Math.random() * paths.bgmPlaylist.length);
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
  } else {
    bgMusic.volume = bgMusicTargetVolume;
  }
}

export function stopAllAudio() {
  clearTimeout(duckingTimeout);
  clearTimeout(restoreTimeout);
  clearTimeout(progressTimeout);
  clearInterval(fadeInterval);
  clearInterval(bgmCrossfadeInterval);
  isBgmCrossfading = false;
  
  if (bgMusic) {
    clearBgmEventHandlers(bgMusic);
    bgMusic.pause();
    bgMusic.currentTime = 0;
    bgMusicTargetVolume = STARTING_VOL;
    bgMusic.volume = bgMusicTargetVolume;
  }
  if (pendingShortsRulesVoiceFinish) {
    const finish = pendingShortsRulesVoiceFinish;
    pendingShortsRulesVoiceFinish = null;
    finish();
  }
  if (currentVoice) {
    currentVoice.pause();
    currentVoice.currentTime = 0;
  }
  stopTicking();
}

const TICKING_VOLUME = 1;

function onTickingClipEnded() {
  if (!tickingAudioEl) return;
  tickingAudioEl.currentTime = 0;
  tickingAudioEl.play().catch((err) => console.warn("Ticking play error:", err));
}

/** One ticking stream until `stopTicking` (red phase only in video.js). Restarts on `ended` so clips never stack. */
export function playTicking() {
  stopTicking();
  tickingAudioEl = new Audio(paths.ticking);
  tickingAudioEl.volume = TICKING_VOLUME;
  tickingAudioEl.addEventListener("ended", onTickingClipEnded);
  tickingAudioEl.play().catch((err) => console.warn("Ticking play error:", err));
}

export function stopTicking() {
  if (tickingAudioEl) {
    tickingAudioEl.removeEventListener("ended", onTickingClipEnded);
    tickingAudioEl.pause();
    tickingAudioEl.currentTime = 0;
    tickingAudioEl = null;
  }
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
 * might not have been generated yet — fall back to English silently.
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

export function playVoice(src, delayMs = 1000) {
  if (currentVoice) {
    currentVoice.pause();
  }

  clearTimeout(duckingTimeout);
  clearTimeout(restoreTimeout);

  // 1. Immediately start smoothly fading down over the delay period
  fadeBgm(DUCKED_VOL, delayMs);

  // 2. Play the voice after the delay finishes
  return new Promise((resolve) => {
    duckingTimeout = setTimeout(() => {
      currentVoice = new Audio(src);
      currentVoice.play().catch(err => {
        console.warn("Voice play error:", err);
        resolve();
      });

      // 3. When voice finishes, wait 1s, then smoothly fade back up
      currentVoice.addEventListener('ended', () => {
        resolve();
        restoreTimeout = setTimeout(() => {
          fadeBgm(NORMAL_VOL, 1000); // fade up smoothly over 1s
        }, 1000); // wait 1s after voice ends
      });
      currentVoice.addEventListener('error', () => resolve());
    }, delayMs);
  });
}

function getRulesVoicePath(quizType) {
  return getRulesVoiceCandidates(quizType)[0] || "";
}

function getRulesVoiceCandidates(quizType) {
  return langAwareCandidates(quizTitlePathFor, quizType);
}

function isShortsModeActive() {
  return (
    document.body.classList.contains("shorts-mode") ||
    document.documentElement.classList.contains("shorts-mode")
  );
}

/** Encode each path segment so spaces, `'`, `!` in filenames work in `file:` and `http:` URLs. */
function toAbsoluteBundledVoiceUrl(rel) {
  const s = String(rel || "").trim();
  if (!s) return s;
  if (/^(https?:|blob:|data:)/i.test(s)) {
    return s;
  }
  const segments = s.split("/");
  const encoded = segments.map((seg) => {
    if (seg === "" || seg === "." || seg === "..") return seg;
    return encodeURIComponent(seg);
  });
  const pathPart = encoded.join("/");
  try {
    return new URL(pathPart, document.baseURI || window.location.href).href;
  } catch {
    return s;
  }
}

/**
 * Play one quiz-title clip for shorts (resolves promise when clip ends or errors).
 * Does not call `__resolveQuizTitleVoiceSrc` — `clipSrc` must be a usable URL string.
 */
function playShortsQuizTitleMediaClip(clipSrc, options = {}) {
  const onPlaybackStart =
    typeof options.onPlaybackStart === "function" ? options.onPlaybackStart : null;
  const duckBgmForClip = !!options.duckBgm;
  const notifyPlaybackStart = () => {
    if (onPlaybackStart) onPlaybackStart();
  };
  return new Promise((resolve) => {
    const src = String(clipSrc || "").trim();
    if (!src) {
      notifyPlaybackStart();
      resolve();
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (pendingShortsRulesVoiceFinish === finish) {
        pendingShortsRulesVoiceFinish = null;
      }
      if (duckBgmForClip) {
        restoreTimeout = setTimeout(() => {
          fadeBgm(NORMAL_VOL, 1000);
        }, 1000);
      }
      resolve();
    };
    pendingShortsRulesVoiceFinish = finish;
    if (currentVoice) {
      currentVoice.pause();
      currentVoice.currentTime = 0;
    }
    if (duckBgmForClip) {
      clearTimeout(duckingTimeout);
      clearTimeout(restoreTimeout);
      fadeBgm(DUCKED_VOL, 0);
    }
    currentVoice = new Audio(src);
    currentVoice.volume = 1;
    currentVoice.addEventListener("playing", notifyPlaybackStart, { once: true });
    currentVoice.addEventListener("ended", finish, { once: true });
    currentVoice.addEventListener(
      "error",
      () => {
        console.warn("Quiz title audio error:", src);
        notifyPlaybackStart();
        finish();
      },
      { once: true }
    );
    currentVoice.play().catch((err) => {
      console.warn("Voice play error:", err);
      notifyPlaybackStart();
      finish();
    });
  });
}

/**
 * Bundled “Game name” MP3 only (no async API). Use for Play Video on first question so the line always plays.
 */
export function playBundledQuizTitleShorts(quizType, options = {}) {
  if (!appState.isVideoPlaying) return Promise.resolve();
  if (!isShortsModeActive()) {
    return Promise.resolve();
  }
  const rel = getRulesVoicePath(quizType);
  const absSrc = toAbsoluteBundledVoiceUrl(rel);
  return playShortsQuizTitleMediaClip(absSrc, options);
}

export function playRulesShortsLanding(quizType, options = {}) {
  if (!appState.isVideoPlaying) return Promise.resolve();
  if (!document.body.classList.contains("shorts-mode")) {
    return Promise.resolve();
  }
  const onPlaybackStart =
    typeof options.onPlaybackStart === "function" ? options.onPlaybackStart : null;
  const notifyPlaybackStart = () => {
    if (onPlaybackStart) onPlaybackStart();
  };
  const playClip = (src) =>
    new Promise((resolve) => {
      const clipSrc = String(src || "").trim();
      if (!clipSrc) {
        notifyPlaybackStart();
        resolve();
        return;
      }
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (pendingShortsRulesVoiceFinish === finish) {
          pendingShortsRulesVoiceFinish = null;
        }
        resolve();
      };
      pendingShortsRulesVoiceFinish = finish;
      if (currentVoice) {
        currentVoice.pause();
        currentVoice.currentTime = 0;
      }
      currentVoice = new Audio(clipSrc);
      currentVoice.addEventListener("playing", notifyPlaybackStart, { once: true });
      currentVoice.addEventListener("ended", finish, { once: true });
      currentVoice.play().catch((err) => {
        console.warn("Voice play error:", err);
        notifyPlaybackStart();
        finish();
      });
    });
  const playFallback = () => pickExistingSrc(getRulesVoiceCandidates(quizType)).then((src) => playClip(src));
  const resolver = window.__resolveQuizTitleVoiceSrc;
  if (typeof resolver !== "function") {
    return playFallback();
  }
  return Promise.resolve(resolver(quizType))
    .then((src) => {
      const clipSrc = String(src || "").trim();
      if (clipSrc) return playClip(clipSrc);
      return playFallback();
    })
    .catch(() => playFallback());
}

export function playRules(quizType, delayMs = 1000) {
  if (!appState.isVideoPlaying) return;
  const playFallback = () => {
    playVoiceFromCandidates(getRulesVoiceCandidates(quizType), delayMs);
  };
  const resolver = window.__resolveQuizTitleVoiceSrc;
  if (typeof resolver !== "function") {
    playFallback();
    return;
  }
  Promise.resolve(resolver(quizType))
    .then((src) => {
      const clipSrc = String(src || "").trim();
      if (clipSrc) {
        playVoice(clipSrc, delayMs);
      } else {
        playFallback();
      }
    })
    .catch(() => {
      playFallback();
    });
}

export const PLAYER_NAME_VOICE_EXTS = [".mp3", ".wav", ".m4a"];

/** Phrase variants for the reveal voice. Keep in sync with run_site.py PLAYER_PHRASE_TEMPLATES.
    `team-is` is only ever picked for kind === "team"; `player-is` only for kind !== "team". */
export const PLAYER_PHRASE_KEYS = [
  "plain",
  "correct-answer",
  "right-answer",
  "and-the-answer",
  "answer-is",
  "and-its",
  "team-is",
  "player-is",
];
const TEAM_SENTENCE_PHRASE_KEYS = [
  "correct-answer",
  "right-answer",
  "and-the-answer",
  "answer-is",
  "and-its",
  "team-is",
];
const PLAYER_SENTENCE_PHRASE_KEYS = [
  "correct-answer",
  "right-answer",
  "and-the-answer",
  "answer-is",
  "and-its",
  "player-is",
];

export const PLAYER_PHRASE_TEMPLATES = {
  english: {
    "plain": "{name}",
    "correct-answer": "The correct answer is {name}",
    "right-answer": "The right answer is {name}",
    "and-the-answer": "And the answer is {name}",
    "answer-is": "Answer is {name}",
    "and-its": "And it's {name}",
    "team-is": "The team is {name}",
    "player-is": "The player is {name}",
  },
  spanish: {
    "plain": "{name}",
    "correct-answer": "La respuesta correcta es {name}",
    "right-answer": "La respuesta acertada es {name}",
    "and-the-answer": "Y la respuesta es {name}",
    "answer-is": "La respuesta es {name}",
    "and-its": "Y es {name}",
    "team-is": "El equipo es {name}",
    "player-is": "El jugador es {name}",
  },
};

/** Render the human-readable sentence shown in the voice tab and used as the TTS prompt
    in the server. Kind-agnostic — the caller picks `team-is` vs `player-is` upstream. */
export function renderTeamPhrase(phraseKey, displayName, language) {
  const lang = language === "spanish" ? "spanish" : "english";
  const map = PLAYER_PHRASE_TEMPLATES[lang] || PLAYER_PHRASE_TEMPLATES.english;
  const tpl = map[phraseKey] || map.plain || "{name}";
  return tpl.replace("{name}", String(displayName || ""));
}

export function revealPlayerVoiceDir(kind) {
  return kind === "team"
    ? "../.Storage/Voices/Team names/"
    : "../.Storage/Voices/Players Names/";
}

function playPlayerNameVoiceIfExistsInDir(displayName, delayMs, voicesDirRel, kind) {
  const base = String(displayName || "").trim();
  if (!base) return;
  void voicesDirRel;
  let i = 0;
  const tryNext = () => {
    if (i >= PLAYER_NAME_VOICE_EXTS.length) return;
    const ext = PLAYER_NAME_VOICE_EXTS[i++];
    const src = buildPlayerNameVoiceSrc(base, ext, kind);
    if (!src) {
      tryNext();
      return;
    }
    const probe = new Audio();
    let settled = false;
    const cleanup = () => {
      probe.removeEventListener("error", onErr);
      probe.removeEventListener("canplay", onOk);
      probe.removeEventListener("loadeddata", onOk);
    };
    const onErr = () => {
      if (settled) return;
      cleanup();
      tryNext();
    };
    const onOk = () => {
      if (settled) return;
      settled = true;
      cleanup();
      probe.pause();
      probe.removeAttribute("src");
      probe.load();
      playVoice(src, delayMs);
    };
    probe.addEventListener("error", onErr, { once: true });
    probe.addEventListener("canplay", onOk, { once: true });
    probe.addEventListener("loadeddata", onOk, { once: true });
    probe.src = src;
    probe.load();
  };
  tryNext();
}

export function buildPlayerNameVoiceSrc(displayName, ext = ".mp3", kind) {
  const cleanName = String(displayName || "").trim();
  if (!cleanName) return "";
  const cleanExt = String(ext || ".mp3").startsWith(".") ? String(ext || ".mp3") : `.${String(ext || "mp3")}`;
  const folder = kind === "team" ? "Team names" : "Players Names";
  return projectAssetUrl(`.Storage/Voices/${folder}/${encodeURIComponent(cleanName)}${cleanExt}`);
}

/** Build the URL for a specific (name, kind, phrase, language) cell — used by the voice tab. */
export function buildPlayerPhraseVoiceSrc(displayName, kind, phraseKey, language, ext = ".mp3") {
  const cleanName = String(displayName || "").trim();
  if (!cleanName) return "";
  const lang = language === "spanish" ? "spanish" : "english";
  const cleanExt = String(ext || ".mp3").startsWith(".") ? String(ext || ".mp3") : `.${String(ext || "mp3")}`;
  const folder = kind === "team" ? "Team names" : "Players Names";
  return projectAssetUrl(`.Storage/Voices/${folder}/${lang}/${phraseKey}/${encodeURIComponent(cleanName)}${cleanExt}`);
}

export function playPlayerNameVoiceIfExists(displayName, delayMs = 0, kind) {
  playPlayerNameVoiceIfExistsInDir(displayName, delayMs, revealPlayerVoiceDir(kind), kind);
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

/* Per-kind shuffled queues of sentence phrases. Pop one per odd-question pick so each kind
   cycles through every variant before any repeats. Both queues reset when
   `appState.levelsData` is swapped to a new array (saved-script load, level rebuild).
   `lastSentencePhrase` is tracked per-queue across refills so we can swap the first
   element of a new shuffle if it matches the last pop — prevents the same sentence
   appearing on two adjacent levels at the queue boundary. */
let sentenceQueueLevelsRef = null;
const sentenceQueues = {
  team: { queue: [], last: "" },
  player: { queue: [], last: "" },
};

function resetSentenceQueuesIfStale() {
  const ref = appState.levelsData;
  if (ref !== sentenceQueueLevelsRef) {
    sentenceQueueLevelsRef = ref;
    sentenceQueues.team.queue = [];
    sentenceQueues.team.last = "";
    sentenceQueues.player.queue = [];
    sentenceQueues.player.last = "";
  }
}

function nextSentencePhrase(kind) {
  resetSentenceQueuesIfStale();
  const isTeam = kind === "team";
  const slot = isTeam ? sentenceQueues.team : sentenceQueues.player;
  const source = isTeam ? TEAM_SENTENCE_PHRASE_KEYS : PLAYER_SENTENCE_PHRASE_KEYS;
  if (slot.queue.length === 0) {
    slot.queue = shuffleInPlace(source.slice());
    if (slot.last && slot.queue[0] === slot.last && slot.queue.length > 1) {
      const swapIdx = 1 + Math.floor(Math.random() * (slot.queue.length - 1));
      [slot.queue[0], slot.queue[swapIdx]] = [slot.queue[swapIdx], slot.queue[0]];
    }
  }
  const picked = slot.queue.shift() || "plain";
  slot.last = picked;
  return picked;
}

/** Phrase pick for one reveal slot.
    - English: odd questionIndex → sentence (from the kind-appropriate queue), even → plain.
    - Spanish: never plain — always pull a sentence so the name is never spoken alone. */
function pickRevealPhraseForQuestion(questionIndex, kind) {
  const lang = getCurrentLanguage();
  if (lang === "spanish") return nextSentencePhrase(kind);
  if (!Number.isFinite(questionIndex)) return "plain";
  if ((questionIndex % 2) === 0) return "plain";
  return nextSentencePhrase(kind);
}

/** Sticky per-level phrase pick. Stored on the level object itself so the voice tab and
    the reveal playback agree on the same phrase, and a new saved-script load (which
    replaces `levelsData` with fresh objects) re-rolls automatically. Spanish never
    accepts a "plain" cache — if the user switched language after rolling we re-pick.
    Cache key is per-kind so toggling fakeInfo quiz mode in the same level rolls
    a fresh phrase from the right queue. */
export function getOrAssignRevealPhrase(levelData, questionIndex, kind) {
  if (!levelData || typeof levelData !== "object") return "plain";
  const cacheKey = kind === "team" ? "__revealPhraseTeam" : "__revealPhrasePlayer";
  const cached = typeof levelData[cacheKey] === "string" ? levelData[cacheKey] : "";
  const lang = getCurrentLanguage();
  const cachedValidForLang = cached && !(lang === "spanish" && cached === "plain");
  if (cachedValidForLang) return cached;
  const picked = pickRevealPhraseForQuestion(questionIndex, kind);
  try { levelData[cacheKey] = picked; } catch {}
  return picked;
}

/** Build candidate URLs in priority order for a given (name, kind, phrase, language).
    Probes new layout `<dir>/<lang>/<phrase>/<Name>.ext` plus, for English plain only, the
    legacy flat `<dir>/<Name>.ext` so pre-existing clips keep working. */
function buildPhraseCandidatesForLang(cleanName, kind, language, phraseKey) {
  const out = [];
  const lang = language === "spanish" ? "spanish" : "english";
  const folder = kind === "team" ? "Team names" : "Players Names";
  for (const ext of PLAYER_NAME_VOICE_EXTS) {
    out.push(projectAssetUrl(`.Storage/Voices/${folder}/${lang}/${phraseKey}/${encodeURIComponent(cleanName)}${ext}`));
  }
  if (lang === "english" && phraseKey === "plain") {
    for (const ext of PLAYER_NAME_VOICE_EXTS) {
      out.push(projectAssetUrl(`.Storage/Voices/${folder}/${encodeURIComponent(cleanName)}${ext}`));
    }
  }
  return out;
}

/** Build the candidate chain for one reveal, given the chosen phrase. Tries the chosen
    phrase first (current language → English), then falls through to plain so playback
    never goes silent when the user hasn't generated the sentence clip yet. */
function buildRevealCandidates(displayName, kind, phraseKey) {
  const base = String(displayName || "").trim();
  if (!base) return [];
  const lang = getCurrentLanguage();
  const phrase = phraseKey || "plain";
  const out = [];
  if (phrase !== "plain") {
    if (lang === "spanish") out.push(...buildPhraseCandidatesForLang(base, kind, "spanish", phrase));
    out.push(...buildPhraseCandidatesForLang(base, kind, "english", phrase));
  }
  if (lang === "spanish") out.push(...buildPhraseCandidatesForLang(base, kind, "spanish", "plain"));
  out.push(...buildPhraseCandidatesForLang(base, kind, "english", "plain"));
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
    let settled = false;
    const cleanup = () => {
      probe.removeEventListener("error", onErr);
      probe.removeEventListener("canplay", onOk);
      probe.removeEventListener("loadeddata", onOk);
    };
    const onErr = () => { if (settled) return; cleanup(); tryNext(); };
    const onOk = () => {
      if (settled) return;
      settled = true;
      cleanup();
      probe.pause(); probe.removeAttribute("src"); probe.load();
      playVoice(src, delayMs);
    };
    probe.addEventListener("error", onErr, { once: true });
    probe.addEventListener("canplay", onOk, { once: true });
    probe.addEventListener("loadeddata", onOk, { once: true });
    probe.src = src;
    probe.load();
  };
  tryNext();
}

export function playTheAnswerIs(includeVoice = true, playerDisplayName = "", kind, phraseKey = "plain") {
  const dongAudio = new Audio(paths.dong);
  dongAudio.play().catch(err => console.warn("Dong play error:", err));

  setTimeout(() => {
    const revealStinger = new Audio(paths.revealStinger);
    revealStinger.volume = 0.5;
    revealStinger.play().catch((err) => console.warn("Reveal stinger play error:", err));
  }, 150);

  if (includeVoice && appState.isVideoPlaying) {
    // Reveal uses player/team name clip — phrase-aware with English plain fallback.
    const candidates = buildRevealCandidates(playerDisplayName, kind, phraseKey);
    playFirstExistingClip(candidates, 150);
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
  if (document.body.classList.contains("shorts-mode")) return;
  clearTimeout(progressTimeout);
  
  const questionIndex = levelIndex;
  const totalQuestions = totalLevelsCount - 2; // Minus Logo, Outro

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