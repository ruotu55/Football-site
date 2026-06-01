#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate the "World Cup" saved script (50 MCQ questions) for runner 9
(Football Quiz - Multiple Choice). Writes the saved-scripts bucket file the
runner pulls on load:  .Storage/storage/saved-scripts/football_quiz_mcq_regular.json

25 trivia (text answers + topic image) + 25 which-player (photo cards),
strictly alternating: Q1 trivia, Q2 player, Q3 trivia, ...
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYER_IMAGES = os.path.join(ROOT, ".Storage", "data", "player-images.json")
OUT = os.path.join(ROOT, ".Storage", "storage", "saved-scripts", "football_quiz_mcq_regular.json")
IMG_DIR_REL = "Images/Quiz/World Cup"

# Country name -> Spanish (only those we use for which-player questions).
COUNTRY_ES = {
    "Argentina": "Argentina", "Uruguay": "Uruguay", "Brazil": "Brasil",
    "Senegal": "Senegal", "Morocco": "Marruecos", "Croatia": "Croacia",
    "Scotland": "Escocia", "Ivory Coast": "Costa de Marfil", "Colombia": "Colombia",
    "Denmark": "Dinamarca", "United States": "Estados Unidos", "Italy": "Italia",
    "Japan": "Japon", "Ghana": "Ghana", "Turkiye": "Turquia", "Ukraine": "Ucrania",
    "Egypt": "Egipto", "Poland": "Polonia", "Norway": "Noruega", "Belgium": "Belgica",
    "Ecuador": "Ecuador", "South Korea": "Corea del Sur", "Australia": "Australia",
    "Austria": "Austria", "Sweden": "Suecia", "South Africa": "Sudafrica",
    "Bosnia And Herzegovina": "Bosnia y Herzegovina", "Israel": "Israel",
}

