// Description block templates for the Name & Description generator.
// Many variants per slot so consecutive "Regenerate" clicks yield very
// different copy.

// ---------------------------------------------------------------------------
// HOOK LINES — opening one-liners. ~50 variants.
// ---------------------------------------------------------------------------
export const HOOK_LINES = [
  "Only TRUE football fans can ace this one!",
  "Think you know football? Prove it.",
  "9 out of 10 fans FAIL this quiz!",
  "Can YOU score 100% on this football challenge?",
  "Don't even click play if you don't know your football!",
  "Calling all football fanatics — let's see what you've got!",
  "This is the football quiz EVERY fan needs to try!",
  "Most fans get this WRONG — can you do better?",
  "The ULTIMATE football quiz is here. How many will you get?",
  "Football geniuses only. Are you in?",
  "Bet you can't get them ALL right!",
  "Real football fans only — beginners turn back now!",
  "The hardest football quiz on YouTube?! Let's find out!",
  "Stop scrolling — this is the football quiz you NEED!",
  "Football IQ test — what's your score?",
  "If you call yourself a football fan, you MUST try this!",
  "This quiz will EXPOSE the fake football fans!",
  "Think you're a football expert? This quiz will humble you.",
  "Bet you can't beat my score!",
  "Football trivia legends — this one's for YOU!",
  "Drop everything — it's quiz time!",
  "How many can YOU get in a row?",
  "I dare you to score perfect on this football quiz!",
  "The toughest football quiz of the year!",
  "Casual fans need not apply 😤",
  "True or fake — can you spot the difference?",
  "Welcome to the football quiz that broke the internet!",
  "Test your football brain against the WORLD!",
  "If you get 10/10 on this you're a football genius!",
  "Football quiz time — let's go! 🔥",
  "Be honest — how many did you get?",
  "Only the sharpest football minds survive this one!",
  "Casual fan vs hardcore — this quiz tells all!",
  "Get ready for the wildest football quiz yet!",
  "Football brain teaser incoming — are you ready?",
  "This quiz separates the legends from the locals!",
  "Football fans, gather round — it's go time!",
  "5 seconds per question. No googling. Can you keep up?",
  "Pause if you must — but no cheating! 👀",
  "Can your football knowledge keep up?",
  "Don't say you weren't warned — this one's tough!",
  "Football fans, this is YOUR moment!",
  "Top 1% football fans get them all. Are you one?",
  "How big a football fan are YOU really?",
  "Time to test that football IQ!",
  "Hardest football quiz of the season — incoming!",
  "Football fans, this quiz is INSANE!",
  "Most casual fans flunk this one!",
  "Only the ultras get them all right!",
  "Football trivia 101 — let's see who graduates!",
];

// ---------------------------------------------------------------------------
// SHORT HOOKS for Shorts (punchier, one-line, < 60 chars). ~30 variants.
// ---------------------------------------------------------------------------
export const SHORT_HOOKS = [
  "Can you guess it? 🤔",
  "Only TRUE fans get this!",
  "Bet you can't get this one!",
  "Football fans, this is for YOU!",
  "How fast can you solve this? ⚽",
  "Only 1% get this right! 🔥",
  "Most fans FAIL this!",
  "Easy or impossible? You decide!",
  "Quiz time — let's go!",
  "Pause if you need to! 👀",
  "Real fans only! ⚽",
  "Can you score 10/10?",
  "Football IQ check 🧠",
  "Comment your guess 👇",
  "Did you get it?? 🤯",
  "Too easy or too hard?",
  "Test your football brain!",
  "Drop your answer below 👇",
  "Are you a football genius?",
  "How quick can YOU solve this?",
  "Football quiz — let's GO!",
  "Don't get this wrong! 😤",
  "Top 1% gets this!",
  "Are you that good? 😏",
  "Casual fans flunk this 😬",
  "Hardest one yet! 🔥",
  "Guess before the timer ends!",
  "Football fans assemble! ⚽",
  "Quick! What's the answer?",
  "Reveal in 3… 2… 1…",
  "99% can't do this 😱",
  "Only legends get 10/10 🏆",
  "Bet you fail this one 😏",
  "Harder than it looks 🤯",
  "Save this & try again later 📌",
  "Tag a mate who'd fail 😂",
  "Think fast! ⏱️⚽",
  "No googling allowed 🚫📱",
  "Prove you're a real fan 🔥",
  "Can you beat the timer? ⏱️",
];

