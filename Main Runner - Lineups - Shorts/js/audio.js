import { appState } from "./state.js";

const paths = {
  welcome: "./Voices/Welcome/Welcome to the football lab, lets start!!!.mp3?v=2",
  guessNat: "./Voices/Game name/Guess the football team name by players' nationality !!!.mp3",
  guessClub: "./Voices/Game name/Guess the football national team name by players' club !!!.mp3",
  warmUp: "./Voices/Levels/Worm up round dont mess this one .mp3",
  serious: "./Voices/Levels/OK now it's getting serious.mp3",
  nerds: "./Voices/Levels/Only true football nerd know this!!!.mp3",
  genius: "./Voices/Levels/If you get this you are basically a genius!!!.mp3",
  bgmPlaylist: [
    "./Voices/Ringhton/viacheslavstarostin-upbeat-fun-music-427230.mp3",
    "./Voices/Ringhton/nesterouk-fun-evening-145960.mp3",
    "./Voices/Ringhton/paulyudin-fun-fun-fun-fun-fun-152388.mp3",
    "./Voices/Ringhton/paulyudin-fun-morning-198120.mp3",
    "./Voices/Ringhton/sunsides-summer-funny-fun-204398.mp3",
    "./Voices/Ringhton/universfield-bright-piano-fun-270899.mp3",
    "./Voices/Ringhton/backgroundmusicmaster-quiz-master-382651.mp3",
    "./Voices/Ringhton/nra-lab-ukulele-fun-acoustic-background-happy-strings-221183.mp3",
    "./Voices/Ringhton/tunetank-fun-funk-music-412727.mp3"
  ],
  theAnswerIs: "./Voices/the answer is/The answer is.mp3",
  dong: "./Voices/the answer is/dong.wav",
  commentBelow: "./Voices/Ending Guess/Think you know the answer? let us know in the comments!!! Dont forget to like and subscribe .mp3",
  ticking: "./Voices/Ticking sound/ticking sound.mp3"
};

let bgMusic = null;
let currentBgmIndex = 0;
let currentVoice = null;
/** Transport for question countdown: short MP3s often fail to `loop` reliably; we retrigger on an interval. */
let tickingReplayTimer = null;
let tickingActive = false;
let tickingVolumeMuted = true;

// Timeouts and Intervals for fading
let fadeInterval = null;
let duckingTimeout = null;
let restoreTimeout = null;
let progressTimeout = null;

const NORMAL_VOL = 0.4; // Dropped from 0.3 to make it quieter
const DUCKED_VOL = 0.2; // 50% of normal volume

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

function playNextBgm() {
  if (bgMusic) {
    bgMusic.pause();
    bgMusic.removeEventListener('ended', playNextBgm);
  }
  currentBgmIndex = (currentBgmIndex + 1) % paths.bgmPlaylist.length;
  bgMusic = new Audio(paths.bgmPlaylist[currentBgmIndex]);
  bgMusic.volume = NORMAL_VOL; 
  bgMusic.addEventListener('ended', playNextBgm);
  bgMusic.play().catch(err => console.warn("BGM play error:", err));
}

export function startBgMusic() {
  if (bgMusic) {
    bgMusic.pause();
    bgMusic.removeEventListener('ended', playNextBgm);
  }
  // Start with a random song from the list
  currentBgmIndex = Math.floor(Math.random() * paths.bgmPlaylist.length);
  bgMusic = new Audio(paths.bgmPlaylist[currentBgmIndex]);
  bgMusic.volume = NORMAL_VOL;
  bgMusic.addEventListener('ended', playNextBgm);
  bgMusic.play().catch(err => console.warn("BGM play error:", err));
}

export function stopAllAudio() {
  clearTimeout(duckingTimeout);
  clearTimeout(restoreTimeout);
  clearTimeout(progressTimeout);
  clearInterval(fadeInterval);
  
  if (bgMusic) {
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

const TICKING_VOLUME = 1;
/** Space between tick clip replays (clip is short; interval avoids overlap and survives broken `loop`). */
const TICK_CLIP_INTERVAL_MS = 450;

function spawnTickClip() {
  if (!tickingActive) return;
  const clip = new Audio(paths.ticking);
  clip.volume = tickingVolumeMuted ? 0 : TICKING_VOLUME;
  clip.play().catch((err) => console.warn("Ticking play error:", err));
}

/** @param {boolean} [startMuted] If true, volume 0 until setTickingAudible(true). */
export function playTicking(startMuted = false) {
  stopTicking();
  tickingActive = true;
  tickingVolumeMuted = startMuted;
  spawnTickClip();
  tickingReplayTimer = setInterval(spawnTickClip, TICK_CLIP_INTERVAL_MS);
}

export function setTickingAudible(audible) {
  tickingVolumeMuted = !audible;
  if (audible && tickingActive) {
    spawnTickClip();
  }
}

export function stopTicking() {
  tickingActive = false;
  if (tickingReplayTimer) {
    clearInterval(tickingReplayTimer);
    tickingReplayTimer = null;
  }
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

export function playRules(quizType) {
  if (quizType === "club-by-nat") {
    playVoice(paths.guessNat, 1000);
  } else {
    playVoice(paths.guessClub, 1000);
  }
}

export function playTheAnswerIs(includeVoice = true) {
  const dongAudio = new Audio(paths.dong);
  dongAudio.play().catch(err => console.warn("Dong play error:", err));
  
  if (includeVoice) {
    // Dong plays immediately. Meanwhile, BGM fades down for 0.5s, then the voice plays.
    playVoice(paths.theAnswerIs, 100);
  }
}

export function playCommentBelow() {
  // Removed the dong sound here so it doesn't interrupt the transition.
  // Delay is strictly set to 600ms to perfectly match the length of the 
  // CSS page drop transition (`stage-enter-anim`)
  playVoice(paths.commentBelow, 600);
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