# ---- 25 TRIVIA QUESTIONS (verified World Cup facts) ----------------------
# Each: question EN/ES, three answers (EN, ES), correct index, image slug.
TRIVIA = [
    ("Who won the very first FIFA World Cup in 1930?",
     "¿Quién ganó el primer Mundial de la FIFA en 1930?",
     [("Uruguay", "Uruguay"), ("Argentina", "Argentina"), ("Brazil", "Brasil")], 0, "first-world-cup-1930"),
    ("Which country has won the most World Cups?",
     "¿Qué país ha ganado más Mundiales?",
     [("Germany", "Alemania"), ("Brazil", "Brasil"), ("Italy", "Italia")], 1, "world-cup-trophy"),
    ("Where was the first World Cup hosted in 1930?",
     "¿Dónde se celebró el primer Mundial en 1930?",
     [("Uruguay", "Uruguay"), ("Italy", "Italia"), ("France", "Francia")], 0, "estadio-centenario"),
    ("How many times has Italy won the World Cup?",
     "¿Cuántas veces ha ganado Italia el Mundial?",
     [("Two", "Dos"), ("Four", "Cuatro"), ("Three", "Tres")], 1, "italy-world-cup"),
    ("Which nations co-host the 2026 World Cup?",
     "¿Qué naciones son anfitrionas del Mundial 2026?",
     [("USA, Canada & Mexico", "EE.UU., Canadá y México"), ("Qatar", "Catar"), ("Brazil", "Brasil")], 0, "world-cup-2026"),
    ("Who won the 2022 World Cup in Qatar?",
     "¿Quién ganó el Mundial 2022 en Catar?",
     [("France", "Francia"), ("Argentina", "Argentina"), ("Croatia", "Croacia")], 1, "argentina-2022"),
    ("Who won the Golden Boot at the 2022 World Cup?",
     "¿Quién ganó la Bota de Oro en el Mundial 2022?",
     [("Lionel Messi", "Lionel Messi"), ("Kylian Mbappé", "Kylian Mbappé"), ("Olivier Giroud", "Olivier Giroud")], 1, "mbappe-2022"),
    ("Who has scored the most World Cup goals ever?",
     "¿Quién ha marcado más goles en la historia del Mundial?",
     [("Cristiano Ronaldo", "Cristiano Ronaldo"), ("Miroslav Klose", "Miroslav Klose"), ("Thomas Müller", "Thomas Müller")], 1, "miroslav-klose"),
    ("How many teams will play in the 2026 World Cup?",
     "¿Cuántas selecciones jugarán el Mundial 2026?",
     [("32", "32"), ("48", "48"), ("24", "24")], 1, "world-cup-2026"),
    ("Who won the 2018 World Cup in Russia?",
     "¿Quién ganó el Mundial 2018 en Rusia?",
     [("Croatia", "Croacia"), ("France", "Francia"), ("Belgium", "Bélgica")], 1, "france-2018"),
    ("Which country hosted the 2014 World Cup?",
     "¿Qué país fue sede del Mundial 2014?",
     [("Brazil", "Brasil"), ("South Africa", "Sudáfrica"), ("Russia", "Rusia")], 0, "brazil-2014"),
    ("Which country hosted the 2010 World Cup?",
     "¿Qué país fue sede del Mundial 2010?",
     [("Germany", "Alemania"), ("South Africa", "Sudáfrica"), ("Brazil", "Brasil")], 1, "south-africa-2010"),
    ("Which country hosted the 2022 World Cup?",
     "¿Qué país fue sede del Mundial 2022?",
     [("Qatar", "Catar"), ("Russia", "Rusia"), ("UAE", "Emiratos Árabes")], 0, "qatar-2022"),
    ("Who scored the famous 'Hand of God' goal in 1986?",
     "¿Quién marcó el famoso gol de 'La Mano de Dios' en 1986?",
     [("Pelé", "Pelé"), ("Diego Maradona", "Diego Maradona"), ("Gabriel Batistuta", "Gabriel Batistuta")], 1, "maradona-1986"),
    ("Which country won the World Cup in 2010?",
     "¿Qué país ganó el Mundial en 2010?",
     [("Netherlands", "Países Bajos"), ("Spain", "España"), ("Germany", "Alemania")], 1, "spain-2010"),
    ("Who won the World Cup as host in 1998?",
     "¿Quién ganó el Mundial como anfitrión en 1998?",
     [("Brazil", "Brasil"), ("France", "Francia"), ("Italy", "Italia")], 1, "france-1998"),
    ("Which nation won its only World Cup in 1966?",
     "¿Qué país ganó su único Mundial en 1966?",
     [("England", "Inglaterra"), ("Netherlands", "Países Bajos"), ("Hungary", "Hungría")], 0, "england-1966"),
    ("How often is the FIFA World Cup held?",
     "¿Cada cuánto se celebra el Mundial de la FIFA?",
     [("Every 2 years", "Cada 2 años"), ("Every 4 years", "Cada 4 años"), ("Every 3 years", "Cada 3 años")], 1, "world-cup-trophy"),
    ("Who won the Golden Ball (best player) at the 2022 World Cup?",
     "¿Quién ganó el Balón de Oro (mejor jugador) en el Mundial 2022?",
     [("Kylian Mbappé", "Kylian Mbappé"), ("Lionel Messi", "Lionel Messi"), ("Luka Modrić", "Luka Modrić")], 1, "messi-2022"),
    ("Which country has played in every World Cup?",
     "¿Qué país ha jugado todos los Mundiales?",
     [("Germany", "Alemania"), ("Brazil", "Brasil"), ("Italy", "Italia")], 1, "brazil-team"),
    ("Who won the 1970 World Cup with Pelé in the team?",
     "¿Quién ganó el Mundial de 1970 con Pelé en el equipo?",
     [("Italy", "Italia"), ("Brazil", "Brasil"), ("West Germany", "Alemania Occidental")], 1, "pele-1970"),
    ("Which country did Germany beat in the 2014 final?",
     "¿A qué país venció Alemania en la final de 2014?",
     [("Brazil", "Brasil"), ("Argentina", "Argentina"), ("Netherlands", "Países Bajos")], 1, "germany-2014"),
    ("In which country was the 2006 World Cup held?",
     "¿En qué país se celebró el Mundial 2006?",
     [("Germany", "Alemania"), ("France", "Francia"), ("Japan", "Japón")], 0, "germany-2006"),
    ("Who won the 2006 World Cup?",
     "¿Quién ganó el Mundial 2006?",
     [("France", "Francia"), ("Italy", "Italia"), ("Germany", "Alemania")], 1, "italy-2006"),
    ("Which player was sent off for a headbutt in the 2006 final?",
     "¿Qué jugador fue expulsado por un cabezazo en la final de 2006?",
     [("Marco Materazzi", "Marco Materazzi"), ("Zinedine Zidane", "Zinedine Zidane"), ("Thierry Henry", "Thierry Henry")], 1, "zidane-2006"),
]

# ---- 25 WHICH-PLAYER QUESTIONS -------------------------------------------
# Only the correct player's name is fixed (must exist in the nationality pool).
# Distractors are auto-chosen from players of OTHER countries (deterministic).
CORRECT_PLAYERS = [
    "Lautaro Martínez",     # Argentina
    "Darwin Núñez",         # Uruguay
    "Lucas Paquetá",        # Brazil
    "Sadio Mané",           # Senegal
    "Brahim Díaz",          # Morocco
    "Ivan Perišić",         # Croatia
    "Scott McTominay",      # Scotland
    "Franck Kessié",        # Ivory Coast
    "Jhon Durán",           # Colombia
    "Kasper Schmeichel",    # Denmark
    "Sergiño Dest",         # United States
    "Mateo Retegui",        # Italy
    "Ko Itakura",           # Japan
    "Antoine Semenyo",      # Ghana
    "Kerem Aktürkoğlu",     # Turkiye
    "Georgiy Sudakov",      # Ukraine
    "Trezeguet",            # Egypt
    "Jakub Kiwior",         # Poland
    "Zeno Debast",          # Belgium
    "Kendry Páez",          # Ecuador
    "Kalidou Koulibaly",    # Senegal
    "Nikola Vlašić",        # Croatia
    "Facundo Pellistri",    # Uruguay
    "Merih Demiral",        # Turkiye
    "Ricardo Pepi",         # United States
]


