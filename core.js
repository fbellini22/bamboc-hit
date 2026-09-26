"use strict";
(function (root) {
  const idPattern = /^[A-Za-z0-9]{22}$/;
  function extractTrackId(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    const uri = /^spotify:track:([A-Za-z0-9]{22})$/i.exec(text);
    if (uri) return uri[1];
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" || url.hostname !== "open.spotify.com" ||
          url.port || url.username || url.password) return null;
      const path = /^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/i.exec(url.pathname);
      return path ? path[1] : null;
    } catch { return null; }
  }
  function validateSongs(songs, currentYear = new Date().getFullYear()) {
    const issues = [], ids = new Map(), entries = new Map();
    if (!Array.isArray(songs)) return [{ severity: "error", code: "dataset", row: 0 }];
    songs.forEach((song, index) => {
      const row = index + 1;
      const add = (code, field, severity = "warning", otherRow) =>
        issues.push({ severity, code, row, id: song?.id, field, otherRow });
      if (!song || typeof song !== "object") { add("entry", null, "error"); return; }
      if (typeof song.id !== "string" || !idPattern.test(song.id)) add("invalid-id", "id", "error");
      for (const field of ["title", "artist", "year"]) {
        const value = song[field];
        if (value === undefined || value === null || String(value).trim() === "") add("missing", field, "error");
        else if (field !== "year" && typeof value !== "string") add("invalid-text", field, "error");
      }
      if (!/^[0-9]{4}$/.test(String(song.year)) || Number(song.year) < 1900 || Number(song.year) > currentYear)
        add("invalid-year", "year", "error");
      for (const field of ["id", "title", "artist", "year"]) {
        const value = song[field];
        if (typeof value !== "string") continue;
        if (value !== value.trim()) add("whitespace", field);
        if (/\s{2,}/.test(value)) add("repeated-space", field);
        if (/\uFFFD|Ã.|Â./.test(value)) add("possible-encoding", field);
      }
      if (typeof song.artist === "string") {
        if (/[;,]/.test(song.artist)) add("artist-separator", "artist");
        if (/^[;,]|[;,]\s*$|[;,]\s*[;,]/.test(song.artist)) add("empty-artist-part", "artist");
        if (song.artist.length > 12 && typeof song.title === "string" &&
            song.title.startsWith(song.artist) && song.title !== song.artist)
          add("possibly-truncated-artist", "artist");
      }
      if (typeof song.title === "string" && /\bCriminalr\b|^un estate\b/i.test(song.title))
        add("possible-title-typo", "title");
      if (song.durationMs !== undefined && (!Number.isFinite(song.durationMs) || song.durationMs <= 0))
        add("invalid-duration", "durationMs", "error");
      if (ids.has(song.id)) add("duplicate-id", "id", "warning", ids.get(song.id));
      else ids.set(song.id, row);
      const key = JSON.stringify([song.title, song.artist, song.year]);
      if (entries.has(key)) add("duplicate-entry", null, "warning", entries.get(key));
      else entries.set(key, row);
    });
    return issues;
  }
  function createCatalog(songs) {
    const issues = validateSongs(songs);
    const invalidRows = new Set(issues.filter(x => x.severity === "error").map(x => x.row));
    const byId = new Map(), conflicts = new Set();
    (Array.isArray(songs) ? songs : []).forEach((song, i) => {
      if (invalidRows.has(i + 1)) return;
      const previous = byId.get(song.id);
      if (previous && ["title", "artist", "year"].some(k => previous[k] !== song[k])) {
        conflicts.add(song.id);
        issues.push({ severity: "error", code: "conflicting-id", row: i + 1, id: song.id });
      } else if (!previous) byId.set(song.id, Object.freeze({ ...song }));
    });
    for (const id of conflicts) byId.delete(id);
    return { issues, size: byId.size, lookup: id => byId.get(id) || null, isConflict: id => conflicts.has(id) };
  }
  function countdown(startedAt, now, durationMs = 45000) {
    const remainingMs = Math.max(0, Math.min(durationMs, durationMs - (now - startedAt)));
    return { remainingMs, seconds: Math.ceil(remainingMs / 1000), progress: remainingMs / durationMs };
  }
  function randomPosition(durationMs, roundMs = 45000, marginMs = 2000, random = Math.random) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
    return Math.floor(random() * Math.max(0, durationMs - roundMs - marginMs));
  }
  const transitions = {
    idle: ["opening"], opening: ["scanning", "idle", "stopping"], scanning: ["preparing", "stopping"],
    preparing: ["playing", "stopping"], playing: ["stopping"],
    stopping: ["revealed", "idle", "stop-error"], "stop-error": ["stopping"], revealed: ["opening"],
  };
  class RoundState {
    constructor() { this.phase = "idle"; }
    move(next) {
      if (!transitions[this.phase]?.includes(next)) throw new Error("Invalid transition: " + this.phase + " -> " + next);
      this.phase = next;
    }
  }
  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  }
  function abortable(promise, signal, timeoutMs, message = "Operazione scaduta.") {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
      const finish = (fn, value) => { cleanup(); fn(value); };
      const abort = () => finish(reject, signal.reason || new Error("Round annullato."));
      // Always attach handlers, even if the operation was already cancelled.
      Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      if (timeoutMs !== undefined) timer = setTimeout(() => finish(reject, new Error(message)), timeoutMs);
    });
  }
  function preplayCountdown(durationMs, onTick, { signal, now = Date.now,
    schedule = setTimeout, unschedule = clearTimeout } = {}) {
    return new Promise((resolve, reject) => {
      const deadline = now() + durationMs;
      let timer;
      const cleanup = () => { unschedule(timer); signal?.removeEventListener("abort", abort); };
      const abort = () => { cleanup(); reject(signal.reason || new Error("Round annullato.")); };
      function tick() {
        const remaining = Math.max(0, deadline - now());
        onTick(Math.ceil(remaining / 1000));
        if (!remaining) { cleanup(); resolve(); }
        else timer = schedule(tick, Math.min(remaining, remaining % 1000 || 1000));
      }
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      tick();
    });
  }
  const core = { extractTrackId, validateSongs, createCatalog, countdown, randomPosition, RoundState,
    withTimeout, abortable, preplayCountdown };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  else { root.Bamboc = root.Bamboc || {}; root.Bamboc.core = core; }
})(globalThis);
