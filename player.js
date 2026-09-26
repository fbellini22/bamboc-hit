<<<<<<< ours
"use strict";
(() => {
  const { config, core, auth } = window.Bamboc;
  let player = null, deviceId = null, connected = null, sdkLoading = null;
  let active = false, generation = 0, connectionEpoch = 0, cancelConnection = null;
  let currentRound = null, pendingPause = null, desiredVolume = config.defaultVolume;
  const stateListeners = new Set(), errorListeners = new Set(), readyListeners = new Set();
  const durations = new Map();
  const durationKey = "bamboc.spotify.durations.v1";
  try {
    const cache = JSON.parse(sessionStorage.getItem(durationKey) || "[]");
    if (Array.isArray(cache)) for (const entry of cache) {
      if (!Array.isArray(entry)) continue;
      const [id, duration] = entry;
      if (/^[A-Za-z0-9]{22}$/.test(id) && Number.isFinite(duration) && duration > 0) durations.set(id, duration);
    }
  } catch { /* Invalid cache is disposable. */ }
=======
let player = null;

window.device_id = null;
window.player_ready_promise = null;

let resolvePlayerReady;
let playbackStartResolver = null;

window.player_ready_promise = new Promise((resolve) => {
  resolvePlayerReady = resolve;
});

window.waitForPlaybackStart = function waitForPlaybackStart(timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
<<<<<<< ours
<<<<<<< ours

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        playbackStartResolver = null;
        resolve(false);
      }
    }, timeoutMs);

    playbackStartResolver = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        playbackStartResolver = null;
        resolve(true);
      }
    };
  });
};

=======

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        playbackStartResolver = null;
        resolve(false);
      }
    }, timeoutMs);

    playbackStartResolver = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        playbackStartResolver = null;
        resolve(true);
      }
    };
  });
};

>>>>>>> theirs
=======

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        playbackStartResolver = null;
        resolve(false);
      }
    }, timeoutMs);

    playbackStartResolver = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        playbackStartResolver = null;
        resolve(true);
      }
    };
  });
};

