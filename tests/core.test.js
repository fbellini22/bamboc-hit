const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");
const song = { id: "1234567890123456789012", title: "Title", artist: "Artist", year: "1975" };
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const fixture = require("./fixtures/original-qr-payloads.json");
const songs = vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../song.js"), "utf8") + ";window.SONGS", { window: {} });
const catalog = core.createCatalog(songs);
const aliasA = "AAAAAAAAAAAAAAAAAAAAAA", aliasB = "BBBBBBBBBBBBBBBBBBBBBB";

test("invalid conflicting row cannot make a shared QR silently playable", () => {
  for (const entries of [[song, {...song, title: "Other", year: "bad"}],
    [{...song, title: "Other", durationMs: -1}, song]]) {
    const catalog = core.createCatalog(entries);
    assert.equal(catalog.lookup(song.id), null);
    assert.equal(catalog.isConflict(song.id), true);
  }
});

for (const [alias, canonical] of fixture.approvedAliases) {
  test("approved QR alias preserves complete canonical record: " + alias, () => {
    const expected = songs.find(row => row.id === canonical);
    assert.ok(expected);
    assert.strictEqual(catalog.lookup(alias), catalog.lookup(canonical));
    assert.deepEqual(JSON.parse(JSON.stringify(catalog.lookup(alias))), JSON.parse(JSON.stringify(expected)));
    assert.ok(Object.isFrozen(catalog.lookup(alias)));
    for (const id of [alias, canonical]) {
      for (const payload of ["spotify:track:" + id, " SPOTIFY:TRACK:" + id + " ",
        "https://open.spotify.com/track/" + id,
        " https://open.spotify.com/intl-it/track/" + id + "/?si=original&utm_source=copy-link#fragment "]) {
        assert.strictEqual(catalog.lookup(core.extractTrackId(payload)), catalog.lookup(canonical));
      }
    }
  });
}

test("all 363 payloads decoded from the original PDF resolve to the approved record", () => {
  assert.equal(fixture.cards.length, 363);
  assert.equal(new Set(fixture.cards.map(card => card.page + "/" + card.position)).size, 363);
  assert.equal(new Set(fixture.cards.map(card => card.payload)).size, 363);
  for (const card of fixture.cards) {
    const result = catalog.lookup(core.extractTrackId(card.payload));
    assert.ok(result, "Unrecognized original QR: " + card.page + "/" + card.position);
    assert.equal(result.id, card.expectedCanonicalId);
  }
});

test("Grosseto is a new verified canonical record, not an alias", () => {
  const record = catalog.lookup("3WG7xz0rYy49I1MhDrAgxY");
  assert.deepEqual(JSON.parse(JSON.stringify(record)), {
    id: "3WG7xz0rYy49I1MhDrAgxY", durationMs: 131317,
    title: "Grosseto (Inno grosseto)", artist: "Tony D", year: "2012",
  });
  assert.equal(catalog.size, 360);
  assert.equal(catalog.isConflict(record.id), false);
  assert.equal(catalog.issues.filter(issue => issue.severity === "error").length, 0);
});

test("existing 359 records and 347 duration verifications are unchanged", () => {
  const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(songs.length, fixture.priorCatalog.entries + 1);
  assert.equal(digest(songs.slice(0, fixture.priorCatalog.entries)), fixture.priorCatalog.sha256);
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, "../duration-verification.json"), "utf8"));
  assert.equal(evidence.length, fixture.priorDurationEvidence.entries + 1);
  assert.equal(digest(evidence.slice(0, fixture.priorDurationEvidence.entries)), fixture.priorDurationEvidence.sha256);
  const proof = evidence.at(-1);
  assert.equal(proof.id, "3WG7xz0rYy49I1MhDrAgxY");
  assert.equal(proof.returnedId, proof.id);
  assert.equal(proof.returnedUri, "spotify:track:" + proof.id);
  assert.equal(proof.durationMs, 131317);
  assert.equal(proof.status, "verified");
});

