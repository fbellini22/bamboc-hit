"use strict";
(() => {
  const { config, core, auth, playback, scanner } = window.Bamboc;
  const catalog = core.createCatalog(window.SONGS);
  const round = new core.RoundState();
  const el = id => document.getElementById(id);
  let song = null, startedAt = 0, frame = null, deadlineTimer = null, goTimer = null;
  let cameraStopped = Promise.resolve(), revealAfterStop = false, authenticated = false;
  let booting = true, roundId = 0, controller = null, leaving = false;

  function message(text) { el("status").textContent = text; }
  function render() {
    const phase = round.phase;
    el("login-screen").hidden = authenticated;
    el("game-screen").hidden = !authenticated;
    el("scan-btn").hidden = !["idle", "opening"].includes(phase);
    el("scan-btn").disabled = booting || phase === "opening";
    el("scan-btn").textContent = phase === "opening" ? "APERTURA…" : "SCAN";
    el("scanner-container").hidden = phase !== "scanning";
    el("cancel-btn").hidden = !["opening", "scanning", "preparing"].includes(phase);
    el("cancel-btn").textContent = phase === "preparing" ? "Annulla round" : "Annulla scansione";
    el("preplay").hidden = phase !== "preparing";
    el("timer").hidden = phase !== "playing";
    el("reveal-btn").hidden = phase !== "playing";
    el("reveal-btn").disabled = phase !== "playing";
    el("go-label").hidden = phase !== "playing" || !goTimer;
    el("reset-btn").hidden = !["revealed", "stopping", "stop-error"].includes(phase);
    el("reset-btn").disabled = phase === "stopping";
    el("reset-btn").textContent = phase === "stop-error" ? "RIPROVA STOP"
      : phase === "stopping" ? "ARRESTO…" : "NEXT SONG";
    el("result").hidden = !revealAfterStop;
    el("game-screen").setAttribute("aria-busy", String(["opening", "preparing", "stopping"].includes(phase)));
  }
  function move(phase) { round.move(phase); render(); }
  function report(error) {
    message(error.message || "Operazione non riuscita. Riprova.");
    if (error instanceof auth.LoginRequired) { authenticated = false; render(); }
    if (config.debug) console.error(error);
  }
  function traceRound() {
    const start = performance.now();
    return label => {
      if (config.debug) console.debug("[Bamboc performance]", label, Math.round(performance.now() - start) + "ms");
    };
  }
  async function begin() {
    if (!authenticated || booting || leaving || !["idle", "revealed"].includes(round.phase)) return;
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
      move("scanning");
      // Transfer and track preparation now belong to the post-QR countdown.
      await scanner.start(text => id === roundId ? onScan(text) : true,
        error => { if (id === roundId && !leaving) report(error); });
      if (id !== roundId || leaving) return;
      trace("scanner ready");
      if (round.phase === "scanning") message("Inquadra il QR di una canzone.");
    } catch (error) {
      if (id !== roundId || leaving) return;
      report(error);
      if (round.phase === "opening") move("idle");
      else if (round.phase === "scanning") await finish(false);
      try { await playback.prepare(); } catch (prepareError) {
        if (id === roundId && !leaving) report(prepareError);
      }
    }
  }
  async function onScan(text) {
    if (round.phase !== "scanning" || leaving) return true;
    const trace = traceRound();
    trace("scan detected");
    const trackId = core.extractTrackId(text);
    if (!trackId) { message("QR non valido: serve un URL o URI Spotify di una traccia."); return false; }
    if (catalog.isConflict(trackId)) { message("ID ambiguo nel database: occorre correggere le voci duplicate."); return false; }
    const found = catalog.lookup(trackId);
    trace("local lookup");
    if (!found) { message("Canzone non presente nel database o voce non valida."); return false; }
    const id = ++roundId;
    controller = new AbortController();
    const signal = controller.signal;
    song = found;
    move("preparing");
    message("Preparati a indovinare!");
    if (navigator.vibrate) navigator.vibrate(60);
    cameraStopped = scanner.stop();
    cameraStopped.catch(() => {}); // Cleanup errors are handled by finish(), not leaked.
    const countdown = core.preplayCountdown(config.preplayMs, seconds => {
      if (id !== roundId || round.phase !== "preparing") return;
      const number = el("preplay-count");
      number.textContent = seconds ? String(seconds) : "PREPARAZIONE…";
      number.classList.toggle("waiting", !seconds);
    }, { signal });
    try {
      // The player starts preparing NOW; the promise is a gate, not a delayed play.
      const readyToStart = Promise.all([countdown, core.withTimeout(cameraStopped,
        config.requestTimeoutMs, "Arresto fotocamera non confermato.")]);
      startedAt = await playback.play(song, trace, { signal, readyToStart,
        onStarting() {
          if (id !== roundId || signal.aborted || leaving) return;
          el("preplay-count").textContent = "VIA!";
          el("preplay-count").classList.toggle("waiting", true);
        },
      });
      if (id !== roundId || signal.aborted || leaving) return true;
      goTimer = setTimeout(() => { goTimer = null; el("go-label").hidden = true; }, config.goLabelMs);
      move("playing");
      message("Indovina titolo, artista e anno!");
      tick();
      if (round.phase === "playing")
        deadlineTimer = setTimeout(tick, Math.max(0, config.roundMs - (Date.now() - startedAt)));
    } catch (error) {
      if (id !== roundId || leaving) return true;
      report(error);
      await finish(false);
    }
    return true;
  }
  function clearTimers() {
    cancelAnimationFrame(frame); frame = null;
    clearTimeout(deadlineTimer); deadlineTimer = null;
    clearTimeout(goTimer); goTimer = null;
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
  async function finish(reveal) {
    if (!["opening", "scanning", "preparing", "playing", "stop-error"].includes(round.phase)) return;
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
      // A pending permission prompt/start must not leave the UI stuck forever.
      await core.withTimeout(scanner.stop(), config.requestTimeoutMs, "Arresto fotocamera non confermato.");
      if (id !== roundId || leaving) return;
      if (!revealAfterStop && authenticated) {
        try { await playback.prepare(); } catch (error) { report(error); }
        if (id !== roundId || leaving) return;
      }
      move(revealAfterStop ? "revealed" : "idle");
      if (revealAfterStop) { message("Risposta svelata."); el("reset-btn").focus(); }
    } catch (error) {
      if (id !== roundId || leaving) return;
      move("stop-error");
      message("Arresto non confermato. Premi RIPROVA STOP prima del prossimo round.");
      if (config.debug) console.error(error);
    }
  }
  el("login-btn").addEventListener("click", async () => {
    el("login-btn").disabled = true;
    try { await auth.login(); } catch (error) { report(error); el("login-btn").disabled = false; }
  });
  el("scan-btn").addEventListener("click", () => { void begin(); });
  el("cancel-btn").addEventListener("click", () => {
    if (["opening", "scanning", "preparing"].includes(round.phase)) {
      message("Annullamento…"); void finish(false);
    }
  });
  el("reveal-btn").addEventListener("click", () => {
    if (round.phase === "playing") void finish(true);
  });
  el("reset-btn").addEventListener("click", () => {
    if (round.phase === "preparing") void finish(false);
    else if (round.phase === "stop-error") void finish(revealAfterStop);
    else void begin();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
    else if (["opening", "scanning", "preparing"].includes(round.phase)) {
      message("Scansione o preparazione annullata mentre la pagina non è visibile.");
      void finish(false);
    }
  });
  playback.onError(error => {
    if (round.phase === "preparing" || round.phase === "playing") {
      report(error); void finish(round.phase === "playing");
    }
  });
  playback.onState(state => {
    if (round.phase === "playing" && (!state || state.paused || !playback.matches(state, song.id))) {
      message("Riproduzione interrotta."); void finish(true);
    }
  });
  window.addEventListener("pagehide", () => {
    leaving = true; ++roundId;
    clearTimers();
    controller?.abort(new Error("Pagina chiusa."));
    void scanner.stop().catch(() => {});
    playback.disconnect();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  async function boot() {
    render();
    if (catalog.issues.length) {
      console.warn("Bamboc-Hit: " + catalog.issues.length + " segnalazioni dataset. Vedi DATASET_AUDIT.md.");
      if (config.debug) console.table(catalog.issues);
    }
    try {
      await auth.handleRedirect();
      await auth.getToken();
      if (leaving) return;
      authenticated = true; render();
      message("Preparazione Spotify…");
      await playback.prepare();
      if (!leaving) message("Premi SCAN per iniziare.");
    } catch (error) { if (!leaving) report(error); }
    finally { booting = false; if (!leaving) render(); }
  }
  void boot();
})();
