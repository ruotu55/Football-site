import { appState } from "./state.js";

const paths = {
  guessNat: "../Voices/Game name/Guess the football team name by players' nationality !!!.mp3",
  guessClub: "../Voices/Game name/Guess the football national team name by players' club !!!.mp3",
  guessCareer: "../Voices/Game name/Guess the football player by career path !!!.mp3",
  warmUp: "../Voices/Levels/Worm up round dont mess this one .mp3",
  serious: "../Voices/Levels/OK now it's getting serious.mp3",
  nerds: "../Voices/Levels/Only true football nerd know this!!!.mp3",
  genius: "../Voices/Levels/If you get this you are basically a genius!!!.mp3",
  bgmPlaylist: [
    "../Voices/Ringhton/Balada Gitana - House of the Gipsies.mp3",
    "../Voices/Ringhton/Chica Linda - Quincas Moreira.mp3",
    "../Voices/Ringhton/Delta - TrackTribe.mp3",
    "../Voices/Ringhton/Los Cabos - House of the Gipsies.mp3",
    "../Voices/Ringhton/Orquidario - Quincas Moreira.mp3",
    "../Voices/Ringhton/Swing Haven 1 - Los Angeles - Reed Mathis.mp3",
    "../Voices/Ringhton/Swing Haven 2 - St. Louis - Reed Mathis.mp3",
    "../Voices/Ringhton/Swing Haven 6 - New Orleans - Reed Mathis.mp3",
    "../Voices/Ringhton/Up And At Em - Nathan Moore.mp3"
  ],
  dong: "../Voices/the answer is/dong.wav",
  commentBelow: "../Voices/Ending Guess/Think you know the answer_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
  commentBelowLegacy: "../Voices/Ending Guess/Think you know the answer? let us know in the comments!!! Dont forget to like and subscribe .mp3",
  commentBelowEncodedQ: "../Voices/Ending Guess/Think you know the answer%3F let us know in the comments!!! Dont forget to like and subscribe .mp3",
  ticking: "../Voices/Ticking sound/ticking sound.mp3"
};

let bgMusic = null;
let currentBgmIndex = 0;
let currentVoice = null;
let tickingAudio = null;

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

  // 2. Play the voice after the delay finishes
  duckingTimeout = setTimeout(() => {
    currentVoice = new Audio(src);
    currentVoice.play().catch(err => console.warn("Voice play error:", err));
    
    // 3. When voice finishes, wait 1s, then smoothly fade back up
    currentVoice.addEventListener('ended', () => {
      restoreTimeout = setTimeout(() => {
        fadeBgm(NORMAL_VOL, 1000); // fade up smoothly over 1s
      }, 1000); // wait 1s after voice ends
    });
  }, delayMs);
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

export function playRules(quizType, delayMs = 1000) {
  const playFallback = () => {
    if (quizType === "club-by-nat") {
      playVoice(paths.guessNat, delayMs);
    } else if (quizType === "nat-by-club") {
      playVoice(paths.guessClub, delayMs);
    } else if (quizType === "player-by-career" || quizType === "player-by-career-stats") {
      // Career quiz types use the career game-name voice clip.
      playVoice(paths.guessCareer, delayMs);
    } else {
      playVoice(paths.guessNat, delayMs);
    }
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

export function revealPlayerVoiceDir() {
  return "../Voices/Players Names/";
}

function playPlayerNameVoiceIfExistsInDir(displayName, delayMs, voicesDirRel) {
  const base = String(displayName || "").trim();
  if (!base) return;
  const dir = String(voicesDirRel || "").replace(/\/?$/, "/");
  let i = 0;
  const tryNext = () => {
    if (i >= PLAYER_NAME_VOICE_EXTS.length) return;
    const ext = PLAYER_NAME_VOICE_EXTS[i++];
    const src = `${dir}${encodeURIComponent(base)}${ext}`;
    const probe = new Audio();
    const cleanup = () => {
      probe.removeEventListener("error", onErr);
      probe.removeEventListener("canplay", onOk);
    };
    const onErr = () => {
      cleanup();
      tryNext();
    };
    const onOk = () => {
      cleanup();
      probe.pause();
      probe.removeAttribute("src");
      probe.load();
      playVoice(src, delayMs);
    };
    probe.addEventListener("error", onErr, { once: true });
    probe.addEventListener("canplay", onOk, { once: true });
    probe.src = src;
    probe.load();
  };
  tryNext();
}

export function buildPlayerNameVoiceSrc(displayName, ext = ".mp3") {
  const cleanName = String(displayName || "").trim();
  if (!cleanName) return "";
  const cleanExt = String(ext || ".mp3").startsWith(".") ? String(ext || ".mp3") : `.${String(ext || "mp3")}`;
  return `${revealPlayerVoiceDir()}${encodeURIComponent(cleanName)}${cleanExt}`;
}

export function playPlayerNameVoiceIfExists(displayName, delayMs = 0) {
  playPlayerNameVoiceIfExistsInDir(displayName, delayMs, revealPlayerVoiceDir());
}

export function playTheAnswerIs(includeVoice = true, playerDisplayName = "") {
  const dongAudio = new Audio(paths.dong);
  dongAudio.play().catch(err => console.warn("Dong play error:", err));
  
  if (includeVoice) {
    // Reveal uses player name clip only.
    playPlayerNameVoiceIfExistsInDir(playerDisplayName, 100, revealPlayerVoiceDir());
  }
}

export function playCommentBelow() {
  // Removed the dong sound here so it doesn't interrupt the transition.
  // Delay is set to 100ms so it starts 0.5s earlier than before.
  // CSS page drop transition (`stage-enter-anim`).
  const candidates = [paths.commentBelow, paths.commentBelowLegacy, paths.commentBelowEncodedQ];
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) return;
    const src = candidates[i++];
    const probe = new Audio();
    const cleanup = () => {
      probe.removeEventListener("error", onErr);
      probe.removeEventListener("canplay", onOk);
    };
    const onErr = () => {
      cleanup();
      tryNext();
    };
    const onOk = () => {
      cleanup();
      probe.pause();
      probe.removeAttribute("src");
      probe.load();
      playVoice(src, 100);
    };
    probe.addEventListener("error", onErr, { once: true });
    probe.addEventListener("canplay", onOk, { once: true });
    probe.src = src;
    probe.load();
  };
  tryNext();
}

export function playProgressVoice(levelIndex, totalLevelsCount) {
  clearTimeout(progressTimeout);
  
  const questionIndex = levelIndex - 1; 
  const totalQuestions = totalLevelsCount - 3; // Minus Logo, Landing, Outro

  if (questionIndex === 1) {
    playVoice(paths.warmUp, 1000);
    return;
  }

  const target30 = Math.max(2, Math.round(totalQuestions * 0.3));
  const target60 = Math.max(2, Math.round(totalQuestions * 0.6));
  const target90 = Math.max(2, Math.round(totalQuestions * 0.9));

  if (questionIndex === target30) {
    playVoice(paths.serious, 1000);
  } else if (questionIndex === target60) {
    playVoice(paths.nerds, 1000);
  } else if (questionIndex === target90) {
    playVoice(paths.genius, 1000);
  }
}