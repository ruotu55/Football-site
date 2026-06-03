import { describe, it, expect } from "vitest";
import { MS, BALL_PRELOADER_MS, msToFrames, questionBlockMs, buildTimeline, progressVoiceForQuestion } from "./timeline";

describe("frame math", () => {
  it("rounds ms to frames", () => {
    expect(msToFrames(1000, 60)).toBe(60);
    expect(msToFrames(780, 60)).toBe(47);
    expect(msToFrames(1000, 30)).toBe(30);
  });
  it("question block = countdown + reveal hold", () => {
    expect(questionBlockMs()).toBe(13000);
  });
});

describe("MS constants (verified against source)", () => {
  it("matches the live app", () => {
    expect(MS.LOGO_VOICE_DELAY).toBe(500);
    expect(MS.LOGO_REVEAL_DELAY).toBe(2000);
    expect(MS.LOGO_AFTER_REVEAL).toBe(1200);
    expect(MS.INTRO_STEP_DELAY_IDX0).toBe(1000);
    expect(MS.INTRO_STEP_DELAY_IDX1).toBe(500);
    expect(MS.FLIP_DELAY_INTRO).toBe(1000);
    expect(MS.STAGE_TRANSITION).toBe(820);
    expect(MS.AFTER_CUSTOM_TRANSITION).toBe(200);
    expect(MS.COUNTDOWN_TOTAL).toBe(10000);
    expect(MS.TICK_LEAD).toBe(3000);
    expect(MS.REVEAL_STINGER).toBe(150);
    expect(MS.REVEAL_VOICE_DELAY).toBe(600);
    expect(MS.FLIP_DELAY_REVEAL).toBe(3000);
    expect(MS.FLIP_DURATION).toBe(780);
    expect(MS.OUTRO_TAIL).toBe(1000);
    expect(MS.PROGRESS_VOICE_DELAY).toBe(1000);
    expect(MS.DEFAULT_TRANSITION_PHASE).toBe(840);
    expect(MS.LANDING_QUIZ_VOICE_DELAY).toBe(1000);
  });
});

describe("BALL_PRELOADER_MS", () => {
  it("is 3350ms", () => {
    expect(BALL_PRELOADER_MS).toBe(3350);
  });
});

describe("buildTimeline (Regular flow)", () => {
  const fps = 60;
  // rulesVoiceMs=2500 (default) → landingHoldMs = max(1000+2500, 1500) = 3500
  // openingLandingMs = round(3350 + 3500) = 6850
  const tl = buildTimeline({ questionCount: 3, fps, transitionMs: 820, rulesVoiceMs: 2500 });

  it("phase order starts with landing (no logo)", () => {
    expect(tl.phases.map(p => p.kind)).toEqual([
      "landing","transition","question",
      "transition","question","transition","question","transition","outro",
    ]);
  });
  it("opening landing hasBallPreloader flag is set", () => {
    const landing = tl.phases.find(p => p.kind === "landing")!;
    expect(landing.hasBallPreloader).toBe(true);
  });
  it("opening landing duration = BALL_PRELOADER_MS + landingHoldMs", () => {
    const landing = tl.phases.find(p => p.kind === "landing")!;
    // landingHoldMs = max(1000+2500, 1500) = 3500; total = round(3350+3500) = 6850
    expect(landing.durationMs).toBe(6850);
  });
  it("each question block = 13000ms", () => {
    const q = tl.phases.find(p => p.kind === "question")!;
    expect(q.durationMs).toBe(13000);
  });
  it("transitions are 820ms", () => {
    expect(tl.phases.filter(p => p.kind === "transition").every(p => p.durationMs === 820)).toBe(true);
  });
  it("question cue offsets", () => {
    const q = tl.phases.find(p => p.kind === "question")!;
    expect(q.cues!.tickStartMs).toBe(7000);
    expect(q.cues!.revealMs).toBe(10000);
    expect(q.cues!.stingerMs).toBe(10150);
    expect(q.cues!.voiceMs).toBe(10600);
    expect(q.cues!.flipStartMs).toBe(10000);
    expect(q.cues!.flipDurationMs).toBe(780);
  });
  it("landing starts at frame 0; first transition at 6850ms", () => {
    expect(tl.phases[0].startFrame).toBe(0);
    expect(tl.phases[1].startFrame).toBe(Math.round((6850/1000)*fps));
  });
  it("totalDurationFrames = sum of blocks", () => {
    const sumMs = tl.phases.reduce((a,p)=>a+p.durationMs,0);
    expect(tl.totalDurationFrames).toBe(Math.round((sumMs/1000)*fps));
  });
});