// ---------------------------------------------------------------------------
// QUIZ EXPLANATIONS — multiple variants per quiz type.
// ---------------------------------------------------------------------------
export const QUIZ_EXPLANATION = {
  "team-by-nat": [
    "In this quiz you have to GUESS the football team based on the nationalities of its players. Each round shows you a full XI made up of players from one club — the trick? You only see their flags. Can you spot the team?",
    "Eleven flags. One football club. Can you connect the dots and name the team behind the lineup? This is the ultimate test for football fans who follow the transfer market.",
    "Every level shows the nationalities of an entire starting XI from a real club. No names, no logos — just flags. Your mission: name the team. Are you up for it?",
    "From the Premier League to the Saudi Pro League, this quiz throws full club lineups at you using ONLY player nationalities. Guess the team in record time!",
    "The challenge is simple but BRUTAL: see a club's starting XI revealed flag-by-flag and shout the team before everyone else. Can you do it?",
  ],
  "nat-by-club": [
    "Can you guess the NATIONAL TEAM from its players' club crests? Each round shows you a national team's XI — but only the clubs the players play for. Identify the country!",
    "Eleven club crests. One country. Can you figure out which national team's stars are scattered across those clubs?",
    "Forget flags — this quiz tests if you know where international stars actually play their club football. Spot the national team behind the badges!",
    "World Cup edition? Euro edition? Each round drops a national team's lineup — but you only see club logos. Identify the country before the time runs out!",
    "If you know your transfers, this quiz is for you. Every level shows a national XI through club crests — name the country!",
  ],
  "career-path": [
    "Guess the FOOTBALLER from his career path! Each round reveals every club the player has played for in order — your job is to name the legend behind the journey.",
    "Real Madrid → Juventus → Manchester United → ??? Each level walks you through a player's career club-by-club. Name the player!",
    "From academy to retirement, this quiz traces real footballers' career paths step by step. Can you spot the star behind the journey?",
    "The trickiest career path quiz on YouTube — name the player from his club history alone! No photos, no hints, just transfers.",
    "Follow the career, name the player. Some are obvious. Some will break you. Are you ready?",
  ],
  "career-stats": [
    "Can you guess the player from his career STATS alone? Goals, assists, appearances, trophies — only the numbers tell the story. Name the footballer!",
    "Numbers don't lie — but can they help you name the player? Goals, assists, trophies and more. Spot the star from his stats!",
    "Stat heads only! Each round drops a player's career numbers — your job is to name the man behind them.",
    "Goals scored. Trophies lifted. Caps earned. Can you connect the stat sheet to the right footballer?",
    "Pure numbers. No faces. No clubs. Just career stats. Can you guess the player?",
  ],
  "four-params": [
    "Four clues. One player. Each round gives you the player's CLUB, POSITION, COUNTRY and AGE — guess the footballer behind the parameters!",
    "Club + position + country + age = one footballer. Can you crack the code on every level?",
    "Four pieces of info. Hundreds of possible players. Can you nail the right one every time?",
    "It sounds easy: club, position, nationality, age. But there's only ONE right answer per level. Can you find it?",
    "Combine the four clues, name the star. The ultimate test for fans who think they know every player!",
  ],
  "fake-info": [
    "Spot the FAKE! Each round gives you facts about a real footballer — but ONE detail is a lie. Can you find the fake information before the timer ends?",
    "True or false? Each level mixes real facts with one BIG lie about a footballer. Spot the fake!",
    "Some facts are real. ONE is fake. Can you tell the difference?",
    "Lie detector mode: ON. Each round dares you to spot the fake stat hidden among the real ones.",
    "Don't get fooled! Every level plants one fake detail in a player's profile. Can you catch it?",
  ],
  "logo-name": [
    "Guess the football team from its LOGO! Iconic crests, modern badges, hidden details — name the club behind the emblem!",
    "Badges, crests, emblems — can you name them all? From world-famous logos to deep-cut second division crests, this quiz has it all!",
    "How well do you know football logos? Each level shows a badge — your job is to name the club!",
    "From Premier League giants to obscure South American sides, this quiz tests your crest-spotting skills. Are you ready?",
    "Logo recognition mode: ON. Name the football club from its badge alone!",
  ],
  "player-name": [
    "Guess the footballer from his PHOTO! Legends, current stars, hidden gems — can you name them all?",
    "How well do you know your footballers? Each level shows a photo — you name the player!",
    "From the GOAT debate to the next generation, this quiz throws faces at you. Name every footballer!",
    "Face recognition for football fans. Can you ID every player who flashes up?",
    "Eleven faces. Eleven names. Eleven chances to prove you're a real football fan!",
  ],
};

