// Plantillas de bloques de descripción para el generador de Nombre y Descripción.
// Versión en español. Mismos exports que description-templates.js — solo cambian
// los textos legibles. Los helpers se reutilizan desde el archivo original.

// ---------------------------------------------------------------------------
// HOOK LINES — frases de apertura. ~50 variantes.
// ---------------------------------------------------------------------------
export const HOOK_LINES = [
  "¡Solo los VERDADEROS fans del fútbol aciertan esto!",
  "¿Crees que sabes de fútbol? Demuéstralo.",
  "¡9 de cada 10 fans FALLAN este quiz!",
  "¿Puedes sacar el 100% en este reto futbolero?",
  "Ni le des al play si no controlas de fútbol.",
  "¡Atención fanáticos del fútbol! A ver qué tal andas.",
  "¡Este es el quiz de fútbol que TODO fan tiene que probar!",
  "La mayoría lo hace MAL — ¿tú lo harás mejor?",
  "Llegó el quiz de fútbol DEFINITIVO. ¿Cuántas aciertas?",
  "Solo para genios del fútbol. ¿Te apuntas?",
  "¡Apuesto a que NO las aciertas todas!",
  "Solo fans de verdad — ¡los novatos que se vayan ya!",
  "¿El quiz de fútbol más difícil de YouTube? ¡Vamos a verlo!",
  "Para de hacer scroll — ¡este es el quiz que NECESITAS!",
  "Test de fútbol IQ — ¿cuál es tu puntuación?",
  "Si te llamas fan del fútbol, TIENES que probar esto.",
  "¡Este quiz va a DESENMASCARAR a los fans falsos!",
  "¿Te crees experto en fútbol? Este quiz te va a bajar los humos.",
  "¡Apuesto a que no superas mi marca!",
  "Leyendas de la trivia futbolera — ¡esto es para TI!",
  "Deja todo lo que estás haciendo — ¡hora del quiz!",
  "¿Cuántas seguidas puedes acertar?",
  "¡Te reto a sacar pleno en este quiz de fútbol!",
  "¡El quiz de fútbol más difícil del año!",
  "Los fans casuales que ni lo intenten 😤",
  "¿Real o falso? ¿Sabes notar la diferencia?",
  "¡Bienvenido al quiz de fútbol que rompió internet!",
  "¡Mide tu cerebro futbolero contra el MUNDO!",
  "Si sacas 10/10 aquí, eres un genio del fútbol.",
  "¡Hora del quiz de fútbol — vamos! 🔥",
  "Sé sincero — ¿cuántas acertaste?",
  "¡Solo las mentes más afiladas sobreviven a esto!",
  "Fan casual vs hardcore — ¡este quiz lo dice todo!",
  "¡Prepárate para el quiz de fútbol más loco hasta ahora!",
  "Llega el rompecabezas futbolero — ¿estás listo?",
  "¡Este quiz separa a las leyendas de los de barrio!",
  "Fans del fútbol, reúnanse — ¡es la hora!",
  "5 segundos por pregunta. Sin Google. ¿Aguantas el ritmo?",
  "Pausa si hace falta — ¡pero nada de trampas! 👀",
  "¿Tu conocimiento futbolero aguanta el ritmo?",
  "No digas que no te avisé — ¡este está difícil!",
  "Fans del fútbol, ¡este es VUESTRO momento!",
  "Solo el 1% top las acierta todas. ¿Eres de esos?",
  "¿Qué tan fan del fútbol eres en realidad?",
  "¡Hora de poner a prueba ese fútbol IQ!",
  "¡Llega el quiz de fútbol más difícil de la temporada!",
  "Fans del fútbol, ¡este quiz está de LOCURA!",
  "¡La mayoría de los casuales suspende este!",
  "¡Solo los ultras las aciertan todas!",
  "Trivia de fútbol 101 — ¡a ver quién se gradúa!",
];

