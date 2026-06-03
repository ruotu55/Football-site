/**
 * BGM playlist — ported from audio.js paths.bgmPlaylist (lines ~74-106).
 * 31 tracks, all repo-relative with "../.Storage/Voices/Ringhton/" prefix.
 */
export const BGM_PLAYLIST: string[] = [
  "../.Storage/Voices/Ringhton/Balada Gitana - House of the Gipsies.mp3",
  "../.Storage/Voices/Ringhton/Bolereando - Quincas Moreira.mp3",
  "../.Storage/Voices/Ringhton/Camargue - House of the Gipsies.mp3",
  "../.Storage/Voices/Ringhton/Chica Linda - Quincas Moreira.mp3",
  "../.Storage/Voices/Ringhton/Crack That Case - Nathan Moore.mp3",
  "../.Storage/Voices/Ringhton/Delta - TrackTribe.mp3",
  "../.Storage/Voices/Ringhton/Disco Knights - Quincas Moreira.mp3",
  "../.Storage/Voices/Ringhton/Estrella - House of the Gipsies.mp3",
  "../.Storage/Voices/Ringhton/Girasol - Quincas Moreira.mp3",
  "../.Storage/Voices/Ringhton/Greaser - TrackTribe.mp3",
  "../.Storage/Voices/Ringhton/Josefina - Quincas Moreira.mp3",
  "../.Storage/Voices/Ringhton/Look Both Ways - Nathan Moore.mp3",
  "../.Storage/Voices/Ringhton/Los Cabos - House of the Gipsies.mp3",
  "../.Storage/Voices/Ringhton/Merengue de Limon - Quincas Moreira.mp3",
  "../.Storage/Voices/Ringhton/Orquidario - Quincas Moreira.mp3",
  "../.Storage/Voices/Ringhton/Paseo - House of the Gipsies.mp3",
  "../.Storage/Voices/Ringhton/Recess - TrackTribe.mp3",
  "../.Storage/Voices/Ringhton/Samba Gitana - House of the Gipsies.mp3",
  "../.Storage/Voices/Ringhton/Sing Swing Bada Bing - Doug Maxwell.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 1 - Los Angeles - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 10 - Austin - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 2 - St. Louis - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 3 - Detroit - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 4 - Tulsa - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 5 - Denver - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 6 - New Orleans - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 8 - Chicago - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Swing Haven 9 - Atlanta - Reed Mathis.mp3",
  "../.Storage/Voices/Ringhton/Up And At Em - Nathan Moore.mp3",
  "../.Storage/Voices/Ringhton/Wager With Angels - Nathan Moore.mp3",
  "../.Storage/Voices/Ringhton/We Got This - Nathan Moore.mp3",
];

/** Extract the basename without extension from a path or plain name. */
function basenameNoExt(pathOrName: string): string {
  return String(pathOrName || "")
    .split("/").pop()!
    .replace(/\.(mp3|wav|ogg|aac|flac)$/i, "");
}

/**
 * Resolve a save's bgmSongs array (array of basenames) to full rel-paths from
 * BGM_PLAYLIST.  Returns up to 5 paths.
 *
 * If bgmSongs is empty (e.g. legacy save or fixture), falls back to the FIRST 5
 * entries of BGM_PLAYLIST — deterministic for rendering.
 */
export function resolveBgmRelPaths(bgmSongs: string[]): string[] {
  if (!bgmSongs || bgmSongs.length === 0) {
    return BGM_PLAYLIST.slice(0, 5);
  }

  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const raw of bgmSongs) {
    if (resolved.length >= 5) break;
    const want = basenameNoExt(raw);
    if (!want) continue;
    const match = BGM_PLAYLIST.find((p) => basenameNoExt(p) === want);
    if (match && !seen.has(match)) {
      seen.add(match);
      resolved.push(match);
    }
  }

  return resolved.slice(0, 5);
}