// ---------------------------------------------------------------------------
// FEATURE-BLOCK HEADERS — different labels for the "this round" section
// ---------------------------------------------------------------------------
export const FEATURE_HEADERS = [
  "🎯 This round:",
  "⚽ Featured today:",
  "🔥 In this video:",
  "👀 What's inside:",
  "🏟️ Today's lineup:",
  "🎬 Featured in this quiz:",
  "📋 On the card today:",
  "🌍 Today's challenge includes:",
];

// ---------------------------------------------------------------------------
// SPECIAL-EDITION PHRASINGS for the saved-script tag
// ---------------------------------------------------------------------------
export const SPECIAL_EDITION_PHRASES = [
  "🏆 Special edition: {NAME}",
  "🌟 Theme: {NAME}",
  "🔥 {NAME} edition!",
  "⭐ Tonight's theme: {NAME}",
  "🎯 {NAME} special!",
  "🏅 Series: {NAME}",
  "💥 {NAME} – the ultimate test!",
];

// ---------------------------------------------------------------------------
// ENGAGEMENT LINES — CTA / interaction prompts. ~35 variants.
// ---------------------------------------------------------------------------
export const ENGAGEMENT_LINES = [
  "👇 Drop your score in the comments — how many did YOU get?",
  "💬 Which one tripped you up? Let me know!",
  "🔔 SUBSCRIBE for daily football quizzes!",
  "👍 Smash the LIKE if you got at least half right!",
  "🎯 Tag a football friend who needs to take this test!",
  "🔥 Challenge a mate — see who scores higher!",
  "⚽ Comment YOUR score and your favorite team!",
  "📲 Hit the bell so you don't miss the next quiz!",
  "💯 Got 10/10? Brag in the comments!",
  "🤯 Which question caught you out? Tell me below!",
  "🙏 Share this with the football fan in your life!",
  "🏆 Comment your team — let's see the loyalties!",
  "📣 Shout-out the BEST footballer in the comments!",
  "👋 New here? Subscribe for more daily football fun!",
  "❤️ Like the video if you enjoyed the challenge!",
  "💡 Which quiz should I make next? Drop ideas below!",
  "🏟️ Comment which league you're from!",
  "🤝 Tag the friend who claims to know everything about football!",
  "🥇 First to comment 10/10 wins bragging rights!",
  "🎮 Want harder ones? Let me know!",
  "🔁 Replay if you weren't sure — no judgement!",
  "🚀 Subscribe to level up your football IQ!",
  "📊 Comment your stats — easy / medium / hard!",
  "🤔 What did you find the hardest part?",
  "💪 Think you can do better next time? Subscribe!",
  "🌟 Drop a ⭐ if you want more like this!",
  "👏 Round of applause for anyone who hit 10/10!",
  "🎁 Bonus quiz coming next — stay tuned!",
  "📌 Save the video to take this test again later!",
  "📺 More quizzes every week — hit subscribe!",
  "✅ Let me know your country in the comments!",
  "🌍 Where are you watching from?",
  "🧠 Test your friends — share this NOW!",
  "🥶 If you scored 10/10 you're him/her!",
  "🍿 Sit back, enjoy, and let's get quizzing!",
];

// ---------------------------------------------------------------------------
// SHORT engagement CTAs for Shorts (one line, punchy). ~20 variants.
// ---------------------------------------------------------------------------
export const SHORT_ENGAGEMENT = [
  "👇 Score in the comments!",
  "Did you get it? 🤔",
  "Subscribe for more! 🔔",
  "Tag a friend! 🏷️",
  "Like if you got it right! 👍",
  "Easy or hard? 💬",
  "Comment your guess! 👇",
  "More quizzes coming! ⚽",
  "Save for later! 📌",
  "Share with a friend! 🔁",
  "10/10? Brag below! 🏆",
  "Follow for daily quizzes! ⚡",
  "Who got it first? 🥇",
  "How fast did YOU solve it?",
  "Drop a 🔥 if you got it!",
  "Round 2? Comment below!",
  "Subscribe — daily quiz drops! 📲",
  "Bet you can't do it again 😏",
  "Hit like = harder next time 😈",
  "Watch till the end! 👀",
];

// ---------------------------------------------------------------------------
// CROSS-PROMO LINES — many variants for the channel-promo block.
// Picks 4–6 random lines per generation.
// ---------------------------------------------------------------------------
export const CROSS_PROMO_LINES = [
  "⚽ Guess the team by lineup",
  "⚽ Guess the player by career path",
  "⚽ Guess the national team by players",
  "⚽ Guess the player by stats",
  "⚽ Guess the team by logo",
  "⚽ Guess the player by photo",
  "⚽ Guess the fake football fact",
  "⚽ Four-clue player quiz",
];