// ---------------------------------------------------------------------------
// SHORT HOOKS para Shorts (más directas, una línea, < 60 chars). ~30 variantes.
// ---------------------------------------------------------------------------
export const SHORT_HOOKS = [
  "¿Lo adivinas? 🤔",
  "¡Solo los fans REALES lo sacan!",
  "¡Apuesto a que fallas esta!",
  "Fans del fútbol, ¡esto es para TI!",
  "¿Cuánto tardas en resolverlo? ⚽",
  "¡Solo el 1% lo acierta! 🔥",
  "¡La mayoría FALLA esto!",
  "¿Fácil o imposible? ¡Tú decides!",
  "¡Hora del quiz — vamos!",
  "¡Pausa si lo necesitas! 👀",
  "¡Solo fans de verdad! ⚽",
  "¿Sacas 10/10?",
  "Test de fútbol IQ 🧠",
  "Comenta tu respuesta 👇",
  "¿La acertaste?? 🤯",
  "¿Muy fácil o muy difícil?",
  "¡Pon a prueba tu cerebro futbolero!",
  "Deja tu respuesta abajo 👇",
  "¿Eres un genio del fútbol?",
  "¿Qué tan rápido lo sacas TÚ?",
  "Quiz de fútbol — ¡VAMOS!",
  "¡No falles esta! 😤",
  "¡El 1% top la acierta!",
  "¿Tan bueno eres? 😏",
  "Los casuales suspenden esta 😬",
  "¡La más difícil hasta ahora! 🔥",
  "¡Adivina antes del cronómetro!",
  "¡Fans del fútbol, reúnanse! ⚽",
  "¡Rápido! ¿Cuál es la respuesta?",
  "Se revela en 3… 2… 1…",
];

