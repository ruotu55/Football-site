/* Football Channel · upload schedule
 *
 * Launch month (Jun 2 – Jul 1, 2026): 2 Shorts every day · 1 Long-form every
 * day at 18:00 IL — front-loads channel velocity for the algorithm.
 *
 * Steady state (from Jul 2, 2026): 2 Shorts every day · 3 Long-form per week.
 *
 * Long-form days in steady state (18:00 IL) — chosen for even spread +
 * football-audience peaks:
 *  - Sunday    — post-PL weekend wrap; Sunday-evening viewing habit
 *  - Wednesday — mid-week recap & UCL build (UCL kickoffs are 22:00 IL, so 18:00
 *                lands in the pre-game buzz window, not the live competition)
 *  - Friday    — highest CTR weekday on YouTube; weekend-content planning starts
 *
 * Shorts (2/day, uniform across the week) — picked to catch the morning scroll
 * AND the evening prime window in each channel's target geography:
 *
 *   EN (UK / Europe) — UK = IL−2 in summer:
 *     Slot A · 11:00 IL → UK 09:00     · morning commute / start-of-day scroll
 *     Slot B · 21:00 IL → UK 19:00     · evening prime, post-dinner browse
 *
 *   ES (Spain + South America) — Spain = IL−1, Argentina ≈ IL−5:
 *     Slot A · 15:00 IL → Spain 14:00 / Argentina 09:00 · Spain lunch tail + SA morning
 *     Slot B · 23:00 IL → Spain 22:00 / Argentina 17:00 · Spain prime + SA afternoon
 *
 * On long-form days the long sits at 18:00 IL, between the two shorts, so the
 * day reads in time order: morning short → long → evening short.
 *
 * Football timing rules respected:
 *  - Avoid PL Sat/Sun afternoon live windows (≈ 14:00 IL onwards on weekends)
 *  - No collision with UCL/UEL kickoffs (~22:00 IL Tue/Wed)
 *  - Fri & weekend morning slots = highest Shorts CTR
 *
 * Runner ordering — STRICTLY SEQUENTIAL by folder number (1, 2, 3, …, 8, 1, …)
 * for both Long and Short. Long-form starts at runner 1; Shorts also start at
 * runner 1 (slot A on day 1 → runner 1, slot B on day 1 → runner 2, etc.). The
 * EN and ES channels share the same runner+episode on each date and only differ
 * in upload hour, so one recording session covers both languages.
 *
 * All times LOCAL Israel (DST-aware). Times shown on the calendar = upload time
 * in Israel. IL summer: UK = IL−2, Spain = IL−1.
 */

/** Bump when START_DATE or phase boundaries change (invalidates buildSchedule cache). */
const SCHEDULE_REVISION = "20260602-start-r9mcq";

const START_DATE = new Date(2026, 5, 2); // 2026-06-02 Tuesday
const PLACEHOLDER_FROM = new Date(2026, 6, 4); // 2026-07-04

const RUNNERS = [
  { id: 1,  name: "Guess The Football Team Name",                short: "Team Name",     from: null },
  { id: 2,  name: "Guess The Football National Team",            short: "Nat. Team",     from: null },
  { id: 3,  name: "Guess The Player By Career Path",             short: "Career Path",   from: null },
  { id: 4,  name: "Guess The Player By Career Stats",            short: "Career Stats",  from: null },
  { id: 5,  name: "Guess The Player By Club/Pos/Country/Age",    short: "Club+Pos+Age",  from: null },
  { id: 6,  name: "Guess The Fake Information",                  short: "Fake Info",     from: null },
  { id: 7,  name: "Guess The Football Team Logo Name",           short: "Logo Name",     from: null },
  { id: 8,  name: "Guess The Football Player Name",              short: "Player Name",   from: null },
  { id: 9,  name: "Football Quiz - Multiple Choice",             short: "Quiz MCQ",      from: null },
  { id: 10, name: "Placeholder Runner #10",                      short: "TBD #10",       from: PLACEHOLDER_FROM },
  { id: 11, name: "Placeholder Runner #11",                      short: "TBD #11",       from: PLACEHOLDER_FROM },
  { id: 12, name: "Placeholder Runner #12",                      short: "TBD #12",       from: PLACEHOLDER_FROM },
  { id: 13, name: "Placeholder Runner #13",                      short: "TBD #13",       from: PLACEHOLDER_FROM },
];

