import { staticFile } from "remotion";

// All assets resolve from the shared junction (public/shared -> repo Images).
export type Language = "English" | "Spanish";

export const logoSrc = (lang: Language) =>
  staticFile(`Logo/Football Quiz Logo ${lang === "Spanish" ? "Spanish" : "English"}.png`);

export const likeSrc = () => staticFile("Emojis/like.png");
export const subscribeSrc = () => staticFile("Emojis/Subscribe.png");

// Floating-emojis effect (runner EMOJI_IMAGES).
export const EMOJI_FILES = [
  "active-character-dribbling-removebg-preview.png",
  "positive-character-with-ball-removebg-preview.png",
  "round-characters-playing-football-removebg-preview.png",
  "_Pngtree_soccer_ball_in_goal_net_3581900-removebg-preview.png",
  "5842fe18a6515b1e0ad75b3d-removebg-preview.png",
  "5842fe21a6515b1e0ad75b3e-removebg-preview.png",
  "_Pngtree_mens_sports_red_football_shoes_9097428-removebg-preview.png",
];
export const emojiSrc = (i: number) =>
  staticFile(`Emojis/${EMOJI_FILES[i % EMOJI_FILES.length]}`);

// A team crest / player photo / flag stored as a "shared/..." path → staticFile.
export const sharedSrc = (p: string | null) => (p ? staticFile(p) : null);
