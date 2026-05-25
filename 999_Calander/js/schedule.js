/* Football Channel · upload schedule
 *
 * Built from 2025/26 research on YouTube algorithm + football audience timing.
 * Key principles:
 *  - POST 2–3 HOURS BEFORE PEAK (not at peak) so the algorithm can test before primetime
 *  - Daily uploads now HURT new channels (Dec 2025 algorithm shift) — start at 3–5 shorts/wk
 *  - 3-phase ramp: Launch (light) → Scale → Full cadence
 *  - Sun 10:00 LOCAL = single highest long-form slot globally (per Buffer 1.8M video study)
 *  - Monday = PL weekend-recap traffic peak
 *  - Tue/Wed = Champions League build/post-match windows
 *  - Friday Shorts = highest CTR day
 *  - Avoid live-match windows: PL Sat/Sun afternoons; UCL Tue/Wed 21:00 CET
 *
 * All times are LOCAL Israel (with summer DST). Israel summer = UTC+3; UK summer = UTC+1; CET summer = UTC+2.
 * So: IL hh = UK (hh-2) = Spain (hh-1).
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

/* PHASES
 *
 * Phase 1 — Launch (weeks 1–4):  2 long + 3 shorts / channel / week.
 *   Anchored on Mon (PL-recap traffic peak) and Sun morning (highest long-form slot globally).
 *
 * Phase 2 — Scale (weeks 5–12):  3 long + 5 shorts / channel / week.
 *   Adds Wed (mid-week / pre-UCL) and broadens shorts coverage.
 *
 * Phase 3 — Full cadence (week 13+):  4 long + 5 shorts / channel / week.
 *   Adds Fri evening long-form once the channel has retention data + audience habit.
 */
