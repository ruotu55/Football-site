/* Football Channel · upload schedule
 *
 * Cadence (per channel): 1 Short every day · 3 Long-form per week (all at 18:00 Israel).
 *
 * Long-form days (18:00 IL) — chosen for even spread + football-audience peaks:
 *  - Sunday    — post-PL weekend wrap; Sunday-evening viewing habit
 *  - Wednesday — mid-week recap & UCL build (UCL kickoffs are 22:00 IL, so 18:00
 *                lands in the pre-game buzz window, not the live competition)
 *  - Friday    — highest CTR weekday on YouTube; weekend-content planning starts
 *
 * Gap pattern: Sun → Wed (3 days), Wed → Fri (2 days), Fri → Sun (2 days). No
 * back-to-back days, no Saturday upload (PL Sat afternoon ≈ 14:00 IL onwards
 * cannibalises views), no head-on competition with UCL/UEL kickoffs.
 *
 * Shorts — one slot daily, timed 2–3 h before audience peaks; on long days the Short
 * is morning/early afternoon so Long and Short never sit back-to-back in the grid.
 *
 * Football timing rules:
 *  - Avoid PL Sat/Sun afternoon live windows · UCL Tue/Wed ~21:00 CET
 *  - Fri Shorts = highest CTR · Tue = UCL build · Sat AM = pre-matchday
 *
 * All times LOCAL Israel (DST-aware). IL summer: UK = IL−2, Spain = IL−1.
 */

const START_DATE = new Date(2026, 4, 30); // 2026-05-30 Saturday
const PLACEHOLDER_FROM = new Date(2026, 6, 1); // 2026-07-01

const RUNNERS = [
  { id: 1,  name: "Guess The Football Team Name",                short: "Team Name",     from: null },
  { id: 2,  name: "Guess The Football National Team",            short: "Nat. Team",     from: null },
  { id: 3,  name: "Guess The Player By Career Path",             short: "Career Path",   from: null },
  { id: 4,  name: "Guess The Player By Career Stats",            short: "Career Stats",  from: null },
  { id: 5,  name: "Guess The Player By Club/Pos/Country/Age",    short: "Club+Pos+Age",  from: null },
  { id: 6,  name: "Guess The Fake Information",                  short: "Fake Info",     from: null },
  { id: 7,  name: "Guess The Football Team Logo Name",           short: "Logo Name",     from: null },
  { id: 8,  name: "Guess The Football Player Name",              short: "Player Name",   from: null },
  { id: 9,  name: "Placeholder Runner #9",                       short: "TBD #9",        from: PLACEHOLDER_FROM },
  { id: 10, name: "Placeholder Runner #10",                      short: "TBD #10",       from: PLACEHOLDER_FROM },
  { id: 11, name: "Placeholder Runner #11",                      short: "TBD #11",       from: PLACEHOLDER_FROM },
  { id: 12, name: "Placeholder Runner #12",                      short: "TBD #12",       from: PLACEHOLDER_FROM },
  { id: 13, name: "Placeholder Runner #13",                      short: "TBD #13",       from: PLACEHOLDER_FROM },
];