export const CROSS_PROMO_HEADERS = [
  "More football quizzes on the channel:",
  "👉 Other quizzes you'll love:",
  "🎬 You'll also enjoy:",
  "📺 Don't miss these:",
  "⚽ More fun on the channel:",
  "🔥 If you liked this, try these next:",
];

// ---------------------------------------------------------------------------
// HASHTAG POOLS — picks a randomized subset each time.
// ---------------------------------------------------------------------------
export const HASHTAG_CORE = [
  "#football",
  "#soccer",
  "#footballquiz",
  "#soccerquiz",
  "#footballtrivia",
  "#footballfans",
  "#footballchallenge",
  "#footballiq",
  "#ultimatefootballquiz",
  "#guessthefootballer",
  "#footballgame",
  "#footballknowledge",
  "#soccertrivia",
  "#sportsquiz",
  "#footballtest",
  "#fyp",
  "#futbol",
];

export const HASHTAG_SHORTS = [
  "#shorts",
  "#footballshorts",
  "#soccershorts",
  "#shortsfootball",
  "#viralshorts",
  "#shortsvideo",
  "#shortsfeed",
  "#footballtiktok",
  "#soccertiktok",
];

// ---------------------------------------------------------------------------
// SIGN-OFFS — closing channel line, several variants
// ---------------------------------------------------------------------------
export const SIGN_OFFS = [
  "{CHANNEL} {YEAR} — daily football quizzes.",
  "{CHANNEL} — your daily dose of football trivia.",
  "Welcome to {CHANNEL} — the home of football quizzes ({YEAR}).",
  "{CHANNEL} {YEAR}. Subscribe for more.",
  "{CHANNEL} — football quizzes every day. See you tomorrow!",
  "Brought to you by {CHANNEL} ({YEAR}) — daily quizzes, weekly bangers.",
  "{CHANNEL} {YEAR}: where football fans test themselves.",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function pickRandom(arr, n) {
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

export function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function rng(n) {
  return Math.floor(Math.random() * n);
}

// ---------------------------------------------------------------------------
// SHORTS VIRAL TITLE — per-quiz task phrase + a big pool of hooky frames.
// buildShortsTitle() picks a random frame each generate, so Shorts titles are
// near-unique. {TASK} = the task as-is (e.g. "Guess the football team");
// {task} = same with a lowercased first letter (mid-sentence use).
// NOTE: regular (non-Shorts) titles do NOT use this — they stay unchanged.
// ---------------------------------------------------------------------------
export const SHORTS_TITLE_TASKS = {
  "team-by-nat": "Guess the football team",
  "nat-by-club": "Guess the national team",
  "career-path": "Guess the player",
  "career-stats": "Guess the player",
  "four-params": "Guess the player",
  "fake-info": "Spot the FAKE stat",
  "logo-name": "Guess the club badge",
  "player-name": "Guess the player",
};

export const SHORTS_TITLE_FRAMES = [
  "{TASK}? ⚽🔥",
  "Can YOU {task}? 🤔",
  "99% FAIL this quiz 😱 {TASK}!",
  "Only 1% can do this 🧠 {TASK}!",
  "{TASK} in 5 seconds ⏱️🔥",
  "IMPOSSIBLE football quiz 🤯 {TASK}!",
  "Bet you CAN'T 👀 {TASK}!",
  "{TASK} 🤔 Most fans FAIL!",
  "Test your football IQ 🧠 {TASK}!",
  "POV: you try to {task} 😅⚽",
  "{TASK} 🏆 How many can you get?",
  "Real footy fans only 🔥 {TASK}!",
  "{TASK} 😱 You won't get them all!",
  "Think you know football? 🤔 {TASK}!",
  "{TASK} ⚡ Comment your score 👇",
  "Only REAL fans can do this ⚽ {TASK}!",
  "{TASK}?? This one's HARD 😤",
  "How fast can YOU {task}? ⏱️",
  "{TASK} 🔥 Are you a football genius?",
  "Nobody gets these all 😳 {TASK}!",
  "{TASK} 👀 No cheating!",
  "Ultimate football challenge 🏆 {TASK}!",
  "{TASK} ⚽ Casual fans flunk this!",
  "Can you beat this quiz? {TASK} 🔥",
  "{TASK} 🤯 Harder than it looks!",
  "Try to {task} 👇 if you dare!",
  "{TASK} — are you good enough? 😏",
  "Most people fail this 😬 {TASK}!",
];

// Optional extra hashtag appended after the mandatory #shorts (some are empty
// so the tail itself varies too).
export const SHORTS_TITLE_TAILS = ["", " #football", " #soccer", " #footballquiz", " #footyquiz"];