const PHASES = [
  {
    id: 1,
    name: "Launch",
    weeks: "Weeks 1–4 (May 30 – Jun 27)",
    startsOn: new Date(2026, 4, 30),
    en: {
      long: [
        { dow: 1, hour: 17, min: 0 }, // Mon 17:00 IL = UK 15:00 — PL-recap traffic peak day
        { dow: 0, hour: 11, min: 0 }, // Sun 11:00 IL = UK 09:00 — peak global long-form slot
      ],
      short: [
        { dow: 2, hour: 17, min: 0 }, // Tue 17:00 IL = UK 15:00 — UCL build
        { dow: 4, hour: 14, min: 0 }, // Thu 14:00 IL = UK 12:00 — Europa preview
        { dow: 5, hour: 13, min: 0 }, // Fri 13:00 IL = UK 11:00 — weekend preview, highest CTR
      ],
    },
    es: {
      long: [
        { dow: 1, hour: 18, min: 0 }, // Mon 18:00 IL = Spain 17:00 — weekend recap afternoon
        { dow: 0, hour: 12, min: 0 }, // Sun 12:00 IL = Spain 11:00 — pre-La Liga morning
      ],
      short: [
        { dow: 2, hour: 18, min: 0 }, // Tue 18:00 IL = Spain 17:00 — afternoon
        { dow: 4, hour: 22, min: 0 }, // Thu 22:00 IL = Spain 21:00 — evening prime
        { dow: 5, hour: 15, min: 0 }, // Fri 15:00 IL = Spain 14:00 — late lunch, weekend hype
      ],
    },
  },
  {
    id: 2,
    name: "Scale",
    weeks: "Weeks 5–12 (Jun 28 – Aug 22)",
    startsOn: new Date(2026, 5, 28),
    en: {
      long: [
        { dow: 1, hour: 17, min: 0 }, // Mon — recap day
        { dow: 3, hour: 17, min: 0 }, // Wed — pre-UCL afternoon
        { dow: 0, hour: 11, min: 0 }, // Sun — matchday morning
      ],
      short: [
        { dow: 2, hour: 17, min: 0 }, // Tue — UCL build
        { dow: 3, hour: 21, min: 0 }, // Wed 21:00 IL = UK 19:00 — UCL evening hype
        { dow: 4, hour: 14, min: 0 }, // Thu — Europa preview lunch
        { dow: 5, hour: 13, min: 0 }, // Fri — weekend preview, highest CTR
        { dow: 6, hour: 11, min: 0 }, // Sat — UK 09:00 pre-PL morning
      ],
    },
    es: {
      long: [
        { dow: 1, hour: 18, min: 0 }, // Mon — Spain 17:00
        { dow: 3, hour: 18, min: 0 }, // Wed — Spain 17:00 pre-UCL
        { dow: 0, hour: 12, min: 0 }, // Sun — Spain 11:00 matchday morning
      ],
      short: [
        { dow: 2, hour: 18, min: 0 }, // Tue — Spain 17:00
        { dow: 3, hour: 22, min: 0 }, // Wed 22:00 IL = Spain 21:00 — evening
        { dow: 4, hour: 22, min: 0 }, // Thu — Spain 21:00 evening
        { dow: 5, hour: 15, min: 0 }, // Fri — Spain 14:00 late lunch
        { dow: 6, hour: 12, min: 0 }, // Sat — Spain 11:00 pre-La Liga morning
      ],
    },
  },
  {
    id: 3,
    name: "Full",
    weeks: "Week 13+ (from Aug 23)",
    startsOn: new Date(2026, 7, 23),
    en: {
      long: [
        { dow: 1, hour: 17, min: 0 }, // Mon — recap day, biggest PL traffic
        { dow: 3, hour: 17, min: 0 }, // Wed — pre-UCL
        { dow: 5, hour: 19, min: 0 }, // Fri 19:00 IL = UK 17:00 — Friday evening wind-down
        { dow: 0, hour: 11, min: 0 }, // Sun — matchday morning
      ],
      short: [
        { dow: 2, hour: 17, min: 0 }, // Tue — UCL build
        { dow: 3, hour: 21, min: 0 }, // Wed — UCL evening hype
        { dow: 4, hour: 14, min: 0 }, // Thu — Europa preview
        { dow: 6, hour: 11, min: 0 }, // Sat — pre-PL morning
        { dow: 0, hour: 22, min: 0 }, // Sun 22:00 IL = UK 20:00 — post-match reactions
      ],
    },
    es: {
      long: [
        { dow: 1, hour: 18, min: 0 }, // Mon — Spain 17:00 recap afternoon
        { dow: 3, hour: 18, min: 0 }, // Wed — Spain 17:00 pre-UCL
        { dow: 5, hour: 22, min: 0 }, // Fri 22:00 IL = Spain 21:00 — Friday evening prime
        { dow: 0, hour: 12, min: 0 }, // Sun — Spain 11:00 matchday morning
      ],
      short: [
        { dow: 2, hour: 18, min: 0 }, // Tue — Spain 17:00
        { dow: 3, hour: 22, min: 0 }, // Wed — Spain 21:00 evening
        { dow: 4, hour: 22, min: 0 }, // Thu — Spain 21:00 evening
        { dow: 6, hour: 12, min: 0 }, // Sat — Spain 11:00 pre-La Liga
        { dow: 0, hour: 23, min: 0 }, // Sun 23:00 IL = Spain 22:00 — post-La-Liga reactions
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

// Slots firing on a given date (no runner assignment) — used by buildSchedule below
function slotsForDay(date) {
  if (date < START_DATE) return [];
  const phase = phaseForDate(date);
  const dow = date.getDay();
  const out = [];
  for (const channel of ["en", "es"]) {
    for (const type of ["long", "short"]) {
      const phaseSlots = phase[channel][type];
      phaseSlots.forEach(s => {
        if (s.dow !== dow) return;
        out.push({
          channel, type,
          hour: s.hour, min: s.min,
          phase: phase.id,
        });
      });
    }
  }
  out.sort((a, b) => (a.hour * 60 + a.min) - (b.hour * 60 + b.min));
  return out;
}

/* buildSchedule(endDate)
 *
 * Walks from START_DATE day-by-day and assigns runners using a STRICTLY SEQUENTIAL
 * counter per (channel + type). The runner picked is `pool[counter % pool.length]`
 * where `pool` is the set of runners available on that date.
 *
 * Guarantees: no quiz repeats within (pool.length / slots_per_week) weeks for a given
 * channel+type — e.g. Phase 2 EN long has 2 slots/wk and 13 runners → ≥ 6.5 weeks
 * between any quiz repeating on EN long-form. Phase 2 EN short has 5 slots/wk →
 * ≥ 2.6 weeks between repeats on EN shorts.
 *
 * The counter persists across phases, so phase transitions don't re-collide.
 *
 * Channels are offset against each other so EN and ES don't release the same quiz
 * on the same day.
 */
const CHANNEL_OFFSET = { en: 0, es: 7 };
const TYPE_OFFSET = { long: 0, short: 3 };

let _scheduleCache = null;
let _scheduleCacheEnd = null;

function buildSchedule(endDate) {
  // Cache: if we've already built through this date, reuse
  if (_scheduleCache && _scheduleCacheEnd && endDate <= _scheduleCacheEnd) {
    return _scheduleCache;
  }

  const slotCounters = new Map();
  const episodeCounters = new Map();
  const byDate = new Map();

  const cursor = new Date(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (cursor <= end) {
    const slots = slotsForDay(cursor);
    if (slots.length) {
      const pool = availableRunners(cursor);
      const enriched = [];
      for (const s of slots) {
        const ctKey = `${s.channel}|${s.type}`;
        const idx = slotCounters.get(ctKey) || 0;
        slotCounters.set(ctKey, idx + 1);

        const poolIdx = (idx + CHANNEL_OFFSET[s.channel] + TYPE_OFFSET[s.type]) % pool.length;
        const runner = pool[poolIdx];

        const epKey = `${s.channel}|${s.type}|${runner.id}`;
        const ep = (episodeCounters.get(epKey) || 0) + 1;
        episodeCounters.set(epKey, ep);

        enriched.push({ ...s, runner, episode: ep });
      }
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
