"use strict";
(() => {
  const { config, core, auth, playback, scanner } = window.Bamboc;
  const catalog = core.createCatalog(window.SONGS);
  const catalogIds = new Set(window.SONGS.map(entry => entry?.id));
  let round = new core.RoundState();
  const el = id => document.getElementById(id);
  let song = null, startedAt = 0, frame = null, deadlineTimer = null;
  let countdownVisible = false, lastCountdownNumber = null;
  let cameraStopped = Promise.resolve(), revealAfterStop = false;
  let spotifyState = "AUTH_REQUIRED", sessionId = 0, connecting = null;
  let roundId = 0, controller = null, leaving = false;
  let pendingCard = null, pendingCameraSafe = false, scanState = "QR_IDLE";
  function canScan() { return spotifyState === "PLAYER_READY" && auth.hasValidToken() && playback.isReady(); }
  function discardPendingCard() {
    if (pendingCard && song === pendingCard) song = null;
    pendingCard = null; pendingCameraSafe = false;
  }
  function scanStatus(state) { scanState = state; }

  function message(text) { el("status").textContent = text; }
  function render() {
    const phase = round.phase;
    const showLogin = ["AUTH_REQUIRED", "AUTHENTICATING"].includes(spotifyState);
    el("login-screen").hidden = !showLogin;
    el("login-btn").disabled = spotifyState === "AUTHENTICATING";
    el("game-screen").hidden = showLogin;
    el("scan-btn").hidden = spotifyState !== "PLAYER_READY" || !["idle", "opening"].includes(phase);
    el("scan-btn").disabled = !canScan() || phase === "opening";
    el("connect-btn").hidden = spotifyState !== "PLAYER_NOT_READY";
    el("connect-btn").disabled = Boolean(connecting) || !["idle", "revealed"].includes(phase);
    el("logout-btn").hidden = spotifyState === "AUTH_REQUIRED";
    el("status").setAttribute("data-spotify-state", spotifyState);
    el("scan-btn").textContent = phase === "opening" ? "APERTURA…"
      : pendingCard && pendingCameraSafe ? "RIPRENDI CARTA" : "SCANSIONA LA CARTA";
    if (pendingCard && !pendingCameraSafe) el("scan-btn").disabled = true;
    el("scanner-container").hidden = phase !== "scanning";
    el("cancel-btn").hidden = !pendingCard && !["opening", "scanning", "preparing"].includes(phase);
    el("cancel-btn").textContent = pendingCard ? "Annulla carta"
      : phase === "preparing" ? "Annulla round" : "Annulla scansione";
    el("preplay").hidden = phase !== "preparing" || !countdownVisible;
    el("timer").hidden = phase !== "playing";
    el("reveal-btn").hidden = phase !== "playing";
    el("reveal-btn").disabled = phase !== "playing";
    el("reset-btn").hidden = !(pendingCard && phase === "idle") && !["revealed", "stopping", "stop-error"].includes(phase);
    el("reset-btn").disabled = phase === "stopping" || (phase === "revealed" && !canScan());
    if (pendingCard && phase === "idle") el("reset-btn").disabled = !pendingCameraSafe || !canScan();
    el("reset-btn").textContent = phase === "stop-error" ? "RIPROVA STOP"
      : phase === "stopping" ? "ARRESTO…" : pendingCard ? "NUOVA CARTA" : "PROSSIMA CARTA";
    const scanPhases = { opening: "QR_OPENING", preparing: "QR_ACCEPTED", playing: "QR_ROUND_ACTIVE",
      stopping: "QR_STOPPING", "stop-error": "QR_STOP_ERROR", revealed: "QR_ROUND_COMPLETE" };
    const actualScanState = pendingCard && ["idle", "stopping", "stop-error"].includes(phase)
      ? phase === "stop-error" ? "QR_CARD_STOP_ERROR" : pendingCameraSafe && phase === "idle" ? "QR_CARD_READY" : "QR_CARD_RECOVERING"
      : scanPhases[phase] || (phase === "scanning" ? scanState : scanState === "QR_CANCELLED" ? scanState : "QR_IDLE");
    el("status").setAttribute("data-scan-state", leaving ? "QR_CLOSED" : actualScanState);
    el("result").hidden = !revealAfterStop;
    el("game-screen").setAttribute("aria-busy", String(["opening", "preparing", "stopping"].includes(phase)));
  }
  function move(phase) { round.move(phase); render(); }
  function report(error) {
    window.Bamboc.browserDiagnostics?.event("app_error", { type: error.diagnosticCode || core.errorCode(error), status: error.status });
    if (error instanceof auth.LoginRequired || core.errorCode(error) === "AUTH_REQUIRED") {
      auth.clear(error); return true;
    }
    message(error.message || "Operazione non riuscita. Riprova.");
    el("status").setAttribute("data-error-code", core.errorCode(error));
    window.Bamboc.diagnostics("PLAYER", "error", { phase: error.phase || "app",
      type: error.diagnosticCode || core.errorCode(error), status: error.status });
    return false;
  }
  function resetSession(error) {
    discardPendingCard(); scanStatus("QR_IDLE");
    ++sessionId; ++roundId; connecting = null;
    controller?.abort(error); controller = null;
    clearTimers(); playback.resetSession();
    round = new core.RoundState(); song = null; revealAfterStop = false;
    el("result").replaceChildren();
    cameraStopped = scanner.stop();
    cameraStopped.catch(() => {}); // A new connection must confirm camera cleanup.
    spotifyState = "AUTH_REQUIRED";
    const loginMessage = error?.message || "Accedi a Spotify per iniziare.";
    const normalLogin = loginMessage === "Accedi a Spotify per iniziare.";
    message(normalLogin ? "" : loginMessage);
    el("status").setAttribute("data-error-code", normalLogin ? "" : "AUTH_REQUIRED");
    render();
  }
  async function connectSpotify(callback = false) {
    if (connecting || leaving) return connecting;
    const epoch = sessionId;
    spotifyState = "AUTHENTICATING"; render();
    message("Verifica accesso a Spotify…");
    const operation = (async () => {
      try {
        if (callback) await auth.handleRedirect();
        if (epoch !== sessionId || leaving) return;
        await auth.getToken();
        if (epoch !== sessionId || leaving) return;
        spotifyState = "PLAYER_CONNECTING"; render(); message("Connessione a Spotify…");
        window.Bamboc.oauthDiagnostics?.event("player_initialization");
        await playback.prepare();
        if (epoch !== sessionId || leaving) return;
        cameraStopped = scanner.stop();
        await core.withTimeout(cameraStopped, config.requestTimeoutMs, "Arresto fotocamera non confermato.");
        if (epoch !== sessionId || leaving) return;
        if (!auth.hasValidToken()) throw new auth.LoginRequired("Accedi a Spotify per iniziare.");
        if (!playback.isReady()) throw new core.SpotifyError("DEVICE_NOT_READY", "Dispositivo Spotify non pronto. Riconnetti Spotify.");
        spotifyState = "PLAYER_READY"; el("status").setAttribute("data-error-code", ""); message("");
        if (pendingCard) { pendingCameraSafe = true; message("Fotocamera arrestata. Premi RIPRENDI CARTA per confermare, oppure annulla."); }
        window.Bamboc.diagnostics("PLAYER", "scan_enabled");
      } catch (error) {
        if (epoch !== sessionId || leaving) return;
        if (report(error)) return;
        spotifyState = "PLAYER_NOT_READY"; playback.disconnect();
      } finally { if (epoch === sessionId && !leaving) render(); }
    })();
    connecting = operation;
    await operation;
    if (connecting === operation) { connecting = null; render(); }
  }
  function traceRound() {
    if (!config.debug) return () => {};
    const start = performance.now();
    return label => {
      if (config.debug) console.debug("[Bamboc performance]", label, Math.round(performance.now() - start) + "ms");
    };
  }
  async function begin() {
    if (leaving || !["idle", "revealed"].includes(round.phase) || spotifyState !== "PLAYER_READY") return;
    if (!canScan()) { await connectSpotify(); return; }
    discardPendingCard(); scanStatus("QR_OPENING");
    const id = ++roundId;
    const trace = traceRound();
    trace("audio activation requested");
    // Preserve user activation: no await before this call.
    const activation = playback.activate();
    move("opening");
    revealAfterStop = false; song = null;
    el("result").replaceChildren();
    render();
    message("Apertura fotocamera…");
    try {
      await activation;
      if (id !== roundId || leaving) return;
      await auth.getToken();
      if (id !== roundId || leaving) return;
      if (!playback.isReady()) throw new core.SpotifyError("DEVICE_NOT_READY", "Dispositivo Spotify non pronto. Riconnetti Spotify.");
      move("scanning");
      scanStatus("QR_WAITING"); render();
      // Transfer and track preparation now belong to the post-QR countdown.
      await scanner.start(text => id === roundId ? onScan(text) : true,
        error => { if (id === roundId && !leaving) report(error); },
        status => {
          if (id !== roundId || leaving || round.phase !== "scanning") return;
          scanStatus(status.code); render();
          message(status.message);
        });
      if (id !== roundId || leaving) return;
      trace("scanner ready");
      window.Bamboc.browserDiagnostics?.event("camera_started", { roundId: id });
      if (round.phase === "scanning") message("Inquadra il QR di una canzone.");
    } catch (error) {
      if (id !== roundId || leaving) return;
      if (report(error)) return;
      const epoch = sessionId;
      if (round.phase === "opening") move("idle");
      else if (round.phase === "scanning") await finish(false);
      if (epoch !== sessionId || leaving) return;
      if (!playback.isReady()) { spotifyState = "PLAYER_NOT_READY"; render(); }
    }
  }
  async function onScan(text) {
    if (round.phase !== "scanning" || leaving) return true;
    if (!canScan()) {
      const epoch = sessionId;
      spotifyState = "PLAYER_NOT_READY"; message("Verifica sessione e connessione Spotify…");
      await finish(false);
      if (epoch === sessionId && !leaving && round.phase === "idle") await connectSpotify();
      return true;
    }
    const trace = traceRound();
    trace("scan detected");
    const timeline = config.debug ? [{ event: "qr_recognized", atMs: Date.now(), monotonicMs: performance.now() }] : [];
    const trackId = core.extractTrackId(text);
    const rejectQR = (code, text) => {
      scanStatus(code); render(); message(text); return false;
    };
    if (!trackId) return rejectQR("QR_INVALID", "QR letto ma non valido: serve un URL o URI Spotify di una traccia.");
    if (catalog.isConflict(trackId)) return rejectQR("QR_DUPLICATE_ID", "QR letto: ID duplicato con dati discordanti nel catalogo. Questa carta non è utilizzabile.");
    const found = catalog.lookup(trackId);
    trace("local lookup");
    if (!found) return catalogIds.has(trackId)
      ? rejectQR("QR_ID_INVALID_ENTRY", "QR letto: la voce del catalogo contiene dati non validi.")
      : rejectQR("QR_ID_ABSENT", "QR letto: ID assente dal catalogo.");
    return startCard(found, trace, timeline);
  }
  async function resumeCard() {
    if (leaving || round.phase !== "idle" || !pendingCard || !pendingCameraSafe) return;
    if (!canScan()) { await connectSpotify(); return; }
    const card = pendingCard, id = ++roundId;
    const activation = playback.activate(); // Explicit click, before any await.
    move("opening");
    try {
      await activation;
      if (id !== roundId || leaving || pendingCard !== card) return;
      await auth.getToken();
      if (id !== roundId || leaving || pendingCard !== card) return;
      if (!canScan()) throw new core.SpotifyError("DEVICE_NOT_READY", "Dispositivo Spotify non pronto. Riconnetti Spotify.");
      // Reuse the existing round transitions; resuming never opens the camera.
      move("scanning");
      await startCard(card, traceRound(), []);
    } catch (error) {
      if (id !== roundId || leaving || report(error)) return;
      if (!playback.isReady()) spotifyState = "PLAYER_NOT_READY";
      move("idle");
    }
  }
  async function startCard(found, trace, timeline) {
    discardPendingCard(); scanStatus("QR_ACCEPTED");
    const id = ++roundId;
    controller = new AbortController();
    const signal = controller.signal;
    song = found;
    countdownVisible = true; lastCountdownNumber = null;
    move("preparing");
    message("Preparati a indovinare!");
    if (navigator.vibrate) navigator.vibrate(60);
    cameraStopped = core.withTimeout(scanner.stop(), config.requestTimeoutMs,
      "Arresto fotocamera non confermato.").catch(error => {
      if (id === roundId && !leaving && !signal.aborted) {
        pendingCard = found; pendingCameraSafe = false;
      }
      throw error;
    });
    window.Bamboc.browserDiagnostics?.event("camera_stop_requested", { roundId: id });
    if (window.Bamboc.browserDiagnostics) cameraStopped.then(() => window.Bamboc.browserDiagnostics?.event("camera_stopped", { roundId: id }),
      () => window.Bamboc.browserDiagnostics?.event("camera_stop_failed", { roundId: id }));
    cameraStopped.catch(() => {}); // Cleanup errors are handled by finish(), not leaked.
    const countdown = core.preplayCountdown(config.preplayMs, seconds => {
      if (id !== roundId || round.phase !== "preparing") return;
      const number = el("preplay-count");
      if (config.debug) timeline.push({ event: seconds ? "countdown_" + seconds : "countdown_elapsed", atMs: Date.now(), monotonicMs: performance.now() });
      if (!seconds) {
        countdownVisible = false;
        el("preplay").hidden = true;
        window.Bamboc.browserDiagnostics?.event("countdown_hidden", { roundId: id });
        message("");
      } else if (seconds !== lastCountdownNumber) {
        lastCountdownNumber = seconds;
        number.textContent = String(seconds);
      }
    }, { signal });
    try {
      // The player starts preparing NOW; the promise is a gate, not a delayed play.
      const readyToStart = Promise.all([countdown, core.withTimeout(cameraStopped,
        config.requestTimeoutMs, "Arresto fotocamera non confermato.")]);
      startedAt = await playback.play(song, trace, { signal, readyToStart, roundId: id, timeline,
      });
      if (id !== roundId || signal.aborted || leaving) return true;
      move("playing");
      window.Bamboc.browserDiagnostics?.event("playback_confirmed", { roundId: id });
      if (config.debug) timeline.push({ event: "ui_playing", atMs: Date.now(), monotonicMs: performance.now() });
      message("");
      tick();
      if (round.phase === "playing")
        deadlineTimer = setTimeout(tick, Math.max(0, config.roundMs - (Date.now() - startedAt)));
    } catch (error) {
      if (id !== roundId || leaving) return true;
      if (report(error)) return true;
      if (!playback.isReady() || ["DEVICE_NOT_READY", "PLAYER_NOT_READY", "NETWORK_ERROR", "PLAYBACK_NOT_CONFIRMED"].includes(core.errorCode(error)))
        spotifyState = "PLAYER_NOT_READY";
      await finish(false, { preserveCard: pendingCard === found });
    }
    return true;
  }
  function clearTimers() {
    countdownVisible = false;
    cancelAnimationFrame(frame); frame = null;
    clearTimeout(deadlineTimer); deadlineTimer = null;
  }
  function tick() {
    if (round.phase !== "playing") return;
    const clock = core.countdown(startedAt, Date.now(), config.roundMs);
    el("countdown").textContent = String(clock.seconds);
    el("timer").setAttribute("aria-label", clock.seconds + " secondi rimanenti");
    el("progress-ring-circle").style.strokeDashoffset = String(2 * Math.PI * 80 * (1 - clock.progress));
    if (clock.remainingMs === 0) { void finish(true); return; }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }
  function showCard() {
    const card = document.createElement("div"); card.className = "card";
    const front = document.createElement("div"); front.className = "card-front";
    front.textContent = "♫"; front.setAttribute("aria-hidden", "true");
    const back = document.createElement("div"); back.className = "card-back";
    for (const [tag, text] of [["h2", song.title], ["p", song.artist], ["p", song.year]]) {
      const node = document.createElement(tag); node.textContent = text; back.append(node);
    }
    card.append(front, back);
    el("result").replaceChildren(card);
    requestAnimationFrame(() => { if (card.isConnected) card.classList.add("flip"); });
  }
  async function finish(reveal, { preserveCard = false } = {}) {
    if (!["opening", "scanning", "preparing", "playing", "stop-error"].includes(round.phase)) return;
    if (!preserveCard) discardPendingCard();
    const previous = round.phase;
    const id = ++roundId;
    clearTimers();
    if (previous !== "stop-error") {
      revealAfterStop = reveal && previous === "playing";
      if (revealAfterStop && song) showCard();
    }
    move("stopping");
    // Invalidate both the countdown and every async continuation before cleanup.
    if (previous === "preparing") controller?.abort(new Error("Round annullato."));
    try {
      await playback.stop();
      if (id !== roundId || leaving) return;
      // A pending permission prompt/start must not leave the UI stuck forever.
      await core.withTimeout(scanner.stop(), config.requestTimeoutMs, "Arresto fotocamera non confermato.");
      if (id !== roundId || leaving) return;
      if (!playback.isReady()) spotifyState = "PLAYER_NOT_READY";
      if (pendingCard) {
        pendingCameraSafe = true;
        message("Fotocamera arrestata. Premi RIPRENDI CARTA per confermare, oppure annulla.");
      }
      move(revealAfterStop ? "revealed" : "idle");
      if (revealAfterStop) el("reset-btn").focus();
    } catch (error) {
      if (id !== roundId || leaving) return;
      move("stop-error");
      message(error.code === "SCANNER_BUSY" ? error.message
        : "Arresto non confermato. Premi RIPROVA STOP prima del prossimo round.");
      window.Bamboc.diagnostics("PLAYER", "error", { phase: "stop",
        type: error.diagnosticCode || core.errorCode(error), status: error.status });
    }
  }
  el("login-btn").addEventListener("click", async () => {
    if (spotifyState !== "AUTH_REQUIRED" || leaving) return;
    const operation = auth.login(); // Clears the old session synchronously before PKCE work.
    const epoch = sessionId;
    spotifyState = "AUTHENTICATING"; render(); message("Apertura login Spotify…");
    try { await operation; } catch (error) {
      if (epoch !== sessionId || leaving) return;
      if (!report(error)) { spotifyState = "AUTH_REQUIRED"; render(); }
    }
  });
  el("connect-btn").addEventListener("click", () => {
    if (spotifyState === "PLAYER_NOT_READY" && ["idle", "revealed"].includes(round.phase)) void connectSpotify();
  });
  el("logout-btn").addEventListener("click", () => { auth.clear(); });
  auth.onInvalidated(resetSession);
  el("scan-btn").addEventListener("click", () => { void (pendingCard ? resumeCard() : begin()); });
  el("cancel-btn").addEventListener("click", () => {
    const hadPending = Boolean(pendingCard);
    discardPendingCard(); scanStatus("QR_CANCELLED");
    render();
    if (hadPending && round.phase === "idle") { message("Carta annullata."); render(); return; }
    if (["opening", "scanning", "preparing", "stop-error"].includes(round.phase)) {
      message("Annullamento…"); void finish(false);
    }
  });
  el("reveal-btn").addEventListener("click", () => {
    if (round.phase === "playing") void finish(true);
  });
  el("reset-btn").addEventListener("click", () => {
    if (round.phase === "preparing") void finish(false);
    else if (round.phase === "stop-error") void finish(revealAfterStop, { preserveCard: Boolean(pendingCard) });
    else void begin();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
    else if (["opening", "scanning", "preparing"].includes(round.phase)) {
      message("Scansione o preparazione annullata mentre la pagina non è visibile.");
      scanStatus("QR_CANCELLED");
      void finish(false);
    }
  });
  playback.onError(error => {
    if (leaving) return;
    if (report(error)) return;
    if (["DEVICE_NOT_READY", "PLAYER_NOT_READY", "NETWORK_ERROR"].includes(core.errorCode(error)) || !playback.isReady())
      spotifyState = "PLAYER_NOT_READY";
    if (round.phase === "preparing" || round.phase === "playing") {
      void finish(round.phase === "playing");
    } else if (["opening", "scanning"].includes(round.phase)) void finish(false);
    render();
  });
  playback.onState(state => {
    if (round.phase === "playing" && (!state || state.paused || !playback.matches(state, song.id))) {
      playback.diagnoseInterruption?.(state);
      message("Riproduzione interrotta."); void finish(true);
    }
  });
  window.addEventListener("pagehide", () => {
    discardPendingCard(); scanStatus("QR_IDLE");
    leaving = true; ++roundId; ++sessionId;
    clearTimers();
    controller?.abort(new Error("Pagina chiusa."));
    void scanner.stop().catch(() => {});
    playback.disconnect();
    render();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  async function boot() {
    window.Bamboc.oauthDiagnostics?.boot();
    render();
    if (catalog.issues.length) {
      console.warn("Bamboc-Hit: " + catalog.issues.length + " segnalazioni dataset. Vedi docs/DATASET_AUDIT.md.");
      if (config.debug) console.table(catalog.issues);
    }
    await connectSpotify(true);
  }
  void boot();
})();
