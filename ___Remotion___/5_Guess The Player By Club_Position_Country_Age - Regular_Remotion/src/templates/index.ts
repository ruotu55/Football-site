// Registry of the 5 hidden-player templates. Drives both the schema enum
// (dropdown on the main composition) and the per-template preview compositions.
import type { TemplateComponent } from "./common";
import { FutGoldCard } from "./FutGoldCard";
import { ScoutDossier } from "./ScoutDossier";
import { BroadcastHud } from "./BroadcastHud";
import { HoloVault } from "./HoloVault";
import { StadiumSpotlight } from "./StadiumSpotlight";
import { FlipCards } from "./FlipCards";
import { SplitFlapBoard } from "./SplitFlapBoard";
import { DealtDeck } from "./DealtDeck";
import { OrbitBadges } from "./OrbitBadges";
import { CubeTumble } from "./CubeTumble";
import { ComicPop } from "./ComicPop";
import { SynthwaveArcade } from "./SynthwaveArcade";
import { NewspaperBackPage } from "./NewspaperBackPage";
import { TaleOfTheTape } from "./TaleOfTheTape";
import { PackRip } from "./PackRip";
import { TacticsChalkboard } from "./TacticsChalkboard";
import { SlotMachine } from "./SlotMachine";
import { ShatterReveal } from "./ShatterReveal";
import { VaultDoor } from "./VaultDoor";
import { LiquidBlobs } from "./LiquidBlobs";

export type TemplateId =
  | "fut-gold"
  | "scout-dossier"
  | "broadcast-hud"
  | "holo-vault"
  | "stadium-spotlight"
  | "flip-cards"
  | "split-flap"
  | "dealt-deck"
  | "orbit-badges"
  | "cube-tumble"
  | "comic-pop"
  | "synthwave-arcade"
  | "newspaper"
  | "tale-of-the-tape"
  | "pack-rip"
  | "tactics-chalkboard"
  | "slot-machine"
  | "shatter"
  | "vault-door"
  | "liquid-blobs";

// Templates 1–5 use a contained portrait inside their object (card/capsule).
// Templates 6–10 (added per user request) use the BIG full-body hero photo
// (shared HeroPlayer) with the focus on the animated clue OBJECTS, minimal ambient.
export const TEMPLATES: Record<TemplateId, { label: string; component: TemplateComponent }> = {
  "fut-gold": { label: "FUT Gold Card", component: FutGoldCard },
  "scout-dossier": { label: "Scout Dossier", component: ScoutDossier },
  "broadcast-hud": { label: "Broadcast HUD", component: BroadcastHud },
  "holo-vault": { label: "Holo Vault", component: HoloVault },
  "stadium-spotlight": { label: "Stadium Spotlight", component: StadiumSpotlight },
  "flip-cards": { label: "Flip Cards", component: FlipCards },
  "split-flap": { label: "Split-Flap Board", component: SplitFlapBoard },
  "dealt-deck": { label: "Dealt Deck", component: DealtDeck },
  "orbit-badges": { label: "Orbit Badges", component: OrbitBadges },
  "cube-tumble": { label: "Cube Tumble", component: CubeTumble },
  "comic-pop": { label: "Comic Pop", component: ComicPop },
  "synthwave-arcade": { label: "Synthwave Arcade", component: SynthwaveArcade },
  "newspaper": { label: "Newspaper Back-Page", component: NewspaperBackPage },
  "tale-of-the-tape": { label: "Tale Of The Tape", component: TaleOfTheTape },
  "pack-rip": { label: "Pack Rip", component: PackRip },
  "tactics-chalkboard": { label: "Tactics Chalkboard", component: TacticsChalkboard },
  "slot-machine": { label: "Slot Machine", component: SlotMachine },
  "shatter": { label: "Shatter Reveal", component: ShatterReveal },
  "vault-door": { label: "Vault Door", component: VaultDoor },
  "liquid-blobs": { label: "Liquid Blobs", component: LiquidBlobs },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

// Default template used by the full video until the user picks a favourite.
export const DEFAULT_TEMPLATE: TemplateId = "fut-gold";

export const getTemplate = (id: string): TemplateComponent =>
  (TEMPLATES[id as TemplateId] ?? TEMPLATES[DEFAULT_TEMPLATE]).component;
