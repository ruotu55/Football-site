export interface RemotionPlayer {
  name?: string; club?: string; nationality?: string; league?: string;
  country?: string; position?: string;
  [k: string]: unknown;
}
export interface RemotionSquad {
  name?: string; imagePath?: string;
  players?: RemotionPlayer[];
  goalkeepers?: RemotionPlayer[]; defenders?: RemotionPlayer[];
  midfielders?: RemotionPlayer[]; attackers?: RemotionPlayer[];
  [k: string]: unknown;
}
export interface RemotionLevel {
  isLogo: boolean; isIntro: boolean; isOutro: boolean; isBonus: boolean;
  squadType?: string; displayMode?: string; formationId?: string; videoMode?: boolean;
  currentSquad: RemotionSquad | null;
  slotPhotoIndexBySlot: Record<string, number>;
  slotFlagScales: number[];
  slotTeamLogoScales: number[];
  slotClubCrestOverrideRelPathBySlot: Record<string, string>;
  headerLogoScale: number; headerLogoNudgeX: number;
  headerLogoOverrideRelPath: string | null;
  selectedEntry: { name?: string; country?: string; league?: string; region?: string } | null;
  __revealPhraseByLanguage: Record<string, string> | null;
  // Optional fields filled by the question-level fixture / real flow:
  teamName?: string;
  headerLogoRel?: string;
  /** Team-header country flag (club → selectedEntry.country; national → squad name).
   *  flagcdn URL or repo-relative "Images/Nationality/Europe/England.png". Empty = hide. */
  headerFlagRel?: string;
  slots?: Array<{ name: string; frontRel: string; photoRel: string }>;
  // Optional audio voice paths (Phase 5.3 / real capture Phase 6.1):
  revealVoiceRel?: string;
  progressVoiceRel?: string;
}
export interface BgTheme {
  css: string;
  colorAttr: string;
  effectAttr: string;
  bgStage: string;
  lineOpacity: string;
  effectOpacity: string;
  particlesHtml: string[];
  computed?: {
    backgroundImage: string; backgroundColor: string;
    backgroundSize: string; backgroundRepeat: string; backgroundPosition: string;
  } | null;
}

export interface RemotionProps {
  script: string;
  totalLevelsCount: number;
  questionCount: number;
  bgmSongs: string[];
  bundledVoiceVariants: Record<string, number> | null;
  endingType: "think-you-know" | "how-many";
  transitionEffect: string;
  quizType?: string;
  levels: RemotionLevel[];
  // injected by the server:
  width: number; height: number; fps: number;
  language: "english" | "spanish";
  assetBase: string;
  // Injected by calculateMetadata after probing the outro voice audio duration.
  outroVoiceMs?: number;
  // Probed real durations for all named voices (ms). Keys: rules, ending, reveal, warmUp, serious, nerds, genius.
  voiceDurationsMs?: Record<string, number>;
  // Live-captured background theme from the app (palette OR competition).
  bgTheme?: BgTheme | null;
  // Studio background controls (schema-driven). "__captured__" = keep bgTheme as-is
  // (the default for real renders). A COLOR id or "comp-<id>" overrides it live.
  backgroundColor?: string;
  backgroundEffect?: string;
  backgroundOpacity?: number;
}