def load_nationality_pool():
    with open(PLAYER_IMAGES, encoding="utf-8") as f:
        data = json.load(f)
    pool = {}  # name -> {country, photo}
    for key, paths in data.get("nationality", {}).items():
        parts = key.split("|")
        if len(parts) != 3 or not paths:
            continue
        _cont, country, player = parts
        pool[player] = {"country": country, "photo": paths[0].replace("\\", "/")}
    return pool


def localized(en, es):
    return {"english": en, "spanish": es}


def build():
    pool = load_nationality_pool()
    names = list(pool.keys())

    missing = [n for n in CORRECT_PLAYERS if n not in pool]
    if missing:
        print("ERROR: correct players not found in nationality pool:", missing, file=sys.stderr)
        sys.exit(1)

    # Build trivia question objects.
    trivia_q = []
    for (q_en, q_es, answers, correct_idx, slug) in TRIVIA:
        ans = []
        for i, (a_en, a_es) in enumerate(answers):
            ans.append({
                "id": "ABC"[i],
                "text": localized(a_en, a_es),
                "playerKey": None,
                "photoPath": None,
            })
        trivia_q.append({
            "questionType": "trivia",
            "questionText": localized(q_en, q_es),
            "answers": ans,
            "correctAnswerId": "ABC"[correct_idx],
            "topicImage": "%s/%s.jpg" % (IMG_DIR_REL, slug),
            "topicImageSlug": slug,
        })

    # Build which-player question objects (deterministic distractors).
    player_q = []
    for qi, correct_name in enumerate(CORRECT_PLAYERS):
        c_country = pool[correct_name]["country"]
        # pick 2 distractors from other countries, walking the pool deterministically
        distractors = []
        used_countries = {c_country}
        start = (qi * 7 + 3) % len(names)
        i = 0
        while len(distractors) < 2 and i < len(names) * 2:
            cand = names[(start + i) % len(names)]
            i += 1
            cc = pool[cand]["country"]
            if cand == correct_name or cand in distractors:
                continue
            if cc in used_countries:
                continue
            distractors.append(cand)
            used_countries.add(cc)
        trio = [correct_name] + distractors
        # rotate correct position by question index so the answer isn't always 'A'
        rot = qi % 3
        trio = trio[-rot:] + trio[:-rot] if rot else trio
        correct_pos = trio.index(correct_name)
        ans = []
        for i, nm in enumerate(trio):
            ans.append({
                "id": "ABC"[i],
                "text": localized(nm, nm),
                "playerKey": nm,
                "photoPath": pool[nm]["photo"],
            })
        country_es = COUNTRY_ES.get(c_country, c_country)
        player_q.append({
            "questionType": "which-player",
            "questionText": localized(
                "Which of these players plays for %s?" % c_country,
                "¿Cuál de estos jugadores juega para %s?" % country_es,
            ),
            "answers": ans,
            "correctAnswerId": "ABC"[correct_pos],
            "topicImage": None,
        })

    # Interleave: Q1 trivia, Q2 player, Q3 trivia, ...
    questions = []
    for i in range(25):
        questions.append(trivia_q[i])
        questions.append(player_q[i])

    # Assemble levels: 0 logo, 1 intro, 2..51 questions, 52 bonus, 53 outro.
    levels = [{"isLogo": True}, {"isIntro": True}]
    for mcq in questions:
        levels.append({
            "gameMode": "career",
            "squadType": "club",
            "formationId": "3421",
            "displayMode": "club",
            "videoMode": True,
            "careerPlayer": None,
            "careerHistory": [],
            "mcq": mcq,
        })
    levels.append({"isBonus": True})
    levels.append({"isOutro": True})

    script = {
        "name": "World Cup",
        "folder": None,
        "landing": {
            "gameMode": "career",
            "quizType": "football-quiz-mcq",
            "endingType": "think-you-know",
            "easy": "10", "medium": "5", "hard": "3", "impossible": "1",
        },
        "lineup": {"videoMode": True, "totalLevels": "50", "shortsMode": False},
        "transitions": {"effect": "wc-sweep", "random": False},
        "levels": levels,
    }

    store = {"scripts": [script], "folders": [], "folderStates": {}}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)

    n_trivia = sum(1 for q in questions if q["questionType"] == "trivia")
    n_player = sum(1 for q in questions if q["questionType"] == "which-player")
    print("Wrote %s" % OUT)
    print("  %d questions (%d trivia, %d which-player)" % (len(questions), n_trivia, n_player))
    print("  total levels: %d" % len(levels))


if __name__ == "__main__":
    build()