// ---------------------------------------------------------------------------
// QUIZ EXPLANATIONS — varias variantes por tipo de quiz.
// ---------------------------------------------------------------------------
export const QUIZ_EXPLANATION = {
  "team-by-nat": [
    "En este quiz tienes que ADIVINAR el equipo de fútbol según las nacionalidades de sus jugadores. Cada ronda te muestra un once completo de un mismo club — ¿el truco? Solo ves sus banderas. ¿Sabes de qué equipo se trata?",
    "Once banderas. Un club de fútbol. ¿Puedes atar cabos y nombrar al equipo detrás de la alineación? El test definitivo para los fans que siguen el mercado de fichajes.",
    "Cada nivel muestra las nacionalidades de todo un once titular de un club real. Sin nombres, sin escudos — solo banderas. Tu misión: nombrar al equipo. ¿Te atreves?",
    "De la Premier League a la Saudi Pro League, este quiz te lanza alineaciones completas usando SOLO las nacionalidades de los jugadores. ¡Adivina el equipo en tiempo récord!",
    "El reto es simple pero BRUTAL: ves el once titular de un club bandera a bandera y gritas el equipo antes que nadie. ¿Puedes hacerlo?",
  ],
  "nat-by-club": [
    "¿Puedes adivinar la SELECCIÓN según los escudos de los clubes de sus jugadores? Cada ronda te muestra el once de una selección — pero solo los clubes en los que juegan. ¡Identifica el país!",
    "Once escudos de clubes. Un país. ¿Sabes a qué selección pertenecen esas estrellas repartidas por todos esos clubes?",
    "Olvídate de las banderas — este quiz mide si sabes dónde juegan de verdad las estrellas internacionales. ¡Descubre la selección detrás de los escudos!",
    "¿Edición Mundial? ¿Edición Eurocopa? Cada ronda suelta la alineación de una selección — pero solo ves escudos de clubes. ¡Identifica el país antes de que acabe el tiempo!",
    "Si controlas los fichajes, este quiz es para ti. Cada nivel muestra un once nacional a través de escudos de clubes — ¡nombra el país!",
  ],
  "career-path": [
    "¡Adivina al FUTBOLISTA por su trayectoria! Cada ronda revela en orden todos los clubes por los que ha pasado el jugador — tu trabajo es nombrar a la leyenda detrás del recorrido.",
    "Real Madrid → Juventus → Manchester United → ??? Cada nivel te lleva por la carrera de un jugador club a club. ¡Nombra al jugador!",
    "De la cantera al retiro, este quiz traza paso a paso la trayectoria de futbolistas reales. ¿Sabes quién es la estrella detrás del viaje?",
    "El quiz de trayectorias más complicado de YouTube — ¡nombra al jugador solo por su historial de clubes! Sin fotos, sin pistas, solo fichajes.",
    "Sigue la carrera, nombra al jugador. Algunas son obvias. Otras te van a destrozar. ¿Estás listo?",
  ],
  "career-stats": [
    "¿Puedes adivinar al jugador solo por sus ESTADÍSTICAS de carrera? Goles, asistencias, partidos, títulos — solo los números cuentan la historia. ¡Nombra al futbolista!",
    "Los números no mienten — ¿pero pueden ayudarte a nombrar al jugador? Goles, asistencias, títulos y más. ¡Descubre a la estrella por sus stats!",
    "¡Solo para fanáticos de las stats! Cada ronda suelta los números de carrera de un jugador — tu trabajo es nombrar al hombre detrás de ellos.",
    "Goles marcados. Títulos levantados. Partidos disputados. ¿Puedes conectar la hoja de stats con el futbolista correcto?",
    "Puros números. Sin caras. Sin clubes. Solo estadísticas de carrera. ¿Adivinas al jugador?",
  ],
  "four-params": [
    "Cuatro pistas. Un jugador. Cada ronda te da el CLUB, la POSICIÓN, el PAÍS y la EDAD — ¡adivina al futbolista detrás de los datos!",
    "Club + posición + país + edad = un futbolista. ¿Puedes descifrar el código en cada nivel?",
    "Cuatro datos. Cientos de jugadores posibles. ¿Puedes dar con el correcto cada vez?",
    "Suena fácil: club, posición, nacionalidad, edad. Pero solo hay UNA respuesta correcta por nivel. ¿Puedes encontrarla?",
    "Combina las cuatro pistas, nombra a la estrella. ¡El test definitivo para los que creen conocer a todos los jugadores!",
  ],
  "fake-info": [
    "¡Detecta el DATO FALSO! Cada ronda te da datos de un futbolista real — pero UNO es mentira. ¿Puedes encontrar la información falsa antes de que acabe el tiempo?",
    "¿Verdadero o falso? Cada nivel mezcla datos reales con una GRAN mentira sobre un futbolista. ¡Encuentra el falso!",
    "Algunos datos son reales. UNO es falso. ¿Sabes notar la diferencia?",
    "Modo detector de mentiras: ACTIVADO. Cada ronda te reta a encontrar la stat falsa escondida entre las reales.",
    "¡No te dejes engañar! Cada nivel mete un dato falso en el perfil de un jugador. ¿Puedes pillarlo?",
  ],
  "logo-name": [
    "¡Adivina el equipo de fútbol por su ESCUDO! Escudos icónicos, insignias modernas, detalles ocultos — ¡nombra al club detrás del emblema!",
    "Escudos, insignias, emblemas — ¿los nombras todos? De logos mundialmente famosos a escudos de segunda división — ¡este quiz lo tiene todo!",
    "¿Qué tan bien conoces los escudos del fútbol? Cada nivel muestra una insignia — ¡tu trabajo es nombrar al club!",
    "De gigantes de la Premier League a equipos sudamericanos desconocidos, este quiz pone a prueba tu ojo para los escudos. ¿Estás listo?",
    "Modo reconocer escudos: ACTIVADO. ¡Nombra al club de fútbol solo por su insignia!",
  ],
  "player-name": [
    "¡Adivina al futbolista por su FOTO! Leyendas, estrellas actuales, joyas ocultas — ¿los nombras a todos?",
    "¿Qué tan bien conoces a los futbolistas? Cada nivel muestra una foto — ¡tú nombras al jugador!",
    "Del debate del GOAT a la nueva generación, este quiz te lanza caras. ¡Nombra a cada futbolista!",
    "Reconocimiento facial para fans del fútbol. ¿Puedes identificar a cada jugador que aparece?",
    "Once caras. Once nombres. ¡Once oportunidades de demostrar que eres un fan de verdad!",
  ],
};