>>>>>>> theirs
window.onSpotifyWebPlaybackSDKReady = () => {
  const token = localStorage.getItem("access_token");
>>>>>>> theirs

  function rememberDuration(id, duration) {
    if (!Number.isFinite(duration) || duration <= 0 || durations.get(id) === duration) return;
    durations.set(id, duration);
    try { sessionStorage.setItem(durationKey, JSON.stringify([...durations])); } catch { /* Optional cache. */ }
  }
<<<<<<< ours
  function check(round) {
    if (currentRound !== round || round.controller.signal.aborted)
      throw round.controller.signal.reason || new Error("Round annullato.");
  }
  async function step(round, operation, message) {
    check(round);
    const value = await core.abortable(operation, round.controller.signal, config.requestTimeoutMs, message);
    check(round);
    return value;
  }
  function disconnectDevice(error = new Error("Player disconnesso.")) {
    connectionEpoch++;
    cancelConnection?.(error);
    cancelConnection = null;
    connected = null;
    const old = player;
    player = null; deviceId = null; active = false; pendingPause = null;
    old?.disconnect();
  }
  function abandon(round, error) {
    if (currentRound !== round) return;
    currentRound = null;
    round.controller.abort(error);
    round.detach();
    // Never unmute a failed/ambiguous stream. Retire its device and preserve the
    // user's volume for the replacement player. Late SDK calls target only old.
    disconnectDevice(error);
  }
  function notifyError(error) {
    if (currentRound && !currentRound.started) abandon(currentRound, error);
    for (const callback of [...errorListeners]) callback(error);
  }
  function loadSDK() {
    if (window.Spotify?.Player) return Promise.resolve();
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let timer, settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      window.onSpotifyWebPlaybackSDKReady = () => finish();
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.onerror = () => finish(new Error("Impossibile caricare Spotify. Controlla la connessione e riprova."));
      timer = setTimeout(() => finish(new Error("Timeout caricamento Spotify SDK.")), config.readyTimeoutMs);
      document.head.append(script);
    }).catch(error => { sdkLoading = null; throw error; });
    return sdkLoading;
  }
  function createPlayer() {
    const instance = new window.Spotify.Player({
      name: "Bamboc-Hit Player", volume: desiredVolume,
      getOAuthToken: callback => {
        auth.getToken().then(token => { if (instance === player) callback(token); }).catch(error => {
          if (instance !== player) return;
          notifyError(error);
          instance.disconnect();
        });
      },
    });
    instance.addListener("ready", event => {
      if (instance !== player) return;
      deviceId = event.device_id; active = false;
      for (const callback of [...readyListeners]) callback(deviceId);
    });
    instance.addListener("not_ready", () => {
      if (instance !== player) return;
      deviceId = null; active = false;
      notifyError(new Error("Dispositivo Spotify offline. Riprova SCAN per riconnetterlo."));
    });
    instance.addListener("player_state_changed", state => {
      if (instance !== player) return;
      active = Boolean(state);
      for (const callback of [...stateListeners]) callback(state);
    });
    for (const type of ["initialization_error", "authentication_error", "account_error", "playback_error", "autoplay_failed"]) {
      instance.addListener(type, () => {
        if (instance !== player) return;
        const messages = {
          initialization_error: "Browser non compatibile con Spotify: controlla DRM e contenuti protetti.",
          authentication_error: "Autenticazione del player fallita. Riprova o accedi nuovamente.",
          account_error: "Per giocare serve Spotify Premium e un account autorizzato.",
          playback_error: "Riproduzione Spotify non riuscita. Riprova.",
          autoplay_failed: "Audio bloccato dal browser. Premi SCAN e riprova.",
        };
        if (type !== "playback_error" && type !== "autoplay_failed") { deviceId = null; active = false; }
        notifyError(new Error(messages[type]));
      });
    }
    return instance;
  }
  function prepare() {
    if (deviceId) return Promise.resolve(deviceId);
    if (connected) return connected;
    const epoch = connectionEpoch;
    const operation = (async () => {
      await auth.getToken();
      await loadSDK();
      if (epoch !== connectionEpoch) throw new Error("Preparazione player annullata.");
      if (!player) player = createPlayer();
      const instance = player;
      let onReady, onError, timer;
      const ready = new Promise((resolve, reject) => {
        onReady = resolve; onError = reject;
        cancelConnection = reject;
        readyListeners.add(onReady); errorListeners.add(onError);
        timer = setTimeout(() => reject(new Error("Player Spotify non pronto. Riprova.")), config.readyTimeoutMs);
      });
      try {
        await Promise.all([ready, core.withTimeout(instance.connect(), config.readyTimeoutMs,
          "Timeout connessione Spotify.").then(ok => {
          if (!ok) throw new Error("Connessione Spotify non riuscita.");
        })]);
        if (epoch !== connectionEpoch || instance !== player) throw new Error("Connessione annullata.");
        return deviceId;
      } catch (error) {
        onError(error);
        instance.disconnect();
        if (player === instance) { player = null; deviceId = null; active = false; }
        throw error;
      } finally {
        clearTimeout(timer); readyListeners.delete(onReady); errorListeners.delete(onError);
        if (cancelConnection === onError) cancelConnection = null;
      }
    })();
    connected = operation;
    const clear = () => { if (connected === operation) connected = null; };
    operation.then(clear, clear);
    return operation;
  }
  function activate() {
    // Must be called inside the click, before await. A retired player gets a new
    // instance; its audio element still needs this fresh user activation.
    if (!player && window.Spotify?.Player) player = createPlayer();
    if (!player) return Promise.reject(new Error("Player in preparazione. Attendi e premi nuovamente SCAN."));
    return core.withTimeout(player.activateElement(), config.readyTimeoutMs, "Attivazione audio non riuscita.");
  }
  async function ensureActive(trace = () => {}, round) {
    if (round) check(round);
    const id = await prepare();
    if (round) { check(round); round.instance = player; round.device = id; }
    trace("device ready");
    if (!active) {
      trace("transfer requested");
      await auth.api("/me/player", { body: { device_ids: [id], play: false }, signal: round?.controller.signal });
      if (round) check(round);
      active = true;
    }
    return id;
  }
  function matches(state, id) {
    const track = state?.track_window?.current_track;
    return Boolean(track && (track.id === id || track.uri === "spotify:track:" + id ||
      track.linked_from?.id === id || track.linked_from?.uri === "spotify:track:" + id));
  }
  function waitForState(predicate, timeoutMs = config.playbackTimeoutMs,
    { instance = player, signal } = {}) {
    let resolve, reject, timeout, poll, done = false, polling = false, armed = false;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    promise.catch(() => {});
    const cleanup = () => {
      clearTimeout(timeout); clearInterval(poll);
      stateListeners.delete(sample); errorListeners.delete(fail);
      signal?.removeEventListener("abort", abort);
    };
    const fail = error => { if (!done) { done = true; cleanup(); reject(error); } };
    const abort = () => fail(signal.reason || new Error("Round annullato."));
    async function sample() {
      if (done || !armed || polling) return;
      polling = true;
      try {
        const state = await core.abortable(instance.getCurrentState(), signal, timeoutMs, "Timeout stato Spotify.");
        if (!done && predicate(state)) { done = true; cleanup(); resolve({ state, at: Date.now() }); }
      } catch (error) { fail(error); }
      finally { polling = false; }
    }
    // Events wake a fresh SDK read; stale event payloads never confirm a round.
    stateListeners.add(sample); errorListeners.add(fail);
    signal?.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(() => fail(new Error("Riproduzione non confermata. Premi SCAN per riprovare.")), timeoutMs);
    poll = setInterval(sample, config.pollMs);
    if (signal?.aborted) abort();
    return { promise, arm: () => { armed = true; }, sample,
      cancel: () => fail(new Error("Attesa playback annullata.")) };
  }
  async function stateFor(round, predicate) {
    check(round);
    const waiter = waitForState(predicate, config.playbackTimeoutMs,
      { instance: round.instance, signal: round.controller.signal });
    try {
      waiter.arm(); void waiter.sample();
      const result = await waiter.promise;
      check(round);
      return result;
    } finally { waiter.cancel(); }
  }
  async function volumeFor(round, volume) {
    await step(round, round.instance.setVolume(volume), "Timeout regolazione volume Spotify.");
    const actual = await step(round, round.instance.getVolume(), "Volume Spotify non verificabile.");
    if (!Number.isFinite(actual) || Math.abs(actual - volume) > 0.0001)
      throw new Error(volume === 0
        ? "Questo browser non consente una preparazione silenziosa (per esempio iOS). Usa un browser con volume Spotify controllabile."
        : "Ripristino del volume Spotify non confermato. Riprova SCAN.");
  }
  function choosePosition(duration) {
    const maximum = duration - config.roundMs - config.endMarginMs;
    if (!Number.isFinite(maximum) || maximum < config.minimumStartMs)
      throw new Error("Traccia troppo breve per un segmento casuale di 45 secondi senza intro.");
    return config.minimumStartMs +
      Math.floor(Math.random() * (maximum - config.minimumStartMs + 1));
  }
  function atPosition(state, round) {
    return matches(state, round.song.id) && !state.loading &&
      Math.abs(state.position - round.position) <= config.positionToleranceMs;
  }
  async function prepareTrack(round, trace) {
    const knownDuration = round.song.durationMs || durations.get(round.song.id);
    if (knownDuration) round.position = choosePosition(knownDuration);
    await ensureActive(trace, round);
    check(round);
    const volume = await step(round, round.instance.getVolume(), "Volume Spotify non disponibile.");
    if (!Number.isFinite(volume) || volume <= 0 || volume > 1)
      throw new Error("Il volume Spotify è a zero o non disponibile. Alzalo prima di riprovare.");
    round.volume = volume;
    desiredVolume = volume;
    await volumeFor(round, 0);
    trace("mute confirmed");

<<<<<<< ours
<<<<<<< ours
    // No play request can precede the successful zero-volume readback.
    const request = () => auth.api("/me/player/play?device_id=" + encodeURIComponent(round.device), {
      body: { uris: ["spotify:track:" + round.song.id], position_ms: round.position || 0 },
      signal: round.controller.signal,
    });
    trace("silent play requested");
    try { await step(round, request(), "Timeout caricamento traccia."); }
    catch (error) {
      check(round);
      if (error.status !== 404) throw error;
      active = false;
      await ensureActive(trace, round);
      // Transfer must not silently change the mute state.
      await volumeFor(round, 0);
      trace("silent play retried");
      await step(round, request(), "Timeout caricamento traccia.");
    }
    const loaded = await stateFor(round, state => matches(state, round.song.id) && !state.loading &&
      Number.isFinite(state.duration) && state.duration > 0);
    rememberDuration(round.song.id, loaded.state.duration);
    if (!knownDuration || round.position > loaded.state.duration - config.roundMs - config.endMarginMs)
      round.position = choosePosition(loaded.state.duration);
    trace("duration ready");

    await step(round, round.instance.pause(), "Timeout pausa di preparazione.");
    await stateFor(round, state => matches(state, round.song.id) && state.paused && !state.loading);
    trace("random seek requested");
    await step(round, round.instance.seek(round.position), "Timeout posizionamento casuale.");
    await stateFor(round, state => state?.paused && atPosition(state, round));
    await volumeFor(round, 0);
    trace("random position parked");
  }
  async function startPrepared(round, trace) {
    check(round);
    // The track was parked, not left running muted while the countdown elapsed.
    await stateFor(round, state => state?.paused && atPosition(state, round));
    const volume = await step(round, round.instance.getVolume(), "Volume Spotify non verificabile.");
    if (volume !== 0) throw new Error("Volume modificato durante la preparazione. Riprova senza usare altri controlli Spotify.");
    trace("silent resume requested");
    await step(round, round.instance.resume(), "Timeout ripresa Spotify.");
    const moving = await stateFor(round, state => matches(state, round.song.id) && !state.paused &&
      !state.loading && state.position >= round.position && state.position <= round.position + config.maximumStartDriftMs);
    // An unpaused flag alone is insufficient: require measured progression.
    await stateFor(round, state => matches(state, round.song.id) && !state.paused && !state.loading &&
      state.position > moving.state.position && state.position <= round.position + config.maximumStartDriftMs);
    check(round);
    trace("random playback confirmed muted");
    await volumeFor(round, round.volume);
    const confirmed = await stateFor(round, state => matches(state, round.song.id) && !state.paused &&
      !state.loading && state.position >= round.position &&
      state.position <= round.position + config.maximumStartDriftMs);
    round.started = true;
    trace("audible playback confirmed");
    return confirmed.at;
  }
  async function play(song, trace = () => {}, { signal, readyToStart = Promise.resolve() } = {}) {
    if (currentRound || pendingPause) throw new Error("Il round precedente non è ancora terminato.");
    // Attach the countdown rejection handler immediately, even if setup fails.
    readyToStart.catch(() => {});
    const round = { id: ++generation, song, controller: new AbortController(),
      instance: null, device: null, started: false, position: null, volume: desiredVolume };
    const abort = () => abandon(round, signal.reason || new Error("Round annullato."));
    round.detach = () => signal?.removeEventListener("abort", abort);
    currentRound = round;
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted) abort();
      check(round);
      await prepareTrack(round, trace);
      await core.abortable(readyToStart, round.controller.signal);
      check(round);
      return await startPrepared(round, trace);
    } catch (error) {
      abandon(round, error);
      throw error;
    }
  }
  async function stop() {
    const round = currentRound;
    if (round && !round.started) {
      abandon(round, new Error("Preparazione annullata."));
      return;
=======

=======
>>>>>>> theirs
=======
>>>>>>> theirs
  player = new Spotify.Player({
    name: "Bamboc-Hit Player",
    getOAuthToken: (cb) => {
      const freshToken = localStorage.getItem("access_token");
      cb(freshToken);
    },
    volume: 0.8,
  });

  window.player = player;

  player.addListener("ready", ({ device_id }) => {
    window.device_id = device_id;

    if (resolvePlayerReady) {
      resolvePlayerReady(device_id);
      resolvePlayerReady = null;
    }
  });

  player.addListener("player_state_changed", (state) => {
    if (state && state.paused === false && playbackStartResolver) {
      playbackStartResolver();
    }
  });

  player.addListener("not_ready", ({ device_id }) => {
    console.warn("⚠️ Player offline:", device_id);
  });

  player.addListener("initialization_error", ({ message }) => {
    console.error("Initialization error:", message);
  });

  player.addListener("authentication_error", ({ message }) => {
    console.error("Authentication error:", message);
  });

  player.addListener("account_error", ({ message }) => {
    console.error("Account error:", message);
  });

  player.addListener("playback_error", ({ message }) => {
    console.error("Playback error:", message);
  });

  player.connect().then((success) => {
    if (!success) {
      console.error("❌ Connessione player fallita");
>>>>>>> theirs
    }
    if (round) {
      currentRound = null;
      round.controller.abort(new Error("Round terminato."));
      round.detach();
    }
    const previousPause = pendingPause;
    if (previousPause) await core.withTimeout(previousPause, config.requestTimeoutMs,
      "Arresto ancora in corso. Riprova STOP o ricarica la pagina.");
    if (!player || !deviceId) { disconnectDevice(); return; }
    const instance = player;
    const waiter = waitForState(state => !state || state.paused, config.requestTimeoutMs, { instance });
    try {
      const command = previousPause || Promise.resolve(instance.pause());
      pendingPause = command;
      const settled = () => { if (pendingPause === command) pendingPause = null; };
      command.then(settled, settled);
      await core.withTimeout(command, config.requestTimeoutMs, "Pausa non confermata. Riprova STOP.");
      waiter.arm(); void waiter.sample();
      await waiter.promise;
    } finally { waiter.cancel(); }
  }
  function disconnect() {
    if (currentRound) abandon(currentRound, new Error("Player disconnesso."));
    else disconnectDevice();
  }
  window.Bamboc.playback = { prepare, activate, ensureActive, play, stop, disconnect, matches, waitForState,
    onError(callback) { errorListeners.add(callback); return () => errorListeners.delete(callback); },
    onState(callback) { stateListeners.add(callback); return () => stateListeners.delete(callback); },
  };
})();
