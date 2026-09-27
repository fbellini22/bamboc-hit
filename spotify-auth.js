"use strict";
(() => {
  const { config, core } = window.Bamboc;
  const diagnostic = window.Bamboc.oauthDiagnostics;
  const trace = (event, details) => {
    window.Bamboc.diagnostics("AUTH", event, details);
    diagnostic?.event(event, details);
  };
  const tokenKey = "bamboc.spotify.tokens", pkceKey = "bamboc.spotify.pkce";
  let tokens = null, refreshing = null, sessionEpoch = 0;
  let callbackActive = 0, callbackConsumed = false;
  diagnostic?.event("auth_loaded");
  const invalidated = new Set(), requests = new Set();
  try { tokens = JSON.parse(localStorage.getItem(tokenKey)); } catch { /* Memory-only session. */ }
  class LoginRequired extends core.SpotifyError {
    constructor(message, diagnosticCode = "AUTH_REQUIRED", phase = "session", status) {
      super("AUTH_REQUIRED", message); this.name = "LoginRequired";
      this.diagnosticCode = diagnosticCode; this.phase = phase;
      if (status !== undefined) this.status = status;
    }
  }
  const nonempty = value => typeof value === "string" && value.trim().length > 0;
  function validSession() {
    return tokens && nonempty(tokens.accessToken) && nonempty(tokens.refreshToken) &&
      Number.isSafeInteger(tokens.expiresAt) && tokens.expiresAt >= 0;
  }
  function hasValidToken() { return Boolean(validSession() && tokens.expiresAt > Date.now()); }
  function clear(error = new LoginRequired("Accedi a Spotify per iniziare.")) {
    diagnostic?.event("session_clear", { epoch: sessionEpoch, type: error.diagnosticCode });
    sessionEpoch++;
    tokens = null; refreshing = null;
    for (const request of requests) request.abort();
    requests.clear();
    for (const key of [tokenKey, "access_token", "refresh_token", "token_expires_at", "verifier"]) {
      try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
    }
    try { sessionStorage.removeItem(pkceKey); } catch { /* Storage may be disabled. */ }
    for (const callback of [...invalidated]) callback(error);
  }
  async function tokenRequest(body) {
    const attemptId = diagnostic?.snapshot().attemptId;
    const exchange = body.grant_type === "authorization_code";
    const phase = exchange ? "token_exchange" : "refresh";
    trace(phase + "_start", exchange ? { clientId: config.clientId, redirectUri: config.redirectUri } : {});
    let httpStatus;
    const epoch = sessionEpoch;
    const controller = new AbortController();
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.clientId, ...body }),
      });
      httpStatus = response.status;
      if (epoch !== sessionEpoch) throw new LoginRequired("Sessione annullata. Accedi nuovamente.");
      if (!response.ok) {
        throw new LoginRequired("Autenticazione Spotify non disponibile (" + response.status + "). Accedi nuovamente.",
          exchange ? "TOKEN_EXCHANGE_" + response.status : "REFRESH_FAILED", phase, response.status);
      }
      const data = await response.json();
      if (epoch !== sessionEpoch) throw new LoginRequired("Sessione annullata. Accedi nuovamente.");
      if (!nonempty(data.access_token) || !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
          !nonempty(data.refresh_token || tokens?.refreshToken) ||
          !Number.isSafeInteger(Date.now() + data.expires_in * 1000))
        throw new Error("Risposta token Spotify non valida.");
      tokens = { accessToken: data.access_token, refreshToken: data.refresh_token || tokens?.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000 };
      let stored = false;
      try { localStorage.setItem(tokenKey, JSON.stringify(tokens)); stored = true; } catch { /* Keep token in memory. */ }
      diagnostic?.event("token_saved", { stored, attemptId });
      trace(phase + "_success", { status: response.status, attemptId });
      return tokens.accessToken;
    } catch (error) {
      const failure = error instanceof LoginRequired ? error : new LoginRequired(
        error.name === "AbortError" ? "Timeout autenticazione Spotify. Accedi nuovamente."
          : "Accesso Spotify da rinnovare. Riprova.",
        !exchange ? "REFRESH_FAILED" : httpStatus !== undefined ? "TOKEN_RESPONSE_INVALID" : "TOKEN_EXCHANGE_NETWORK",
        phase, httpStatus);
      trace("error", { phase, type: failure.diagnosticCode, status: failure.status, attemptId });
      diagnostic?.event(phase + "_failure", { type: failure.diagnosticCode, status: failure.status, attemptId });
      if (epoch === sessionEpoch) clear(failure);
      throw failure;
    } finally { clearTimeout(timer); requests.delete(controller); }
  }
  async function getToken(force = false) {
    if (refreshing) return refreshing;
      if (!validSession()) {
      const error = new LoginRequired("Accedi a Spotify per iniziare."); clear(error); throw error;
    }
    if (!force && tokens.expiresAt > Date.now() + config.refreshMarginMs) {
      trace("token_valid"); return tokens.accessToken;
    }
    if (tokens.expiresAt <= Date.now()) trace("error", { phase: "session", type: "TOKEN_EXPIRED" });
    const operation = tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    refreshing = operation;
    const settled = () => { if (refreshing === operation) refreshing = null; };
    operation.then(settled, settled);
    return operation;
  }
  function randomString() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
  }
  async function login() {
    const diagnosticAttemptId = diagnostic?.begin();
    trace("login_start", { clientId: config.clientId, redirectUri: config.redirectUri });
    clear();
    const epoch = sessionEpoch;
    let verifier, state, digest;
    try {
      verifier = randomString(); state = randomString();
      digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    }
    catch {
      trace("error", { phase: "pkce_create", type: "PKCE_CRYPTO_FAILED" });
      throw new LoginRequired("Impossibile creare l'accesso sicuro in questo browser.", "PKCE_CRYPTO_FAILED", "pkce_create");
    }
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (epoch !== sessionEpoch) throw new LoginRequired("Accesso annullato. Riprova il login.");
    try { sessionStorage.setItem(pkceKey, JSON.stringify({ verifier, state, createdAt: Date.now(), diagnosticAttemptId })); }
    catch {
      trace("error", { phase: "pkce_storage", type: "PKCE_STORAGE_FAILED" });
      throw new LoginRequired("Abilita l'archiviazione del browser per effettuare il login.", "PKCE_STORAGE_FAILED", "pkce_storage");
    }
    trace("pkce_created");
    const params = new URLSearchParams({ client_id: config.clientId, response_type: "code",
      redirect_uri: config.redirectUri, scope: config.scopes.join(" "),
      code_challenge_method: "S256", code_challenge: challenge, state });
    trace("redirect_start", { clientId: config.clientId, redirectUri: config.redirectUri });
    try { window.location.assign("https://accounts.spotify.com/authorize?" + params); }
    catch {
      trace("error", { phase: "redirect", type: "OAUTH_REDIRECT_FAILED" });
      throw new LoginRequired("Impossibile aprire il login Spotify.", "OAUTH_REDIRECT_FAILED", "redirect");
    }
  }
  async function handleRedirect() {
    diagnostic?.event("callback_enter", { active: callbackActive, epoch: sessionEpoch });
    if (callbackActive) diagnostic?.event("callback_overlap", { active: callbackActive });
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code"), error = url.searchParams.get("error");
    if (!["code", "state", "error", "error_description"].some(key => url.searchParams.has(key))) {
      diagnostic?.event(callbackConsumed ? "callback_already_consumed" : "callback_absent"); return;
    }
    let pkce;
    let readOk = true, present = false;
    try { const raw = sessionStorage.getItem(pkceKey); present = raw !== null; pkce = JSON.parse(raw); }
    catch { readOk = false; /* Checked below. */ }
    diagnostic?.adopt(pkce?.diagnosticAttemptId);
    trace("callback_detected");
    diagnostic?.event("pkce_read", { ok: readOk, present });
    const state = url.searchParams.get("state");
    diagnostic?.event(nonempty(pkce?.state) ? "state_found" : "state_missing", { stored: nonempty(pkce?.state), returned: nonempty(state) });
    diagnostic?.event(state && state === pkce?.state ? "state_valid" : "state_invalid");
    diagnostic?.event(nonempty(pkce?.verifier) ? "verifier_found" : "verifier_missing");
    diagnostic?.event("transaction_checked", { timestampValid: Number.isFinite(pkce?.createdAt),
      ageMs: Number.isFinite(pkce?.createdAt) ? Date.now() - pkce.createdAt : undefined,
      expired: Number.isFinite(pkce?.createdAt) && Date.now() - pkce.createdAt > 600000,
      future: Number.isFinite(pkce?.createdAt) && pkce.createdAt > Date.now() });
    for (const key of ["code", "state", "error", "error_description"]) url.searchParams.delete(key);
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    diagnostic?.event("callback_url_cleaned");
    let removed = false;
    try { sessionStorage.removeItem(pkceKey); removed = true; } catch { /* Best effort cleanup. */ }
    callbackConsumed = true;
    diagnostic?.event("pkce_removed", { ok: removed });
    const invalid = !nonempty(pkce?.verifier) ? "PKCE_VERIFIER_MISSING"
      : !state || state !== pkce.state ? "OAUTH_STATE_MISMATCH"
      : !Number.isFinite(pkce.createdAt) || Date.now() - pkce.createdAt > 600000 || pkce.createdAt > Date.now()
        ? "OAUTH_TRANSACTION_EXPIRED" : !code && !error ? "OAUTH_CALLBACK_INCOMPLETE" : null;
    if (invalid) {
      trace("error", { phase: "callback_validation", type: invalid });
      const failure = new LoginRequired("Login non valido o scaduto. Avvia nuovamente l'accesso.", invalid, "callback_validation");
      clear(failure); throw failure;
    }
    // Already recorded above for both valid and invalid callbacks.
    window.Bamboc.diagnostics("AUTH", "state_valid"); window.Bamboc.diagnostics("AUTH", "verifier_found");
    if (error) {
      trace("error", { phase: "callback", type: "OAUTH_ACCESS_DENIED" });
      const failure = new LoginRequired("Accesso Spotify annullato o rifiutato.", "OAUTH_ACCESS_DENIED", "callback");
      clear(failure); throw failure;
    }
    // Never retain another session's refresh token when exchanging a new code.
    tokens = null;
    const callbackAttemptId = diagnostic?.snapshot().attemptId;
    callbackActive++;
    try {
      await tokenRequest({ grant_type: "authorization_code", code,
        redirect_uri: config.redirectUri, code_verifier: pkce.verifier });
    } finally { callbackActive--; diagnostic?.event("callback_exit", { active: callbackActive, attemptId: callbackAttemptId }); }
  }
  async function api(path, { method = "PUT", body, signal, onResponse } = {}) {
    const epoch = sessionEpoch;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw signal.reason || new Error("Round annullato.");
      const token = await getToken();
      if (epoch !== sessionEpoch) throw new LoginRequired("Sessione annullata. Accedi nuovamente.");
      if (signal?.aborted) throw signal.reason || new Error("Round annullato.");
      const controller = new AbortController();
      requests.add(controller);
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      let response;
      try {
        response = await fetch("https://api.spotify.com/v1" + path, {
          method, signal: controller.signal,
          headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch (error) {
        if (signal?.aborted) throw signal.reason || new Error("Round annullato.");
        if (epoch !== sessionEpoch) throw new LoginRequired("Sessione annullata. Accedi nuovamente.");
        throw new core.SpotifyError("NETWORK_ERROR", "Connessione a Spotify interrotta. Controlla la rete e riconnetti Spotify.");
      } finally { clearTimeout(timer); requests.delete(controller); signal?.removeEventListener("abort", abort); }
      if (epoch !== sessionEpoch) throw new LoginRequired("Sessione annullata. Accedi nuovamente.");
      if (signal?.aborted) throw signal.reason || new Error("Round annullato.");
      onResponse?.(response.status);
      if (response.status === 401 && attempt === 0) {
        if (tokens?.accessToken === token) await getToken(true);
        continue;
      }
      if (response.ok) return { status: response.status };
      if (response.status === 401) {
        const error = new LoginRequired("Sessione scaduta. Accedi nuovamente.", "AUTH_REQUIRED", "playback_api", 401);
        clear(error); throw error;
      }
      const messages = { 403: "Spotify richiede Premium e un account autorizzato per questa app.",
        404: "Dispositivo o traccia Spotify non disponibile.",
        429: "Troppe richieste Spotify. Riprova tra " + (response.headers.get("Retry-After") || "alcuni") + " secondi." };
      const error = new core.SpotifyError(response.status === 404 ? "DEVICE_NOT_READY" : "PLAYBACK_FAILED",
        messages[response.status] || "Errore Spotify (" + response.status + "). Riprova.");
      error.status = response.status;
      throw error;
    }
  }
  window.Bamboc.auth = { login, handleRedirect, getToken, hasValidToken, api, clear, LoginRequired,
    onInvalidated(callback) { invalidated.add(callback); return () => invalidated.delete(callback); },
  };
})();
