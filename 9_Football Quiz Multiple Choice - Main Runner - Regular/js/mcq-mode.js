/* Football Quiz — Multiple Choice (A/B/C) mode.
 *
 * Two alternating question styles, both driven by `state.mcq`:
 *   - "trivia"        → a topic image + three TEXT answer rows (A/B/C)
 *   - "which-player"  → three player PHOTO cards (A/B/C)
 *
 * `state.mcq` shape (frozen into the saved script per level):
 *   {
 *     questionType: "trivia" | "which-player",
 *     questionText: { english, spanish },
 *     answers: [ { id:"A", text:{english,spanish}, playerKey, photoPath }, ... x3 ],
 *     correctAnswerId: "A",
 *     topicImage: "Images/Quiz/World Cup/<slug>.webp" | null
 *   }
 *
 * Rendering is isolated from the career/pitch pipeline: renderCareer() early-returns
 * into renderMcqQuestion() so none of the silhouette/formation logic runs.
 */

import { appState, getState } from "./state.js";

export const MCQ_QUIZ_TYPE = "football-quiz-mcq";
const RUNNER_VARIANT = "Football Quiz MCQ";
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
const SUPPORTED_LANGUAGES = ["english", "spanish"];

export function isMcqQuiz() {
  return String(appState.els?.inQuizType?.value || "") === MCQ_QUIZ_TYPE;
}

export function getMcq(state) {
  const s = state || getState();
  const mcq = s && s.mcq;
  if (!mcq || typeof mcq !== "object") return null;
  return mcq;
}

export function hasMcqQuestion(state) {
  const mcq = getMcq(state);
  return !!(mcq && Array.isArray(mcq.answers) && mcq.answers.length > 0);
}

function getCurrentLanguage() {
  try {
    const stored = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase();
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : "english";
  } catch { return "english"; }
}

/** Resolve a {english,spanish} (or plain string) localized field for the active language. */
export function localized(field, lang = getCurrentLanguage()) {
  if (field == null) return "";
  if (typeof field === "string") return field;
  return String(field[lang] || field.english || "").trim();
}

/* ── Voice slug. Keep identical to run_site.py `_mcq_slug` so generated files
     are found at playback time. ASCII, lowercase, hyphen-separated. */
export function mcqSlug(text) {
  const s = String(text || "")
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "") // drop non-ASCII (incl. combining accent marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 80) || "untitled";
}

function mcqVoiceUrl(kind, text, lang) {
  const slug = mcqSlug(text);
  if (!slug) return "";
  const segs = [".Storage", "Voices", "MCQ", RUNNER_VARIANT, lang, kind, slug + ".mp3"];
  return "../" + segs.map(encodeURIComponent).join("/");
}

function langAwareVoiceCandidates(kind, textByLang) {
  const lang = getCurrentLanguage();
  const text = localized(textByLang, lang);
  if (!text) return [];
  if (lang === "english") return [mcqVoiceUrl(kind, text, "english")].filter(Boolean);
  const out = [mcqVoiceUrl(kind, text, lang)];
  const enText = localized(textByLang, "english");
  if (enText) out.push(mcqVoiceUrl(kind, enText, "english"));
  return out.filter(Boolean);
}

export function mcqQuestionVoiceCandidates(state) {
  const mcq = getMcq(state);
  if (!mcq) return [];
  return langAwareVoiceCandidates("questions", mcq.questionText);
}

export function mcqAnswerVoiceCandidates(state) {
  const mcq = getMcq(state);
  if (!mcq) return [];
  const ans = (mcq.answers || []).find((a) => a && a.id === mcq.correctAnswerId);
  if (!ans) return [];
  return langAwareVoiceCandidates("answers", ans.text);
}

/* ── Image URL (project-relative path → runner-relative). ── */
function assetUrl(path) {
  const clean = String(path || "").replace(/^\.?\/+/, "");
  if (!clean) return "";
  return "../" + clean.split("/").map(encodeURIComponent).join("/");
}

/* ── Rendering ────────────────────────────────────────────────────── */