// ---------------------------------------------------------------------------
// FEATURE-BLOCK HEADERS — etiquetas para la sección "en esta ronda"
// ---------------------------------------------------------------------------
export const FEATURE_HEADERS = [
  "🎯 En esta ronda:",
  "⚽ Hoy presentamos:",
  "🔥 En este vídeo:",
  "👀 Lo que hay dentro:",
  "🏟️ La alineación de hoy:",
  "🎬 En este quiz aparece:",
  "📋 Hoy en juego:",
  "🌍 El reto de hoy incluye:",
];

// ---------------------------------------------------------------------------
// SPECIAL-EDITION PHRASINGS para la etiqueta de guion guardado
// ---------------------------------------------------------------------------
export const SPECIAL_EDITION_PHRASES = [
  "🏆 Edición especial: {NAME}",
  "🌟 Temática: {NAME}",
  "🔥 ¡Edición {NAME}!",
  "⭐ Temática de hoy: {NAME}",
  "🎯 ¡Especial {NAME}!",
  "🏅 Serie: {NAME}",
  "💥 {NAME} – ¡el test definitivo!",
];

// ---------------------------------------------------------------------------
// ENGAGEMENT LINES — CTAs / llamadas a la interacción. ~35 variantes.
// ---------------------------------------------------------------------------
export const ENGAGEMENT_LINES = [
  "👇 ¡Deja tu puntuación en los comentarios! ¿Cuántas acertaste TÚ?",
  "💬 ¿Cuál te lió? ¡Cuéntamelo!",
  "🔔 ¡SUSCRÍBETE para quizzes de fútbol todos los días!",
  "👍 ¡Dale LIKE si acertaste al menos la mitad!",
  "🎯 ¡Etiqueta a un amigo futbolero que necesite este test!",
  "🔥 ¡Reta a un amigo — a ver quién saca más!",
  "⚽ ¡Comenta TU puntuación y tu equipo favorito!",
  "📲 ¡Activa la campanita para no perderte el próximo quiz!",
  "💯 ¿Sacaste 10/10? ¡Presume en los comentarios!",
  "🤯 ¿Qué pregunta te pilló? ¡Cuéntamelo abajo!",
  "🙏 ¡Comparte esto con el fan del fútbol de tu vida!",
  "🏆 ¡Comenta tu equipo — a ver esas lealtades!",
  "📣 ¡Nombra al MEJOR futbolista en los comentarios!",
  "👋 ¿Nuevo por aquí? ¡Suscríbete para más fútbol cada día!",
  "❤️ ¡Dale like si disfrutaste el reto!",
  "💡 ¿Qué quiz hago después? ¡Deja ideas abajo!",
  "🏟️ ¡Comenta de qué liga eres!",
  "🤝 ¡Etiqueta al amigo que dice saberlo todo de fútbol!",
  "🥇 ¡El primero que comente 10/10 se lleva la gloria!",
  "🎮 ¿Quieres más difíciles? ¡Avísame!",
  "🔁 ¡Vuelve a verlo si dudaste — sin juzgar!",
  "🚀 ¡Suscríbete y sube de nivel tu fútbol IQ!",
  "📊 ¡Comenta tus stats — fácil / medio / difícil!",
  "🤔 ¿Qué te pareció lo más difícil?",
  "💪 ¿Crees que lo harás mejor la próxima? ¡Suscríbete!",
  "🌟 ¡Deja una ⭐ si quieres más como esto!",
  "👏 ¡Aplausos para quien haya sacado 10/10!",
  "🎁 ¡El próximo trae quiz extra — atento!",
  "📌 ¡Guarda el vídeo para repetir el test luego!",
  "📺 ¡Más quizzes cada semana — dale a suscribir!",
  "✅ ¡Dime de qué país eres en los comentarios!",
  "🌍 ¿Desde dónde nos ves?",
  "🧠 ¡Pon a prueba a tus amigos — comparte AHORA!",
  "🥶 ¡Si sacaste 10/10 eres un crack!",
  "🍿 ¡Relájate, disfruta y a darle al quiz!",
];

