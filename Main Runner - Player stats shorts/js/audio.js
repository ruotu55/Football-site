const paths = {
  welcome: "../Voices/Welcome/Welcome to the football lab, lets start!!!.mp3?v=2",
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
/** Single ticking track for countdown red phase (no overlapping clips). */
let tickingAudioEl = null;

// Timeouts and Intervals for fading
let fadeInterval = null;
let duckingTimeout = null;
let restoreTimeout = null;
let progressTimeout = null;
let bgmCrossfadeInterval = null;
let isBgmCrossfading = false;

const NORMAL_VOL = 0.4; // Dropped from 0.3 to make it quieter
const DUCKED_VOL = 0.2; // 50% of normal volume
const BGM_CROSSFADE_MS = 3000;
const BGM_CROSSFADE_BUFFER_S = 0.15;

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
  bgMusic.volume = NORMAL_VOL;
  bindBgmEventHandlers(bgMusic);
  bgMusic.play().catch(err => console.warn("BGM play error:", err));
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
    bgMusic.volume = NORMAL_VOL; // Reset volume
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

export function playWelcome() {
  if (document.body.classList.contains("shorts-mode")) return;
  // Half-second lead-in before welcome; BGM ducks over the same window (playVoice / fadeBgm).
  playVoice(paths.welcome, 500);
}

/** Shorts landing: welcome only over BGM (no duck); resolves when the clip ends. Pre-delay lives in video.js. */
export function playWelcomeShortsLanding() {
  if (!document.body.classList.contains("shorts-mode")) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (currentVoice) {
      currentVoice.pause();
      currentVoice.currentTime = 0;
    }
    currentVoice = new Audio(paths.welcome);
    currentVoice.addEventListener(
      "ended",
      () => {
        resolve();
      },
      { once: true }
    );
    currentVoice.play().catch((err) => {
      console.warn("Voice play error:", err);
      resolve();
    });
  });
}

/** Shorts: play quiz-title clip with onPlaybackStart callback; resolves when clip ends. */
export function playRulesShortsLanding(quizType, options = {}) {
  if (!document.body.classList.contains("shorts-mode")) {
    return Promise.resolve();
  }
  const onPlaybackStart =
    typeof options.onPlaybackStart === "function" ? options.onPlaybackStart : null;
  const src =
    quizType === "player-by-career" || quizType === "player-by-career-stats"
      ? paths.guessCareer
      : quizType === "club-by-nat"
        ? paths.guessNat
        : paths.guessClub;
  return new Promise((resolve) => {
    if (currentVoice) {
      currentVoice.pause();
      currentVoice.currentTime = 0;
    }
    currentVoice = new Audio(src);
    currentVoice.volume = 1;
    if (onPlaybackStart) {
      currentVoice.addEventListener("playing", () => onPlaybackStart(), { once: true });
    }
    currentVoice.addEventListener("ended", () => resolve(), { once: true });
    currentVoice.addEventListener("error", () => {
      if (onPlaybackStart) onPlaybackStart();
      resolve();
    }, { once: true });
    currentVoice.play().catch((err) => {
      console.warn("Voice play error:", err);
      if (onPlaybackStart) onPlaybackStart();
      resolve();
    });
  });
}

export function playRules(quizType) {
  if (quizType === "player-by-career" || quizType === "player-by-career-stats") {
    playVoice(paths.guessCareer, 1000);
  } else if (quizType === "club-by-nat") {
    playVoice(paths.guessNat, 1000);
  } else {
    playVoice(paths.guessClub, 1000);
  }
}

export function playTheAnswerIs(includeVoice = true) {
  const dongAudio = new Audio(paths.dong);
  dongAudio.play().catch(err => console.warn("Dong play error:", err));
  void includeVoice;
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
  if (document.body.classList.contains("shorts-mode")) return;
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