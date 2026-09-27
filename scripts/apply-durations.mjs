import { readFile, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("song.js", root), "utf8");
const songs = runInNewContext(source + "\nwindow.SONGS", { window: {} });
const evidence = JSON.parse(await readFile(new URL("duration-verification.json", root), "utf8"));
const ids = new Set(songs.map(row => row.id));
if (evidence.length !== ids.size || new Set(evidence.map(row => row.id)).size !== ids.size ||
    evidence.some(row => !ids.has(row.id))) throw new Error("Incomplete or unexpected ID coverage; no dataset changes applied");
const verified = new Map();
for (const row of evidence) {
  if (row.status !== "verified") continue;
  if (!/^[A-Za-z0-9]{22}$/.test(row.id) || row.returnedId !== row.id ||
      row.returnedUri !== "spotify:track:" + row.id ||
      row.source !== "https://open.spotify.com/embed/track/" + row.id ||
      !Number.isSafeInteger(row.durationMs) || row.durationMs <= 0)
    throw new Error("Invalid verification evidence for " + row.id);
  if (verified.has(row.id)) throw new Error("Duplicate verification evidence: " + row.id);
  verified.set(row.id, row.durationMs);
}
// Preserve the source verbatim except the duration field immediately after ID.
const updated = source.replace(/(id: "([A-Za-z0-9]{22})",)(\r?\n)(?:\s*durationMs: [^,]+,\r?\n)?/g,
  (_all, field, id, newline) => field + newline + (verified.has(id) ? "    durationMs: " + verified.get(id) + "," + newline : ""));
const after = runInNewContext(updated + "\nwindow.SONGS", { window: {} });
const editorial = rows => JSON.stringify(rows.map(({ durationMs, ...row }) => row));
if (editorial(songs) !== editorial(after)) throw new Error("Editorial mutation refused");
await writeFile(new URL("song.js", root), updated);
// Keep the same known editorial warnings, with their new non-editorial duration.
const baselineUrl = new URL("data-warnings-baseline.json", root);
const baseline = JSON.parse(await readFile(baselineUrl, "utf8"));
for (const issue of baseline) for (const key of ["song", "otherSong"]) if (issue[key]) {
  if (verified.has(issue[key].id)) issue[key].durationMs = verified.get(issue[key].id);
  else delete issue[key].durationMs;
}
await writeFile(baselineUrl, JSON.stringify(baseline, null, 2) + "\n");
const missing = after.map((song, index) => ({ row: index + 1, id: song.id }))
  .filter(row => !verified.has(row.id));
const report = {
  source: "Spotify public embed structured entity.duration (milliseconds), exact entity.id AND entity.uri match",
  entries: after.length, uniqueIds: new Set(after.map(row => row.id)).size,
  entriesWithVerifiedDuration: after.length - missing.length, uniqueIdsVerified: verified.size,
  missing, failedVerifications: evidence.filter(row => row.status !== "verified"),
  embedUnavailable: evidence.filter(row => row.embedPlayable === false).map(row => ({ id: row.id, durationMs: row.durationMs })),
  editorialConflictStillBlocked: "515XcapFOMtOOiGU31UqNp",
};
await writeFile(new URL("duration-report.json", root), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
