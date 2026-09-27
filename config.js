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
// Errors remain actionable; detailed console traces require an explicit URL opt-in.
window.Bamboc.diagnostics = (() => {
  const enabled = window.Bamboc.config.debug;
  return (area, event, details = {}) => {
    const important = event === "error" || event === "round_failed";
    if (!enabled && !important) return;
    // No Error objects, URLs, response bodies, SDK messages or credentials.
    const safe = { version: "oauth-diag-1" };
    for (const key of ["phase", "type", "status", "present", "ok", "clientId", "redirectUri", "roundId", "atMs", "monotonicMs"])
      if (["string", "number", "boolean"].includes(typeof details[key])) safe[key] = details[key];
    const output = important ? console.warn : console.debug;
    output.call(console, "[BAMBOC " + area + "] " + event, safe);
  };
})();