/* Phases share the same shorts grid — define it once so the launch and steady
 * phases can't drift apart by accident. 2 shorts/day, uniform across the week. */
const EN_SHORTS = [
  // UK morning commute + UK evening prime.
  { dow: 0, hour: 11, min: 0 }, { dow: 0, hour: 21, min: 0 },
  { dow: 1, hour: 11, min: 0 }, { dow: 1, hour: 21, min: 0 },
  { dow: 2, hour: 11, min: 0 }, { dow: 2, hour: 21, min: 0 },
  { dow: 3, hour: 11, min: 0 }, { dow: 3, hour: 21, min: 0 },
  { dow: 4, hour: 11, min: 0 }, { dow: 4, hour: 21, min: 0 },
  { dow: 5, hour: 11, min: 0 }, { dow: 5, hour: 21, min: 0 },
  { dow: 6, hour: 11, min: 0 }, { dow: 6, hour: 21, min: 0 },
];
const ES_SHORTS = [
  // Spain lunch tail + Spain late prime
  // (also lands in South America morning + South America afternoon).
  { dow: 0, hour: 15, min: 0 }, { dow: 0, hour: 23, min: 0 },
  { dow: 1, hour: 15, min: 0 }, { dow: 1, hour: 23, min: 0 },
  { dow: 2, hour: 15, min: 0 }, { dow: 2, hour: 23, min: 0 },
  { dow: 3, hour: 15, min: 0 }, { dow: 3, hour: 23, min: 0 },
  { dow: 4, hour: 15, min: 0 }, { dow: 4, hour: 23, min: 0 },
  { dow: 5, hour: 15, min: 0 }, { dow: 5, hour: 23, min: 0 },
  { dow: 6, hour: 15, min: 0 }, { dow: 6, hour: 23, min: 0 },
];

/* Long-form 18:00 IL daily — used by the launch phase. */
const DAILY_LONG = [
  { dow: 0, hour: 18, min: 0 },
  { dow: 1, hour: 18, min: 0 },
  { dow: 2, hour: 18, min: 0 },
  { dow: 3, hour: 18, min: 0 },
  { dow: 4, hour: 18, min: 0 },
  { dow: 5, hour: 18, min: 0 },
  { dow: 6, hour: 18, min: 0 },
];

