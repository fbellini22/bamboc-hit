const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");
const song = { id: "1234567890123456789012", title: "Title", artist: "Artist", year: "1975" };

test("invalid conflicting row cannot make a shared QR silently playable", () => {
  for (const entries of [[song, {...song, title: "Other", year: "bad"}],
    [{...song, title: "Other", durationMs: -1}, song]]) {
    const catalog = core.createCatalog(entries);
    assert.equal(catalog.lookup(song.id), null);
    assert.equal(catalog.isConflict(song.id), true);
  }
});
test("baseline identity tolerates moved rows and formal trimming, not editorial changes", async () => {
  const {issueFingerprint} = await import("../scripts/validate-data.mjs");
  const issue = {severity: "warning", code: "artist-separator", row: 4, id: song.id, song};
  assert.equal(issueFingerprint(issue), issueFingerprint({...issue, row: 7, song: {...song, title: "Title "}}));
  for (const field of ["id", "title", "artist", "year"])
    assert.notEqual(issueFingerprint(issue), issueFingerprint({...issue, song: {...song, [field]: "changed"}}));
  assert.notEqual(issueFingerprint(issue), issueFingerprint({...issue, code: "new-problem"}));
});
