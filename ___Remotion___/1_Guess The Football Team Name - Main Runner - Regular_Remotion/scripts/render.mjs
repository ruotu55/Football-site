// Render a video into the shared Ready Videos tree, grouped by QUIZ then language:
//   ___Remotion___/Ready Videos/<Quiz Name>/<Language>/<save>.mp4
// Usage:  npm run render -- --save "Champion League" --language English --levels All [--fps 60]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSITION_ID = "Guess-The-Football-Team-Name-Regular";
const QUIZ_NAME = "Guess The Football Team Name";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const save = arg("save", "Champion League");
const language = arg("language", "English");
const levels = arg("levels", "All");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
const outDir = path.resolve(projectDir, "..", "Ready Videos", QUIZ_NAME, language);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${save}.mp4`);

const propsFile = path.join(projectDir, "out", ".render-props.json");
fs.mkdirSync(path.dirname(propsFile), { recursive: true });
fs.writeFileSync(propsFile, JSON.stringify({ save, language, levels }));

console.log(`▶ Rendering "${save}" (${language}, levels=${levels}) → ${outFile}`);
const cmd = `npx remotion render ${COMPOSITION_ID} "${outFile}" "--props=${propsFile}"`;
const res = spawnSync(cmd, { cwd: projectDir, stdio: "inherit", shell: true });
process.exit(res.status ?? 0);