/* Weekly cadence: 7 shorts + 3 long-form per channel (EN and ES). */
const PHASES = [
  {
    id: 1,
    name: "Standard",
    weeks: "From launch (May 30)",
    startsOn: new Date(2026, 4, 30),
    en: {
      long: [
        { dow: 0, hour: 18, min: 0 }, // Sun 18:00 — weekend wrap, post-Sat/Sun PL window
        { dow: 3, hour: 18, min: 0 }, // Wed 18:00 — mid-week + pre-UCL (kickoffs 22:00 IL)
        { dow: 5, hour: 18, min: 0 }, // Fri 18:00 — highest CTR weekday, weekend hype
      ],
      short: [
        { dow: 0, hour: 12, min: 0 }, // Sun 12:00 — morning (long same day at 18:00)
        { dow: 1, hour: 13, min: 0 }, // Mon 13:00 — lunch, before evening long
        { dow: 2, hour: 17, min: 0 }, // Tue 17:00 — UCL build (UK 15:00)
        { dow: 3, hour: 12, min: 0 }, // Wed 12:00 — midday, before evening long
        { dow: 4, hour: 14, min: 0 }, // Thu 14:00 — Europa / mid-week preview
        { dow: 5, hour: 13, min: 0 }, // Fri 13:00 — highest Shorts CTR, weekend hype
        { dow: 6, hour: 11, min: 0 }, // Sat 11:00 — pre-PL morning (UK 09:00)
      ],
    },
    es: {
      long: [
        { dow: 0, hour: 18, min: 0 }, // Sun 18:00 IL = Spain 17:00
        { dow: 3, hour: 18, min: 0 }, // Wed 18:00 IL = Spain 17:00
        { dow: 5, hour: 18, min: 0 }, // Fri 18:00 IL = Spain 17:00 (weekend hype)
      ],
      short: [
        { dow: 0, hour: 13, min: 0 }, // Sun — Spain afternoon, before long
        { dow: 1, hour: 14, min: 0 }, // Mon — late lunch
        { dow: 2, hour: 18, min: 0 }, // Tue — Spain 17:00 UCL build
        { dow: 3, hour: 13, min: 0 }, // Wed — midday, before long
        { dow: 4, hour: 22, min: 0 }, // Thu — Spain 21:00 evening prime
        { dow: 5, hour: 15, min: 0 }, // Fri — Spain 14:00, weekend preview
        { dow: 6, hour: 12, min: 0 }, // Sat — Spain 11:00 pre-La Liga
      ],
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
 * where `pool` is the set of runners available on that date.
 *
 * EN and ES PAIR: on every date, the EN and ES slots of the same type share a
 * single counter — meaning they assign the SAME runner and SAME episode number.
 * The two channels differ only in upload hour (e.g. EN at 18:00 IL, ES at 17:00
 * Spain ≈ 18:00 IL for long-form). One recording session per language covers
 * the same calendar block in both channels.
 *
 * Guarantees: no quiz repeats within (pool.length / slots_per_week) weeks for a
 * given type — e.g. long has 3 slots/wk and 8 runners → ≥ 2.7 weeks between
 * repeats on long-form; short has 7 slots/wk → ≥ 1.1 weeks between short repeats.
 *
 * The counter persists across phases, so phase transitions don't re-collide.
 */
const TYPE_OFFSET = { long: 0, short: 3 };

let _scheduleCache = null;
let _scheduleCacheEnd = null;

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
  if (_scheduleCache && _scheduleCacheEnd && endDate <= _scheduleCacheEnd) {
    return _scheduleCache;
  }

  const slotCounters = new Map();    // key: <type>           → idx (drives pool selection)
  const episodeCounters = new Map(); // key: <type>|<runnerId> → next episode # (shared by EN+ES)
  const byDate = new Map();

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
        const slotIdx = slotCounters.get(type) || 0;
        slotCounters.set(type, slotIdx + 1);
        const poolIdx = (slotIdx + TYPE_OFFSET[type]) % pool.length;
        const runner = pool[poolIdx];

        const epKey = `${type}|${runner.id}`;
        const ep = (episodeCounters.get(epKey) || 0) + 1;
        episodeCounters.set(epKey, ep);

        // EN and ES share runner + episode for this date — the recording-queue
        // block keyed by (runnerId, type, episode) now maps to ONE calendar
        // date, with the EN and ES uploads sitting at their respective hours.
        enriched.push({
          channel: "en", type,
          hour: enHours[i].hour, min: enHours[i].min,
          phase: phase.id, runner, episode: ep,
        });
        enriched.push({
          channel: "es", type,
          hour: esHours[i].hour, min: esHours[i].min,
          phase: phase.id, runner, episode: ep,
        });
      }

      // Defensive: if EN/ES ever fall out of sync within a phase, walk the
      // extras one channel at a time so we don't silently drop scheduled
      // uploads. They still consume the type counter and get an episode.
      for (let i = pairCount; i < enHours.length; i++) {
        const slotIdx = slotCounters.get(type) || 0;
        slotCounters.set(type, slotIdx + 1);
        const poolIdx = (slotIdx + TYPE_OFFSET[type]) % pool.length;
        const runner = pool[poolIdx];
        const epKey = `${type}|${runner.id}`;
        const ep = (episodeCounters.get(epKey) || 0) + 1;
        episodeCounters.set(epKey, ep);
        enriched.push({
          channel: "en", type,
          hour: enHours[i].hour, min: enHours[i].min,
          phase: phase.id, runner, episode: ep,
        });
      }
      for (let i = pairCount; i < esHours.length; i++) {
        const slotIdx = slotCounters.get(type) || 0;
        slotCounters.set(type, slotIdx + 1);
        const poolIdx = (slotIdx + TYPE_OFFSET[type]) % pool.length;
        const runner = pool[poolIdx];
        const epKey = `${type}|${runner.id}`;
        const ep = (episodeCounters.get(epKey) || 0) + 1;
        episodeCounters.set(epKey, ep);
        enriched.push({
          channel: "es", type,
          hour: esHours[i].hour, min: esHours[i].min,
          phase: phase.id, runner, episode: ep,
        });
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
  pad2,
  sameYMD,
};
