import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { pathToFileURL } from "node:url";
// Row numbers are diagnostic locations, not editorial identity. Only trim the
// purely formal outer spaces already removed from song.js; retain every credit.
export function issueFingerprint(issue) {
  const normalize = song => song && Object.fromEntries(Object.entries(song)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
  return JSON.stringify({ severity: issue.severity, code: issue.code, id: issue.id,
    field: issue.field, song: normalize(issue.song), otherSong: normalize(issue.otherSong) });
}
export async function validateData({ useBaseline = false } = {}) {
  const root = new URL("../", import.meta.url);
  const coreModule = { exports: {} };
  runInNewContext(await readFile(new URL("core.js", root), "utf8"), { module: coreModule, URL });
  const core = coreModule.exports;
  const source = await readFile(new URL("song.js", root), "utf8");
  const songs = runInNewContext(source + "\nwindow.SONGS", { window: {} });
  const catalog = core.createCatalog(songs);
  const fingerprint = issue => issueFingerprint({ ...issue, song: songs[issue.row - 1],
    otherSong: issue.otherRow ? songs[issue.otherRow - 1] : undefined });
  const baseline = JSON.parse(await readFile(new URL("data-warnings-baseline.json", root), "utf8"));
  const known = new Set(baseline.map(issueFingerprint));
  const newIssues = catalog.issues.filter(issue => !known.has(fingerprint(issue)));
  console.log(songs.length + " entries, " + catalog.size + " playable IDs, " + catalog.issues.length +
    " issues (" + catalog.issues.filter(x => x.severity === "error").length + " errors).");
  for (const issue of catalog.issues) console.log(JSON.stringify(issue));
  if (useBaseline) {
    console.log("Known issues retained for human review: " + (catalog.issues.length - newIssues.length) +
      ". New or changed issues: " + newIssues.length + ".");
    if (newIssues.length) throw new Error("New dataset issues: review data and DATASET_AUDIT.md.");
  } else if (catalog.issues.some(issue => issue.severity === "error")) {
    throw new Error("Dataset has editorial conflicts. See DATASET_AUDIT.md. CI accepts only the explicit baseline.");
  }
  return { entries: songs.length, playable: catalog.size, issues: catalog.issues.length, newIssues: newIssues.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await validateData({ useBaseline: process.argv.includes("--baseline") });
