/** Map a repo-relative asset path (as the app uses: "../X" or "Images/..") to a URL
 *  served by run_site.py (which serves the repo root). Encodes each path segment. */
export function assetUrl(relOrAbs: string, assetBase: string): string {
  if (!relOrAbs) return "";
  if (/^https?:\/\//.test(relOrAbs)) return relOrAbs;
  const clean = relOrAbs.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "");
  return `${assetBase}/${clean.split("/").map(encodeURIComponent).join("/")}`;
}
