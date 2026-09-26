"use strict";
window.Bamboc = window.Bamboc || {};
window.Bamboc.config = Object.freeze({
  clientId: "1031669a52cf4742b6e908a536a247e5",
  redirectUri: location.hostname === "fbellini22.github.io"
    ? "https://fbellini22.github.io/bamboc-hit/" : location.origin + location.pathname,
  scopes: ["user-read-email", "user-read-private", "user-modify-playback-state",
    "user-read-playback-state", "streaming"],
  roundMs: 45000, endMarginMs: 2000, requestTimeoutMs: 12000,
  preplayMs: 3000, goLabelMs: 700, defaultVolume: 0.8,
  minimumStartMs: 1000, positionToleranceMs: 250, maximumStartDriftMs: 1500,
  readyTimeoutMs: 15000, playbackTimeoutMs: 10000, pollMs: 250,
  refreshMarginMs: 60000,
  debug: new URLSearchParams(location.search).get("debug") === "1",
});
// Keep diagnostic opt-in across Spotify's redirect (whose URI has no query).
window.Bamboc.diagnostics = (() => {
  const key = "bamboc.spotify.diagnostics";
  let enabled = window.Bamboc.config.debug;
  try {
    if (new URLSearchParams(location.search).get("debug") === "0") sessionStorage.removeItem(key);
    else if (enabled) sessionStorage.setItem(key, "1");
    enabled = enabled || sessionStorage.getItem(key) === "1";
  } catch { /* Diagnostics must not affect authentication. */ }
  return (area, event, details = {}) => {
    if (!enabled) return;
    // No Error objects, URLs, response bodies, SDK messages or credentials.
    const safe = { version: "oauth-diag-1" };
    for (const key of ["phase", "type", "status", "present", "ok", "clientId", "redirectUri"])
      if (["string", "number", "boolean"].includes(typeof details[key])) safe[key] = details[key];
    console.debug("[BAMBOC " + area + "] " + event, safe);
  };
})();