// ---------------------------------------------------------------------------
// SHORT engagement CTAs para Shorts (una línea, directas). ~20 variantes.
// ---------------------------------------------------------------------------
export const SHORT_ENGAGEMENT = [
  "👇 ¡Tu puntuación en comentarios!",
  "¿La acertaste? 🤔",
  "¡Suscríbete para más! 🔔",
  "¡Etiqueta a un amigo! 🏷️",
  "¡Like si la acertaste! 👍",
  "¿Fácil o difícil? 💬",
  "¡Comenta tu respuesta! 👇",
  "¡Vienen más quizzes! ⚽",
  "¡Guárdalo para luego! 📌",
  "¡Compártelo con un amigo! 🔁",
  "¿10/10? ¡Presume abajo! 🏆",
  "¡Sígueme para quizzes diarios! ⚡",
  "¿Quién lo sacó primero? 🥇",
  "¿Qué tan rápido lo sacaste TÚ?",
  "¡Deja un 🔥 si la acertaste!",
  "¿Ronda 2? ¡Comenta abajo!",
  "¡Suscríbete — quiz cada día! 📲",
  "Apuesto a que no repites 😏",
  "Like = más difícil la próxima 😈",
  "¡Mira hasta el final! 👀",
];

// ---------------------------------------------------------------------------
// CROSS-PROMO LINES — variantes para el bloque de promo del canal.
// Elige 4–6 líneas al azar por generación.
// ---------------------------------------------------------------------------
export const CROSS_PROMO_LINES = [
  "⚽ Adivina el equipo por la alineación",
  "⚽ Adivina el jugador por su trayectoria",
  "⚽ Adivina la selección por sus jugadores",
  "⚽ Adivina al jugador por sus stats",
  "⚽ Adivina el equipo por el escudo",
  "⚽ Adivina al jugador por su foto",
  "⚽ Detecta el dato falso del fútbol",
  "⚽ Quiz del jugador con cuatro pistas",
];

export const CROSS_PROMO_HEADERS = [
  "Más quizzes de fútbol en el canal:",
  "👉 Otros quizzes que te van a encantar:",
  "🎬 También vas a disfrutar:",
  "📺 No te pierdas estos:",
  "⚽ Más diversión en el canal:",
  "🔥 Si te gustó este, prueba estos:",
];

// ---------------------------------------------------------------------------
// HASHTAG POOLS — elige un subconjunto aleatorio cada vez.
// ---------------------------------------------------------------------------
export const HASHTAG_CORE = [
  "#futbol",
  "#football",
  "#soccer",
  "#quizfutbol",
  "#triviafutbol",
  "#adivinaeljugador",
  "#adivinaelequipo",
  "#retofutbol",
  "#futboliq",
  "#fansdelfutbol",
  "#preguntasdefutbol",
  "#quizdefutbol",
  "#desafiofutbol",
  "#conocimientofutbolero",
  "#testdefutbol",
  "#fyp",
  "#parati",
];

export const HASHTAG_SHORTS = [
  "#shorts",
  "#futbolshorts",
  "#shortsfutbol",
  "#shortsfutbolero",
  "#shortsviral",
  "#shortsvideo",
  "#shortsfeed",
  "#futboltiktok",
  "#quizshorts",
];

// ---------------------------------------------------------------------------
// SIGN-OFFS — frase de cierre del canal, varias variantes
// ---------------------------------------------------------------------------
export const SIGN_OFFS = [
  "{CHANNEL} {YEAR} — quizzes de fútbol todos los días.",
  "{CHANNEL} — tu dosis diaria de trivia futbolera.",
  "Bienvenido a {CHANNEL} — la casa de los quizzes de fútbol ({YEAR}).",
  "{CHANNEL} {YEAR}. Suscríbete para más.",
  "{CHANNEL} — quizzes de fútbol cada día. ¡Nos vemos mañana!",
  "Te lo trae {CHANNEL} ({YEAR}) — quizzes diarios, joyitas cada semana.",
  "{CHANNEL} {YEAR}: donde los fans del fútbol se ponen a prueba.",
];