test("only the six approved aliases are enabled; unknown IDs and unsupported payloads remain rejected", () => {
  assert.deepEqual(core.spotifyAliases, fixture.approvedAliases);
  assert.equal(catalog.lookup(aliasA), null);
  for (const payload of [aliasA, "https://spotify.link/example", "spotify:album:" + aliasA,
    "http://open.spotify.com/track/" + aliasA, "https://open.spotify.com/track/" + aliasA]) {
    assert.equal(catalog.lookup(core.extractTrackId(payload)), null);
  }
  for (const [alias] of fixture.approvedAliases) assert.equal(catalog.lookup(alias.toLowerCase()), null);
});

const invalidConfigurations = [
  ["duplicate alias", [[aliasA, song.id], [aliasA, song.id]], "duplicate-alias"],
  ["two destinations", [[aliasA, song.id], [aliasA, aliasB]], "duplicate-alias"],
  ["canonical collision", [[song.id, aliasB]], "alias-canonical-collision"],
  ["chain", [[aliasA, aliasB], [aliasB, song.id]], "alias-chain-or-cycle"],
  ["cycle", [[aliasA, aliasB], [aliasB, aliasA]], "alias-chain-or-cycle"],
  ["self alias", [[aliasA, aliasA]], "alias-chain-or-cycle"],
  ["missing destination", [[aliasA, aliasB]], "alias-target-unavailable"],
  ["malformed ID", [["bad", song.id]], "invalid-alias"],
  ["malformed pair", [[aliasA, song.id, aliasB]], "invalid-alias"],
  ["non-list configuration", {}, "invalid-alias-list"],
];
for (const [name, aliases, code] of invalidConfigurations) {
  test("invalid alias configuration fails closed: " + name, () => {
    const result = core.createCatalog([song], aliases);
    assert.ok(result.issues.some(issue => issue.code === code && issue.severity === "error"));
    assert.equal(result.lookup(aliasA), null);
    assert.equal(result.lookup(aliasB), null);
    assert.equal(result.lookup(song.id).title, song.title);
  });
}

test("aliases cannot bypass an invalid or conflicting canonical destination", () => {
  for (const entries of [[{...song, year:"invalid"}], [song, {...song, title:"Other"}]]) {
    const result = core.createCatalog(entries, [[aliasA, song.id]]);
    assert.equal(result.lookup(aliasA), null);
    assert.equal(result.lookup(song.id), null);
    assert.ok(result.issues.some(issue => issue.code === "alias-target-unavailable"));
  }
});

test("one alias configuration error disables other aliases instead of partially applying the list", () => {
  const result = core.createCatalog([song], [[aliasA, song.id], [aliasB, "invalid"]]);
  assert.equal(result.lookup(aliasA), null);
  assert.equal(result.lookup(song.id).id, song.id);
});

test("alias cannot replace another valid canonical song", () => {
  const other = {...song, id:aliasB, title:"Other"};
  const result = core.createCatalog([song, other], [[song.id, other.id]]);
  assert.ok(result.issues.some(issue => issue.code === "alias-canonical-collision"));
  assert.equal(result.lookup(song.id).title, song.title);
  assert.equal(result.lookup(other.id).title, other.title);
});

test("duplicate alias targeting two valid songs never silently selects the last destination", () => {
  const other = {...song, id:aliasB, title:"Other"};
  const result = core.createCatalog([song, other], [[aliasA, song.id], [aliasA, other.id]]);
  assert.ok(result.issues.some(issue => issue.code === "duplicate-alias"));
  assert.equal(result.lookup(aliasA), null);
  assert.equal(result.size, 2);
});
test("baseline identity tolerates moved rows and formal trimming, not editorial changes", async () => {
  const {issueFingerprint} = await import("../scripts/validate-data.mjs");
  const issue = {severity: "warning", code: "artist-separator", row: 4, id: song.id, song};
  assert.equal(issueFingerprint(issue), issueFingerprint({...issue, row: 7, song: {...song, title: "Title "}}));
  for (const field of ["id", "title", "artist", "year"])
    assert.notEqual(issueFingerprint(issue), issueFingerprint({...issue, song: {...song, [field]: "changed"}}));
  assert.notEqual(issueFingerprint(issue), issueFingerprint({...issue, code: "new-problem"}));
});
