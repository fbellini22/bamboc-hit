"use strict";
(() => {
  const { config } = window.Bamboc;
  const tokenKey = "bamboc.spotify.tokens", pkceKey = "bamboc.spotify.pkce";
  let tokens = null, refreshing = null, sessionEpoch = 0;
  try { tokens = JSON.parse(localStorage.getItem(tokenKey)); } catch { /* Memory-only session. */ }
  class LoginRequired extends Error {}
  function clear() {
    sessionEpoch++;
    tokens = null;
    for (const key of [tokenKey, "access_token", "refresh_token", "token_expires_at", "verifier"]) {
      try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
    }
    try { sessionStorage.removeItem(pkceKey); } catch { /* Storage may be disabled. */ }
  }
  async function tokenRequest(body) {
    const epoch = sessionEpoch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.clientId, ...body }),
      });
      if (epoch !== sessionEpoch) throw new LoginRequired("Sessione annullata. Accedi nuovamente.");
      if (!response.ok) {
        if (response.status === 400 || response.status === 401) {
          clear(); throw new LoginRequired("Sessione Spotify scaduta. Accedi nuovamente.");
        }
        throw new Error("Autenticazione Spotify non disponibile (" + response.status + "). Riprova.");
      }
      const data = await response.json();
      if (epoch !== sessionEpoch) throw new LoginRequired("Sessione annullata. Accedi nuovamente.");
      if (!data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
        throw new Error("Risposta token Spotify non valida.");
      tokens = { accessToken: data.access_token, refreshToken: data.refresh_token || tokens?.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000 };
      try { localStorage.setItem(tokenKey, JSON.stringify(tokens)); } catch { /* Keep token in memory. */ }
      return tokens.accessToken;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Timeout autenticazione Spotify. Riprova.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function getToken(force = false) {
    if (refreshing) return refreshing;
    if (!force && tokens?.accessToken && tokens.expiresAt > Date.now() + config.refreshMarginMs) return tokens.accessToken;
    if (!tokens?.refreshToken) { clear(); throw new LoginRequired("Accedi a Spotify per continuare."); }
    refreshing = tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken })
      .finally(() => { refreshing = null; });
    return refreshing;
  }
  function randomString() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
  }
  async function login() {
    const verifier = randomString(), state = randomString();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    try { sessionStorage.setItem(pkceKey, JSON.stringify({ verifier, state, createdAt: Date.now() })); }
    catch { throw new Error("Abilita l'archiviazione del browser per effettuare il login."); }
    const params = new URLSearchParams({ client_id: config.clientId, response_type: "code",
      redirect_uri: config.redirectUri, scope: config.scopes.join(" "),
      code_challenge_method: "S256", code_challenge: challenge, state });
    window.location.assign("https://accounts.spotify.com/authorize?" + params);
  }
  async function handleRedirect() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code"), error = url.searchParams.get("error");
    if (!code && !error) return;
    let pkce;
    try { pkce = JSON.parse(sessionStorage.getItem(pkceKey)); } catch { /* Checked below. */ }
    const state = url.searchParams.get("state");
    for (const key of ["code", "state", "error", "error_description"]) url.searchParams.delete(key);
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    try { sessionStorage.removeItem(pkceKey); } catch { /* Best effort cleanup. */ }
    if (!pkce?.verifier || !state || state !== pkce.state || !Number.isFinite(pkce.createdAt) ||
        Date.now() - pkce.createdAt > 600000 || pkce.createdAt > Date.now())
      throw new LoginRequired("Login non valido o scaduto. Avvia nuovamente l'accesso.");
    if (error) throw new LoginRequired("Accesso Spotify annullato o rifiutato.");
    await tokenRequest({ grant_type: "authorization_code", code,
      redirect_uri: config.redirectUri, code_verifier: pkce.verifier });
  }
  async function api(path, { method = "PUT", body, signal } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw signal.reason || new Error("Round annullato.");
      const token = await getToken();
      if (signal?.aborted) throw signal.reason || new Error("Round annullato.");
      const controller = new AbortController();
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
        if (error.name === "AbortError") throw new Error("Spotify non risponde. Riprova.");
        throw error;
      } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
      if (signal?.aborted) throw signal.reason || new Error("Round annullato.");
      if (response.status === 401 && attempt === 0) {
        if (tokens?.accessToken === token) await getToken(true);
        continue;
      }
      if (response.ok) return;
      if (response.status === 401) { clear(); throw new LoginRequired("Sessione scaduta. Accedi nuovamente."); }
      const messages = { 403: "Spotify richiede Premium e un account autorizzato per questa app.",
        404: "Dispositivo o traccia Spotify non disponibile.",
        429: "Troppe richieste Spotify. Riprova tra " + (response.headers.get("Retry-After") || "alcuni") + " secondi." };
      const error = new Error(messages[response.status] || "Errore Spotify (" + response.status + "). Riprova.");
      error.status = response.status;
      throw error;
    }
  }
  window.Bamboc.auth = { login, handleRedirect, getToken, api, clear, LoginRequired };
})();
