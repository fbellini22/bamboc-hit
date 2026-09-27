"use strict";
(() => {
  // Temporary, observation-only journal. Never accept URLs, credentials or raw errors.
  const key = "bamboc.oauth.diagnostic.v1";
  const events = new Set(("boot auth_loaded login_start pkce_created redirect_start callback_detected " +
    "callback_enter callback_exit callback_absent callback_already_consumed callback_overlap " +
    "state_found state_missing state_valid state_invalid verifier_found verifier_missing " +
    "pkce_read pkce_removed callback_url_cleaned transaction_checked token_exchange_start " +
    "token_exchange_success token_exchange_failure token_saved token_valid refresh_start " +
    "refresh_success refresh_failure error session_clear player_initialization pagehide pageshow visibility").split(" "));
  const types = new Set(("AUTH_REQUIRED PKCE_VERIFIER_MISSING OAUTH_STATE_MISMATCH OAUTH_TRANSACTION_EXPIRED " +
    "OAUTH_CALLBACK_INCOMPLETE OAUTH_ACCESS_DENIED PKCE_CRYPTO_FAILED PKCE_STORAGE_FAILED " +
    "OAUTH_REDIRECT_FAILED TOKEN_RESPONSE_INVALID TOKEN_EXCHANGE_NETWORK REFRESH_FAILED TOKEN_EXPIRED").split(" "));
  const newId = () => "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  const validId = value => typeof value === "string" && /^d-[a-z0-9]+-[a-z0-9]{1,12}$/.test(value);
  const bootId = newId();
  let attemptId = null, rows = [], failed = false, recovered = false, storageWritable = true;
  let mounted = false, bootCount = 0;
  function sanitize(row) {
    if (!row || !events.has(row.event) || !Number.isFinite(row.at) || Math.abs(row.at) > 8640000000000000) return null;
    const safe = { event: row.event };
    for (const field of ["bootId", "attemptId"]) if (validId(row[field])) safe[field] = row[field];
    for (const field of ["at", "status", "epoch", "ageMs", "active", "bootCount"])
      if (Number.isFinite(row[field])) safe[field] = row[field];
    for (const field of ["ok", "present", "persisted", "stored", "returned", "visible", "expired", "future", "timestampValid", "sameOrigin", "opener"])
      if (typeof row[field] === "boolean") safe[field] = row[field];
    if (types.has(row.type) || /^TOKEN_EXCHANGE_[1-5][0-9]{2}$/.test(row.type || "")) safe.type = row.type;
    if (["session", "token_exchange", "refresh", "callback_validation", "callback", "pkce_create", "pkce_storage", "redirect", "playback_api"].includes(row.phase)) safe.phase = row.phase;
    return safe;
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (Array.isArray(saved?.rows)) {
      rows = saved.rows.slice(-100).map(sanitize).filter(Boolean);
      failed = saved.failed === true; recovered = true;
      if (validId(saved.attemptId)) attemptId = saved.attemptId;
    }
  } catch { storageWritable = false; }
  function snapshot() {
    return { version: "oauth-mobile-1", bootId, attemptId, recovered, storageWritable, failed,
      events: rows.map(row => ({ ...row })) };
  }
  function render() {
    if (!mounted) return;
    const panel = document.getElementById("oauth-diagnostic");
    const output = document.getElementById("oauth-diagnostic-data");
    if (!panel || !output) return;
    panel.hidden = !failed;
    // One event per wrapped line keeps a phone screenshot readable.
    output.textContent = JSON.stringify({ ...snapshot(), events: undefined }, null, 2) + "\n" +
      rows.map(row => new Date(row.at).toISOString() + " " + row.event + " " +
        JSON.stringify({ ...row, at: undefined, event: undefined })).join("\n");
  }
  function event(name, details = {}) {
    const row = sanitize({ ...details, event: name, at: Date.now(), bootId,
      attemptId: details.attemptId === undefined ? attemptId : details.attemptId });
    if (!row) return;
    rows.push(row); rows = rows.slice(-100);
    if (name === "error" && row.type !== "TOKEN_EXPIRED" || name.endsWith("_failure")) failed = true;
    try { sessionStorage.setItem(key, JSON.stringify({ rows, failed, attemptId })); }
    catch { storageWritable = false; }
    render();
  }
  window.Bamboc.oauthDiagnostics = {
    event, snapshot,
    begin() { attemptId = newId(); return attemptId; },
    adopt(id) { attemptId = validId(id) ? id : null; },
    mount() { mounted = true; render(); },
    boot() { event("boot", { bootCount: ++bootCount,
      sameOrigin: new URL(location.href).origin === new URL(window.Bamboc.config.redirectUri).origin,
      opener: Boolean(window.opener) }); },
  };
  window.addEventListener?.("pagehide", e => event("pagehide", { persisted: e.persisted }));
  window.addEventListener?.("pageshow", e => event("pageshow", { persisted: e.persisted }));
  document.addEventListener?.("visibilitychange", () => event("visibility", { visible: !document.hidden }));
})();
