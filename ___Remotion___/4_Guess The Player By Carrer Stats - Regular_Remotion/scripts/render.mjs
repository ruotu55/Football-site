// Render a video into the shared Ready Videos tree, grouped by QUIZ then language:
//   ___Remotion___/Ready Videos/<Quiz Name>/<Language>/<save>.mp4
// Usage:  npm run render -- --save "Mixed players 1" --language English --levels All [--fps 60]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSITION_ID = "Guess-The-Player-By-Career-Stats-Regular";
const QUIZ_NAME = "Guess The Player By Career Stats";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const save = arg("save", "Mixed players 1");
const language = arg("language", "English");
const levels = arg("levels", "All");
const fps = arg("fps", "60");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
// "Ready Videos" sits next to the project, inside ___Remotion___/. Grouped by quiz
// then language; the save name is the file (so a quiz can hold many videos).
const outDir = path.resolve(projectDir, "..", "Ready Videos", QUIZ_NAME, language);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${save}.mp4`);

// Pass props via a temp file (avoids cross-platform JSON-on-CLI quoting issues).
const propsFile = path.join(projectDir, "out", ".render-props.json");
fs.mkdirSync(path.dirname(propsFile), { recursive: true });
fs.writeFileSync(propsFile, JSON.stringify({ save, language, levels }));

console.log(`▶ Rendering "${save}" (${language}, levels=${levels}) → ${outFile}`);
// Paths contain spaces ("Ready Videos", "Football Channel") → pass ONE quoted command
// string (shell:true) so the shell parses the quotes; an args array would split on spaces.
const cmd = `npx remotion render ${COMPOSITION_ID} "${outFile}" "--props=${propsFile}"`;
const res = spawnSync(cmd, { cwd: projectDir, stdio: "inherit", shell: true });
process.exit(res.status ?? 0);
