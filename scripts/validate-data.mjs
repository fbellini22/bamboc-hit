import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
export async function validateData({ useBaseline = false } = {}) {
  const root = new URL("../", import.meta.url);
  const coreModule = { exports: {} };
  runInNewContext(await readFile(new URL("core.js", root), "utf8"), { module: coreModule, URL });
  const core = coreModule.exports;
  const source = await readFile(new URL("song.js", root), "utf8");
  const songs = runInNewContext(source + "\nwindow.SONGS", { window: {} });
  const catalog = core.createCatalog(songs);
  const fingerprint = issue => JSON.stringify({ ...issue, song: songs[issue.row - 1],
    otherSong: issue.otherRow ? songs[issue.otherRow - 1] : undefined });
  const baseline = JSON.parse(await readFile(new URL("data-warnings-baseline.json", root), "utf8"));
  const known = new Set(baseline.map(item => JSON.stringify(item)));
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
if (typeof process !== "undefined") await validateData({ useBaseline: process.argv.includes("--baseline") });