function buildAnswerRow(ans, lang, isCorrect) {
  const row = document.createElement("div");
  row.className = "mcq-answer";
  row.dataset.answerId = ans.id;
  if (isCorrect) row.classList.add("mcq-answer--correct");

  const letter = document.createElement("span");
  letter.className = "mcq-letter";
  letter.textContent = ans.id;

  const text = document.createElement("span");
  text.className = "mcq-text";
  text.textContent = (localized(ans.text, lang) || "").toUpperCase();

  row.appendChild(letter);
  row.appendChild(text);
  return row;
}

function buildPlayerCard(ans, lang, isCorrect) {
  const card = document.createElement("div");
  card.className = "mcq-answer mcq-pcard";
  card.dataset.answerId = ans.id;
  if (isCorrect) card.classList.add("mcq-answer--correct");

  const badge = document.createElement("span");
  badge.className = "mcq-badge";
  badge.textContent = ans.id;

  const photoWrap = document.createElement("div");
  photoWrap.className = "mcq-pcard-photo";
  if (ans.photoPath) {
    const img = document.createElement("img");
    img.src = assetUrl(ans.photoPath);
    img.alt = "";
    img.loading = "eager";
    img.decoding = "async";
    photoWrap.appendChild(img);
  } else {
    photoWrap.classList.add("mcq-pcard-photo--empty");
  }

  const name = document.createElement("div");
  name.className = "mcq-pcard-name";
  name.textContent = (localized(ans.text, lang) || "").toUpperCase();

  card.appendChild(badge);
  card.appendChild(photoWrap);
  card.appendChild(name);
  return card;
}

/** Build the MCQ question UI into #career-wrap. Called from renderCareer(). */
export function renderMcqQuestion(state) {
  const wrap = document.getElementById("career-wrap");
  if (!wrap) return;
  document.body.classList.add("mcq-mode");

  const mcq = getMcq(state);
  wrap.innerHTML = "";
  if (!mcq || !Array.isArray(mcq.answers) || mcq.answers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mcq-stage mcq-stage--empty";
    empty.textContent = "No question data for this level.";
    wrap.appendChild(empty);
    return;
  }

  const lang = getCurrentLanguage();
  const isPlayers = mcq.questionType === "which-player";
  const revealing = document.body.classList.contains("mcq-reveal");

  const stage = document.createElement("div");
  stage.className = "mcq-stage " + (isPlayers ? "mcq-stage--players" : "mcq-stage--trivia");

  const question = document.createElement("div");
  question.className = "mcq-question";
  question.textContent = (localized(mcq.questionText, lang) || "").toUpperCase();
  stage.appendChild(question);

  if (isPlayers) {
    const cards = document.createElement("div");
    cards.className = "mcq-player-cards";
    for (const ans of mcq.answers) {
      cards.appendChild(buildPlayerCard(ans, lang, revealing && ans.id === mcq.correctAnswerId));
    }
    stage.appendChild(cards);
  } else {
    const body = document.createElement("div");
    body.className = "mcq-trivia-body";

    const topic = document.createElement("div");
    topic.className = "mcq-topic-card";
    if (mcq.topicImage) {
      const img = document.createElement("img");
      img.className = "mcq-topic-img";
      img.src = assetUrl(mcq.topicImage);
      img.alt = "";
      img.loading = "eager";
      img.decoding = "async";
      topic.appendChild(img);
    } else {
      topic.classList.add("mcq-topic-card--empty");
    }

    const answers = document.createElement("div");
    answers.className = "mcq-answers";
    for (const ans of mcq.answers) {
      answers.appendChild(buildAnswerRow(ans, lang, revealing && ans.id === mcq.correctAnswerId));
    }

    body.appendChild(topic);
    body.appendChild(answers);
    stage.appendChild(body);
  }

  wrap.appendChild(stage);
}

/** Reveal the correct answer in-place (no re-render): add the body flag + highlight. */
export function mcqApplyReveal() {
  const mcq = getMcq();
  if (!mcq) return;
  document.body.classList.add("mcq-reveal");
  const wrap = document.getElementById("career-wrap");
  if (!wrap) return;
  wrap.querySelectorAll(".mcq-answer").forEach((el) => {
    el.classList.toggle("mcq-answer--correct", el.dataset.answerId === mcq.correctAnswerId);
  });
}

export function mcqClearReveal() {
  document.body.classList.remove("mcq-reveal");
}