// ---------------------------------------------------------------------------
// Helpers — reutilizados del módulo en inglés (son agnósticos del idioma).
// ---------------------------------------------------------------------------
export { pickRandom, pickOne, rng } from "./description-templates.js";

// ---------------------------------------------------------------------------
// TÍTULO VIRAL PARA SHORTS — frase de tarea por quiz + un gran banco de frases
// gancho. buildShortsTitle() elige una frase al azar cada vez, así los títulos
// de Shorts son casi únicos. {TASK} = la tarea tal cual; {task} = igual con la
// primera letra en minúscula (uso a mitad de frase).
// ---------------------------------------------------------------------------
export const SHORTS_TITLE_TASKS = {
  "team-by-nat": "Adivina el equipo",
  "nat-by-club": "Adivina la selección",
  "career-path": "Adivina el jugador",
  "career-stats": "Adivina el jugador",
  "four-params": "Adivina el jugador",
  "fake-info": "Encuentra el dato FALSO",
  "logo-name": "Adivina el escudo",
  "player-name": "Adivina el jugador",
};

// Infinitive form for mid-sentence use ({task}) — e.g. "¿Puedes adivinar...?".
// (English doesn't need this; its lowercased imperative reads fine.)
export const SHORTS_TITLE_TASKS_INF = {
  "team-by-nat": "adivinar el equipo",
  "nat-by-club": "adivinar la selección",
  "career-path": "adivinar el jugador",
  "career-stats": "adivinar el jugador",
  "four-params": "adivinar el jugador",
  "fake-info": "encontrar el dato FALSO",
  "logo-name": "adivinar el escudo",
  "player-name": "adivinar el jugador",
};

export const SHORTS_TITLE_FRAMES = [
  "¿{TASK}? ⚽🔥",
  "¿Puedes {task}? 🤔",
  "¡El 99% FALLA! {TASK} 😱",
  "Solo el 1% puede 🧠 ¡{TASK}!",
  "{TASK} en 5 segundos ⏱️🔥",
  "Quiz de fútbol IMPOSIBLE 🤯 ¡{TASK}!",
  "¿A que NO puedes? 👀 ¡{TASK}!",
  "{TASK} 🤔 ¡Casi todos fallan!",
  "Pon a prueba tu IQ futbolero 🧠 ¡{TASK}!",
  "POV: intentas {task} 😅⚽",
  "{TASK} 🏆 ¿Cuántos aciertas?",
  "Solo para verdaderos fans 🔥 ¡{TASK}!",
  "{TASK} 😱 ¡No las aciertas todas!",
  "¿Sabes de fútbol? 🤔 ¡{TASK}!",
  "{TASK} ⚡ Comenta tu marcador 👇",
  "Solo los FANS reales pueden ⚽ ¡{TASK}!",
  "¿{TASK}?? ¡Está DIFÍCIL! 😤",
  "¿Qué tan rápido puedes {task}? ⏱️",
  "{TASK} 🔥 ¿Eres un genio del fútbol?",
  "Nadie las acierta todas 😳 ¡{TASK}!",
  "{TASK} 👀 ¡Sin trampas!",
  "El reto de fútbol definitivo 🏆 ¡{TASK}!",
  "{TASK} ⚽ ¡Los fans casuales fallan!",
  "¿Puedes con este quiz? {TASK} 🔥",
  "{TASK} 🤯 ¡Más difícil de lo que parece!",
  "Intenta {task} 👇 ¡si te atreves!",
  "{TASK} — ¿eres lo bastante bueno? 😏",
  "Casi todos fallan 😬 ¡{TASK}!",
];

export const SHORTS_TITLE_TAILS = ["", " #futbol", " #futbolquiz", " #quizfutbol"];
