/**
 * AudioTimeline (Phase 5.3) — renders all audio layers for the composition:
 *   1. BGM: up to 5 songs played sequentially, ducked via bgmVolumeAtFrame.
 *   2. Per-question ticking, stinger, reveal voice, progress voice.
 *   3. Rules (quiz title) voice on LOGO phase.
 *   4. Ending voice on OUTRO phase.
 *
 * Voice file paths for reveal/progress are optional (Phase 6.1 real capture);
 * if absent, the ducking windows are still registered so BGM ducks correctly.
 *
 * ESTIMATED voice durations (reconciled vs __audioTap manifest in Phase 6.2):
 */

// Estimated durations (ms) — NAMED constants, clearly marked as estimates.
// Reconciled vs __audioTap manifest in Phase 6.2.
const EST_RULES_MS    = 3000; // estimate: quiz-title voice duration
const EST_REVEAL_MS   = 1500; // estimate: reveal team-name voice duration
const EST_PROGRESS_MS = 2000; // estimate: progress voice (warmUp/serious/nerds/genius) duration
const EST_ENDING_MS   = 4000; // estimate: ending voice duration

import React, { useMemo } from "react";
import { Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { Timeline, Phase } from "../timeline";
import { msToFrames, progressVoiceForQuestion } from "../timeline";
import type { RemotionProps } from "../props";
import { assetUrl } from "../assets";
import { quizTitleRelPath, endingVoiceRelPath, TICKING_REL, REVEAL_STINGER_REL } from "./voicePaths";
import { resolveBgmRelPaths } from "./bgmPlaylist";
import { bgmVolumeAtFrame, type VoiceWindow } from "./envelopes";
import { MS } from "../timeline";

// ─── BGM Song Player ────────────────────────────────────────────────────────
// Each song has a start frame (global) and a crossfade duration.
// We play them sequentially, overlapping by crossfadeFrames for a linear
// fade-out/fade-in. The duck envelope is applied on top of the crossfade gain.

interface BgmSongLayerProps {
  src: string;
  /** Global frame at which this song's Sequence begins (including crossfade overlap). */
  startFrame: number;
  /** Total frames allocated to this Sequence slot. */
  durationFrames: number;
  /** Crossfade frames that overlap with the PREVIOUS song (fade-in from 0). */
  fadeInFrames: number;
  /** Crossfade frames that overlap with the NEXT song (fade-out to 0).
   *  0 if this is the last song. */
  fadeOutFrames: number;
  /** All duck windows for the whole composition (passed down for global frame math). */
  voiceWindows: VoiceWindow[];
  fps: number;
}

const BgmSongLayer: React.FC<BgmSongLayerProps> = ({
  src, durationFrames, fadeInFrames, fadeOutFrames, startFrame, voiceWindows, fps,
}) => {
  const localFrame = useCurrentFrame(); // local to THIS song's Sequence

  const volume = useMemo(() => (localF: number) => {
    const globalFrame = startFrame + localF;

    // Crossfade gain: fade in from 0 → 1 over fadeInFrames, fade out 1 → 0 over last fadeOutFrames.
    let crossfadeGain = 1.0;
    if (fadeInFrames > 0 && localF < fadeInFrames) {
      crossfadeGain = Math.min(crossfadeGain, localF / fadeInFrames);
    }
    const framesFromEnd = durationFrames - localF;
    if (fadeOutFrames > 0 && framesFromEnd < fadeOutFrames) {
      crossfadeGain = Math.min(crossfadeGain, Math.max(0, framesFromEnd / fadeOutFrames));
    }

    // Duck envelope (global frame).
    const duckGain = bgmVolumeAtFrame(globalFrame, voiceWindows, fps);

    return crossfadeGain * duckGain;
  }, [startFrame, durationFrames, fadeInFrames, fadeOutFrames, voiceWindows, fps]);

  // Suppress unused variable warning — volume callback uses localFrame via closure.
  void localFrame;

  return <Audio src={src} volume={volume} />;
};

// ─── Main AudioTimeline Component ───────────────────────────────────────────

interface AudioTimelineProps {
  timeline: Timeline;
  props: RemotionProps;
}

export const AudioTimeline: React.FC<AudioTimelineProps> = ({ timeline, props }) => {
  const { fps } = useVideoConfig();

  // ── 1. Resolve BGM songs ──────────────────────────────────────────────────
  const bgmRelPaths = resolveBgmRelPaths(props.bgmSongs ?? []);

  // ── 2. Find phase references ──────────────────────────────────────────────
  const logoPhase  = timeline.phases.find((p) => p.kind === "logo");
  const outroPhase = timeline.phases.find((p) => p.kind === "outro");
  const questionPhases = timeline.phases.filter((p) => p.kind === "question");

  // ── 3. Build voice windows for BGM ducking ────────────────────────────────
  const voiceWindows: VoiceWindow[] = useMemo(() => {
    const wins: VoiceWindow[] = [];

    // Rules / quiz-title voice (logo phase + LOGO_VOICE_DELAY offset, no delay ramp).
    if (logoPhase) {
      const duckStart = logoPhase.startFrame + msToFrames(MS.LOGO_VOICE_DELAY, fps);
      wins.push({
        duckStartFrame: duckStart,
        delayFrames: 0,
        voiceEndFrame: duckStart + msToFrames(EST_RULES_MS, fps),
      });
    }

    // Per-question voices.
    questionPhases.forEach((phase, phaseIdx) => {
      // app questionIndex = phase.index + 1 (phase.index is 0-based question index).
      const questionIndex = phase.index + 1;

      // Progress voice (fires near question start).
      const progressKey = progressVoiceForQuestion(questionIndex, props.questionCount);
      if (progressKey !== null) {
        const duckStart = phase.startFrame + msToFrames(MS.PROGRESS_VOICE_DELAY, fps);
        wins.push({
          duckStartFrame: duckStart,
          delayFrames: msToFrames(MS.PROGRESS_VOICE_DELAY, fps),
          voiceEndFrame: duckStart + msToFrames(MS.PROGRESS_VOICE_DELAY, fps) + msToFrames(EST_PROGRESS_MS, fps),
        });
      }

      // Reveal team-name voice (at revealMs, delay 600ms).
      if (!phase.skipReveal && phase.cues) {
        const duckStart = phase.startFrame + msToFrames(phase.cues.revealMs, fps);
        wins.push({
          duckStartFrame: duckStart,
          delayFrames: msToFrames(MS.REVEAL_VOICE_DELAY, fps),
          voiceEndFrame: duckStart + msToFrames(MS.REVEAL_VOICE_DELAY, fps) + msToFrames(EST_REVEAL_MS, fps),
        });
      }
    });

    // Ending voice (outro phase + 100ms).
    if (outroPhase) {
      const duckStart = outroPhase.startFrame + msToFrames(100, fps);
      wins.push({
        duckStartFrame: duckStart,
        delayFrames: 0,
        voiceEndFrame: duckStart + msToFrames(EST_ENDING_MS, fps),
      });
    }

    // Sort chronologically for chain detection.
    return wins.sort((a, b) => a.duckStartFrame - b.duckStartFrame);
  }, [timeline, fps, props.questionCount]);

  // ── 4. Lay out BGM song sequences ─────────────────────────────────────────
  // Songs play sequentially from frame 0, each overlapping the next by crossfadeFrames.
  // Duration estimate per song: spread the whole composition across the available songs.
  const totalFrames = timeline.totalDurationFrames;
  const crossfadeFrames = msToFrames(BGM_CROSSFADE_MS_LOCAL, fps);
  const songCount = bgmRelPaths.length;

  // Distribute: if we have 5 songs and totalFrames = T, each song gets T/5 frames
  // of "clean" content, plus crossfade overlaps with neighbours.
  const cleanFramesPerSong = Math.ceil(totalFrames / Math.max(1, songCount));

  // Build song slot boundaries.
  interface SongSlot {
    src: string;
    startFrame: number;
    durationFrames: number;
    fadeInFrames: number;
    fadeOutFrames: number;
  }
  const songSlots: SongSlot[] = [];
  let cursor = 0;
  for (let i = 0; i < songCount; i++) {
    const isFirst = i === 0;
    const isLast  = i === songCount - 1;
    const fadeIn  = isFirst ? 0 : crossfadeFrames;
    const fadeOut = isLast  ? 0 : crossfadeFrames;

    // Start = cursor (overlapping the previous song's fade-out).
    const startFrame = Math.max(0, cursor - (isFirst ? 0 : crossfadeFrames));
    // Duration = clean segment + fade-in + fade-out (capped at totalFrames).
    const rawEnd = cursor + cleanFramesPerSong + (isLast ? 0 : crossfadeFrames);
    const endFrame = isLast ? totalFrames : Math.min(rawEnd, totalFrames);
    const durationFrames = Math.max(1, endFrame - startFrame);

    songSlots.push({
      src: assetUrl(bgmRelPaths[i], props.assetBase),
      startFrame,
      durationFrames,
      fadeInFrames: fadeIn,
      fadeOutFrames: fadeOut,
    });
    cursor += cleanFramesPerSong;
  }

  // ── 5. Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* BGM layers */}
      {songSlots.map((slot, i) => (
        <Sequence
          key={`bgm-${i}`}
          from={slot.startFrame}
          durationInFrames={slot.durationFrames}
          name={`BGM ${i + 1}`}
        >
          <BgmSongLayer
            src={slot.src}
            startFrame={slot.startFrame}
            durationFrames={slot.durationFrames}
            fadeInFrames={slot.fadeInFrames}
            fadeOutFrames={slot.fadeOutFrames}
            voiceWindows={voiceWindows}
            fps={fps}
          />
        </Sequence>
      ))}

      {/* Per-question audio layers */}
      {questionPhases.map((phase) => {
        const level = props.levels?.[2 + phase.index];
        return (
          <React.Fragment key={`q-audio-${phase.index}`}>
            {/* Ticking (tickStartMs → revealMs) — only when not skipReveal */}
            {!phase.skipReveal && phase.cues && (
              <Sequence
                from={phase.startFrame + msToFrames(phase.cues.tickStartMs, fps)}
                durationInFrames={msToFrames(phase.cues.revealMs - phase.cues.tickStartMs, fps)}
                name={`ticking Q${phase.index}`}
              >
                <Audio src={assetUrl(TICKING_REL, props.assetBase)} />
              </Sequence>
            )}

            {/* Reveal stinger — one-shot at stingerMs */}
            {!phase.skipReveal && phase.cues && (
              <Sequence
                from={phase.startFrame + msToFrames(phase.cues.stingerMs, fps)}
                durationInFrames={msToFrames(1500, fps)} // generous window; stinger is short
                name={`stinger Q${phase.index}`}
              >
                <Audio src={assetUrl(REVEAL_STINGER_REL, props.assetBase)} volume={0.5} />
              </Sequence>
            )}

            {/* Reveal team-name voice (optional — skipped if no path) */}
            {!phase.skipReveal && phase.cues && level?.revealVoiceRel && (
              <Sequence
                from={phase.startFrame + msToFrames(phase.cues.voiceMs, fps)}
                durationInFrames={msToFrames(EST_REVEAL_MS + 500, fps)}
                name={`reveal-voice Q${phase.index}`}
              >
                <Audio src={assetUrl(level.revealVoiceRel, props.assetBase)} />
              </Sequence>
            )}

            {/* Progress voice (optional — skipped if no path) */}
            {level?.progressVoiceRel && (
              <Sequence
                from={phase.startFrame + msToFrames(MS.PROGRESS_VOICE_DELAY * 2, fps)}
                durationInFrames={msToFrames(EST_PROGRESS_MS + 500, fps)}
                name={`progress-voice Q${phase.index}`}
              >
                <Audio src={assetUrl(level.progressVoiceRel, props.assetBase)} />
              </Sequence>
            )}
          </React.Fragment>
        );
      })}

      {/* Rules / quiz-title voice on LOGO phase */}
      {logoPhase && (() => {
        const rel = quizTitleRelPath(props.quizType ?? "club-by-nat", props.language);
        if (!rel) return null;
        return (
          <Sequence
            from={logoPhase.startFrame + msToFrames(MS.LOGO_VOICE_DELAY, fps)}
            durationInFrames={msToFrames(EST_RULES_MS + 1000, fps)}
            name="rules-voice"
          >
            <Audio src={assetUrl(rel, props.assetBase)} />
          </Sequence>
        );
      })()}

      {/* Ending voice on OUTRO phase */}
      {outroPhase && (() => {
        const rel = endingVoiceRelPath(props.endingType, props.language);
        if (!rel) return null;
        return (
          <Sequence
            from={outroPhase.startFrame + msToFrames(100, fps)}
            durationInFrames={msToFrames(EST_ENDING_MS + 1000, fps)}
            name="ending-voice"
          >
            <Audio src={assetUrl(rel, props.assetBase)} />
          </Sequence>
        );
      })()}
    </>
  );
};

// Local alias (same value as envelopes.ts constant) to avoid a circular import.
const BGM_CROSSFADE_MS_LOCAL = 3000;
