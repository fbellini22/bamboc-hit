<<<<<<< ours
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
      await scanner.start(onScan, report);
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
      startedAt = await playback.play(song, trace, { signal, readyToStart: countdown });
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
=======
function debug(msg) {
  const el = document.getElementById("debug");
  if (el) el.innerText = msg;
}

let gameTimer = null;
let gameActive = false;
let currentTrack = null;

window.onload = async () => {
  await handleRedirect();

  const token = localStorage.getItem("access_token");

  if (token) {
    showGame();
  } else {
    showLogin();
  }
};

function showLogin() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("game-screen").style.display = "none";
}

function showGame() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("game-screen").style.display = "flex";
}

async function initPlayerAndScan() {
  if (window.player) {
    try {
      await window.player.activateElement();
    } catch (e) {
      console.warn(e);
    }
  }

  startScanner();
}

function findSongData(trackId) {
  if (!trackId || !window.SONGS) return null;
  return SONGS.find((s) => s.id && s.id === trackId);
}

async function handleSpotifyTrack(url) {
  if (gameActive) return;

  gameActive = true;
  document.getElementById("reveal-btn").style.display = "none";

  const trackId = extractTrackId(url);
  if (!trackId) {
    alert("QR non valido");
    gameActive = false;
    return;
  }

  const token = localStorage.getItem("access_token");
  if (!token) {
    alert("Login richiesto");
    gameActive = false;
    return;
  }

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      alert("Sessione scaduta o traccia non disponibile");
      localStorage.clear();
      location.reload();
      return;
>>>>>>> theirs
    }
    return true;
  }
<<<<<<< ours
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
=======
}

async function playRandomSnippet(track) {
  const token = localStorage.getItem("access_token");
  if (!token) {
    gameActive = false;
    return;
  }

  if (!window.device_id && window.player_ready_promise) {
    await window.player_ready_promise;
>>>>>>> theirs
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
<<<<<<< ours
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
      await cameraStopped.catch(() => {}); // Retry the actual camera shutdown below.
      await scanner.stop();
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
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
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
=======

  const duration = track.duration_ms;
  const start = Math.floor(Math.random() * Math.max(duration - 30000, 0));

  try {
    const transferRes = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device_ids: [window.device_id], play: false }),
    });

    if (!transferRes.ok) {
      alert("Errore attivazione player");
      gameActive = false;
      return;
    }

    const playRes = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${window.device_id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [track.uri], position_ms: start }),
      },
    );

    if (!playRes.ok) {
      alert("Errore avvio musica");
      gameActive = false;
      return;
    }

    const started = await window.waitForPlaybackStart(5000);
    if (!started) {
      console.warn("Timeout playback start, avvio timer in fallback");
    }

    startCountdown();
  } catch (err) {
    console.error(err);
    gameActive = false;
  }
}

function startCountdown() {
  let time = 30;

  const countdown = document.getElementById("countdown");
  const revealBtn = document.getElementById("reveal-btn");
  const result = document.getElementById("result");

  result.style.display = "none";
  result.innerHTML = "";

  revealBtn.style.display = "block";
  countdown.innerText = time;

  gameTimer = setInterval(async () => {
    time--;
    countdown.innerText = time;

    if (time <= 0) {
      clearInterval(gameTimer);
      countdown.innerText = "";
      await stopSpotifyPlayback();
      revealTrack(currentTrack);
      gameActive = false;
    }
  }, 1000);
}

function revealEarly() {
  if (!gameActive || !currentTrack) return;

  clearInterval(gameTimer);
  stopSpotifyPlayback();
  document.getElementById("countdown").innerText = "";
  revealTrack(currentTrack);
  gameActive = false;
}

async function stopSpotifyPlayback() {
  const token = localStorage.getItem("access_token");
  if (!token) return;

  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.warn("Pause non riuscito:", res.status);
    }
  } catch (err) {
    console.error(err);
  }
}

function revealTrack(track) {
  if (!track) return;

  const result = document.getElementById("result");
  const revealBtn = document.getElementById("reveal-btn");

  result.style.display = "block";
  revealBtn.style.display = "none";

  const song = track.local;

  result.innerHTML = `
    <div class="card">
      <div class="card-front">🎵</div>
      <div class="card-back">
        ${
          song
            ? `
              <h2>${song.title}</h2>
              <p>${song.artist}</p>
              <p>${song.year}</p>
            `
            : `
              <h2>Canzone non trovata</h2>
            `
        }
      </div>
    </div>
  `;

  setTimeout(() => {
    const card = document.querySelector(".card");
    if (card) card.classList.add("flip");
  }, 100);

  document.getElementById("reset-btn").style.display = "block";
}

function resetGame() {
  clearInterval(gameTimer);
  stopSpotifyPlayback();

  document.getElementById("result").style.display = "none";
  document.getElementById("result").innerHTML = "";
  document.getElementById("countdown").innerText = "";
  document.getElementById("reset-btn").style.display = "none";
  document.getElementById("reveal-btn").style.display = "none";

  gameActive = false;
  startScanner();
}
>>>>>>> theirs