describe("buildTimeline (Regular flow) at fps=30", () => {
  const fps = 30;
  const tl = buildTimeline({ questionCount: 3, fps, transitionMs: 820, rulesVoiceMs: 2500 });

  it("phase order is identical at fps=30", () => {
    expect(tl.phases.map(p => p.kind)).toEqual([
      "landing","transition","question",
      "transition","question","transition","question","transition","outro",
    ]);
  });
  it("opening landing hasBallPreloader at fps=30", () => {
    expect(tl.phases.find(p => p.kind === "landing")!.hasBallPreloader).toBe(true);
  });
  it("opening landing block duration is fps-independent", () => {
    expect(tl.phases.find(p => p.kind === "landing")!.durationMs).toBe(6850);
  });
  it("each question block = 13000ms at fps=30", () => {
    const q = tl.phases.find(p => p.kind === "question")!;
    expect(q.durationMs).toBe(13000);
  });
  it("transitions are 820ms at fps=30", () => {
    expect(tl.phases.filter(p => p.kind === "transition").every(p => p.durationMs === 820)).toBe(true);
  });
  it("landing starts at frame 0 at fps=30; first transition scales with fps", () => {
    expect(tl.phases[0].startFrame).toBe(0);
    expect(tl.phases[1].startFrame).toBe(Math.round((6850/1000)*fps));
  });
  it("totalDurationFrames scales with fps", () => {
    const sumMs = tl.phases.reduce((a,p)=>a+p.durationMs,0);
    expect(tl.totalDurationFrames).toBe(Math.round((sumMs/1000)*fps));
  });
});

describe("buildTimeline opening landing duration varies with rulesVoiceMs", () => {
  it("short rules voice still ensures minimum hold", () => {
    // rulesVoiceMs=0 → landingHoldMs = max(1000+0, 1500) = 1500; total = round(3350+1500) = 4850
    const tl = buildTimeline({ questionCount: 1, fps: 60, rulesVoiceMs: 0 });
    expect(tl.phases[0].durationMs).toBe(4850);
  });
  it("longer rules voice extends the landing hold", () => {
    // rulesVoiceMs=4000 → landingHoldMs = max(1000+4000, 1500) = 5000; total = round(3350+5000) = 8350
    const tl = buildTimeline({ questionCount: 1, fps: 60, rulesVoiceMs: 4000 });
    expect(tl.phases[0].durationMs).toBe(8350);
  });
  it("default (no rulesVoiceMs arg) uses 2500ms fallback → 6850ms landing", () => {
    const tl = buildTimeline({ questionCount: 1, fps: 60 });
    expect(tl.phases[0].durationMs).toBe(6850);
  });
});

describe("buildTimeline bonus-skip variants", () => {
  it("bonus skip: think-you-know drops last question's reveal hold", () => {
    const tl = buildTimeline({ questionCount: 3, fps: 60, endingType: "think-you-know" });
    const qs = tl.phases.filter(p => p.kind === "question");
    expect(qs[qs.length-1].durationMs).toBe(10000);
    expect(qs[0].durationMs).toBe(13000);
  });
  it("how-many keeps last question reveal", () => {
    const tl = buildTimeline({ questionCount: 3, fps: 60, endingType: "how-many" });
    const qs = tl.phases.filter(p => p.kind === "question");
    expect(qs[qs.length-1].durationMs).toBe(13000);
  });
});

describe("progress voice milestones", () => {
  const n = 10;
  it("warmUp/serious/nerds/genius", () => {
    expect(progressVoiceForQuestion(1, n)).toBe("warmUp");
    expect(progressVoiceForQuestion(Math.max(2, Math.round(n*0.3)), n)).toBe("serious");
    expect(progressVoiceForQuestion(Math.max(2, Math.round(n*0.6)), n)).toBe("nerds");
    expect(progressVoiceForQuestion(Math.max(2, Math.round(n*0.9)), n)).toBe("genius");
  });
  it("non-milestone returns null", () => {
    expect(progressVoiceForQuestion(5, n)).toBe(null);
  });
});
