// Shared prop/types contract for the parameterized scenes + audio manifest.
// Every per-runner project imports these so the intro/outro/audio stay identical.
import type { Language } from "./paths";

export type { Language };

/** Strings shown on the shared Intro shell (title/season/badge). One set per language. */
export type IntroStrings = {
  /** The big title, split into lines (each line rendered on its own row). */
  titleLines: string[];
  /** e.g. "2025/6 SEASON" / "TEMPORADA 2025/6". */
  season: string;
  /** Questions-ticket label, e.g. "QUESTIONS" / "PREGUNTAS". */
  questions: string;
  /** Bonus word, e.g. "BONUS". */
  bonus: string;
};

export type IntroStringsByLanguage = Record<Language, IntroStrings>;

/** Shape of each runner's generated audio.json (built by build-data). */
export type AudioManifest = {
  bgm: string | null;
  ticking: string | null;
  stinger: string | null;
  quizTitle: Record<"english" | "spanish", string | null>;
  quizTitleDurationSec?: Record<string, number | null>;
  ending: Record<"english" | "spanish", Record<EndingManifestKey, string | null>>;
  endingDurationSec?: Record<string, Record<string, number | null>>;
};

type EndingManifestKey = "think-you-know" | "how-many";