const PHASES = [
  {
    id: 1,
    name: "Launch",
    weeks: "First 30 days (Jun 2 – Jul 1)",
    startsOn: new Date(2026, 5, 2),
    en: { long: DAILY_LONG, short: EN_SHORTS },
    es: { long: DAILY_LONG, short: ES_SHORTS },
  },
  {
    id: 2,
    name: "Standard",
    weeks: "From Jul 2",
    startsOn: new Date(2026, 6, 2),
    en: {
      long: [
        { dow: 0, hour: 18, min: 0 }, // Sun 18:00 — weekend wrap, post-Sat/Sun PL window
        { dow: 3, hour: 18, min: 0 }, // Wed 18:00 — mid-week + pre-UCL (kickoffs 22:00 IL)
        { dow: 5, hour: 18, min: 0 }, // Fri 18:00 — highest CTR weekday, weekend hype
      ],
      short: EN_SHORTS,
    },
    es: {
      long: [
        { dow: 0, hour: 18, min: 0 }, // Sun 18:00 IL = Spain 17:00
        { dow: 3, hour: 18, min: 0 }, // Wed 18:00 IL = Spain 17:00
        { dow: 5, hour: 18, min: 0 }, // Fri 18:00 IL = Spain 17:00 (weekend hype)
      ],
      short: ES_SHORTS,
    },
  },
];

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function sameYMD(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

function phaseForDate(date) {
  let chosen = PHASES[0];
  for (const p of PHASES) {
    if (date >= p.startsOn) chosen = p;
  }
  return chosen;
}

function availableRunners(date) {
  return RUNNERS.filter(r => !r.from || date >= r.from);
}

function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/* buildSchedule(endDate)
 *
 * Walks from START_DATE day-by-day and assigns runners using a STRICTLY SEQUENTIAL
 * counter per type. The runner picked is `pool[(counter + TYPE_OFFSET) % pool.length]`
 * where `pool` is the set of runners available on that date. Both types start at
 * runner 1 (offset 0) — folder order on disk == upload order.
 *
 * EN and ES PAIR: on every date, the EN and ES slots of the same type share a
 * single counter — meaning they assign the SAME runner and SAME episode number.
 * The two channels differ only in upload hour. One recording session per
 * language covers the same calendar block in both channels.
 *
 * Long: 3 slots/wk · 8 runners → first 8 longs walk runner 1 → 2 → 3 → … → 8.
 * Short: 14 slots/wk · 8 runners → first 8 shorts walk runner 1 → 2 → 3 → … → 8,
 *   then loop. Gap between repeats of the same runner on shorts ≈ 4 days.
 *
 * The counter persists across phases, so phase transitions don't re-collide.
 */
const TYPE_OFFSET = { long: 0, short: 0 };

let _scheduleCache = null;
let _scheduleCacheEnd = null;
let _scheduleCacheRevision = null;

// Availability of real videos, set by the calendar from the recording-status
// store: { "<type>|<runnerId>": [episode, ...] }. Only episodes that have a
// saved block with levels are listed. The schedule places ONLY these (skipping
// runners that have run out), so the calendar shows nothing once videos run out.
let _blockEpisodes = null;
let _blockEpisodesSig = null;
function setBlockEpisodes(map) {
  const sig = JSON.stringify(map || null);
  if (sig === _blockEpisodesSig) return; // unchanged → keep the cache warm
  _blockEpisodesSig = sig;
  _blockEpisodes = map || null;
  _scheduleCache = null;
  _scheduleCacheEnd = null;
  _scheduleCacheRevision = null;
}

// Mixed calendar rotation order (user preference) — not plain 1..8. Any runner
// not listed (e.g. placeholders) is appended after, so nothing is lost.
const CALENDAR_RUNNER_ORDER = [1, 5, 8, 3, 6, 2, 4, 7, 9];
const ORDERED_RUNNERS = (() => {
  const byId = new Map(RUNNERS.map((r) => [r.id, r]));
  const out = [];
  for (const id of CALENDAR_RUNNER_ORDER) if (byId.has(id)) out.push(byId.get(id));
  for (const r of RUNNERS) if (!CALENDAR_RUNNER_ORDER.includes(r.id)) out.push(r);
  return out;
})();

/** Slots firing on a given date for one channel — kept channel-agnostic
 *  (returns the raw hour/min array per type) so buildSchedule can pair them. */
function _channelSlotsForDay(phase, channel, type, dow) {
  const out = [];
  for (const s of phase[channel][type]) {
    if (s.dow === dow) out.push({ hour: s.hour, min: s.min });
  }
  return out;
}

function buildSchedule(endDate) {
  // Cache: if we've already built through this date, reuse
  if (
    _scheduleCache
    && _scheduleCacheEnd
    && _scheduleCacheRevision === SCHEDULE_REVISION
    && endDate <= _scheduleCacheEnd
  ) {
    return _scheduleCache;
  }

  const slotPointers = new Map();    // key: <type>           → next index into ORDERED_RUNNERS
  const epUsed = new Map();          // key: <type>|<runnerId> → how many of its videos we've placed
  const lastOpener = new Map();      // key: <type>           → opener of the last placed video
  const eps = _blockEpisodes || {};  // { "<type>|<runnerId>": [{ep,opener},...] } — only blocks with a video
  const byDate = new Map();

  // Pick the next video for this type. Rotates through runners in the mixed
  // CALENDAR order, skipping runners that have run out (e.g. 1,5,8,3…). Prefers
  // a video whose opener (1st level) differs from the previously placed one, so
  // two consecutive calendar entries never start with the same player/team
  // (falls back to the rotation pick if every remaining option shares it).
  // Returns null when all runners are exhausted (slot, and later ones, empty).
  function pickNext(type) {
    const order = ORDERED_RUNNERS;
    const n = order.length;
    const start = slotPointers.get(type) || 0;
    const lastOp = lastOpener.get(type);
    let fallback = null;
    for (let k = 0; k < n; k++) {
      const idx = (start + k) % n;
      const runner = order[idx];
      const key = `${type}|${runner.id}`;
      const list = eps[key] || [];
      const used = epUsed.get(key) || 0;
      if (used >= list.length) continue;
      const cand = list[used];
      if (fallback === null) fallback = { idx, runner, key, cand };
      if (!lastOp || cand.opener !== lastOp) {
        slotPointers.set(type, (idx + 1) % n);
        epUsed.set(key, used + 1);
        lastOpener.set(type, cand.opener);
        return { runner, episode: cand.ep };
      }
    }
    if (fallback) {
      slotPointers.set(type, (fallback.idx + 1) % n);
      epUsed.set(fallback.key, (epUsed.get(fallback.key) || 0) + 1);
      lastOpener.set(type, fallback.cand.opener);
      return { runner: fallback.runner, episode: fallback.cand.ep };
    }
    return null;
  }

  const cursor = new Date(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (cursor <= end) {
    if (cursor < START_DATE) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const phase = phaseForDate(cursor);
    const dow = cursor.getDay();
    const pool = availableRunners(cursor);
    const enriched = [];

    for (const type of ["long", "short"]) {
      const enHours = _channelSlotsForDay(phase, "en", type, dow);
      const esHours = _channelSlotsForDay(phase, "es", type, dow);
      // The phase definitions mirror DOW across EN/ES, so en/es slot counts
      // should match. Pair index-by-index; if they ever drift (e.g. a future
      // phase has unbalanced slots), the unpaired tail falls through as solo
      // entries with their own counter ticks.
      const pairCount = Math.min(enHours.length, esHours.length);

      for (let i = 0; i < pairCount; i++) {
        const picked = pickNext(type);
        if (!picked) break; // out of videos for this type → leave this slot (and later ones) empty
        // EN and ES share runner + episode for this date — the recording-queue
        // block keyed by (runnerId, type, episode) maps to ONE calendar date,
        // with EN and ES uploads at their respective hours.
        enriched.push({
          channel: "en", type,
          hour: enHours[i].hour, min: enHours[i].min,
          phase: phase.id, runner: picked.runner, episode: picked.episode,
        });
        enriched.push({
          channel: "es", type,
          hour: esHours[i].hour, min: esHours[i].min,
          phase: phase.id, runner: picked.runner, episode: picked.episode,
        });
      }

      // Unbalanced EN/ES tail (mirrored phases make this rare): place each
      // remaining slot with its own next video, still skipping exhausted runners.
      for (let i = pairCount; i < enHours.length; i++) {
        const picked = pickNext(type);
        if (!picked) break;
        enriched.push({ channel: "en", type, hour: enHours[i].hour, min: enHours[i].min, phase: phase.id, runner: picked.runner, episode: picked.episode });
      }
      for (let i = pairCount; i < esHours.length; i++) {
        const picked = pickNext(type);
        if (!picked) break;
        enriched.push({ channel: "es", type, hour: esHours[i].hour, min: esHours[i].min, phase: phase.id, runner: picked.runner, episode: picked.episode });
      }
    }

    if (enriched.length) {
      enriched.sort((a, b) => (a.hour * 60 + a.min) - (b.hour * 60 + b.min));
      byDate.set(dateKey(cursor), enriched);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  _scheduleCache = byDate;
  _scheduleCacheEnd = end;
  _scheduleCacheRevision = SCHEDULE_REVISION;
  return byDate;
}

function uploadsForDay(date) {
  if (date < START_DATE) return [];
  const all = buildSchedule(date);
  return all.get(dateKey(date)) || [];
}

function uploadsForMonth(year, month) {
  const monthEnd = new Date(year, month + 1, 0);
  const all = buildSchedule(monthEnd);
  const result = new Map();
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const key = `${year}-${month}-${d}`;
    if (all.has(key)) result.set(d, all.get(key));
  }
  return result;
}

window.FCSchedule = {
  START_DATE,
  PLACEHOLDER_FROM,
  RUNNERS,
  PHASES,
  uploadsForDay,
  uploadsForMonth,
  phaseForDate,
  setBlockEpisodes,
  pad2,
  sameYMD,
};
