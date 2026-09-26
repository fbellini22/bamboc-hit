"use strict";
(() => {
  const { config, core, auth } = window.Bamboc;
  let player = null, deviceId = null, connected = null, sdkLoading = null, connectionReady = false;
  const failure = (code, message) => new core.SpotifyError(code, message);
  const isReady = () => Boolean(player && connectionReady && typeof deviceId === "string" && deviceId.trim());
  let active = false, connectionEpoch = 0, cancelConnection = null, stateSequence = 0;
  let currentRound = null, pendingPause = null, desiredVolume = config.defaultVolume;
  const stateListeners = new Set(), errorListeners = new Set(), readyListeners = new Set();
  const sdkEvents = ["ready", "not_ready", "player_state_changed", "initialization_error",
    "authentication_error", "account_error", "playback_error", "autoplay_failed"];
  function retire(instance) {
    if (!instance) return;
    for (const event of sdkEvents) instance.removeListener?.(event);
    instance.disconnect();
  }
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
  function rememberDuration(id, duration) {
    if (!Number.isFinite(duration) || duration <= 0 || durations.get(id) === duration) return;
    durations.set(id, duration);
    try { sessionStorage.setItem(durationKey, JSON.stringify([...durations])); } catch { /* Optional cache. */ }
  }
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
    player = null; deviceId = null; active = false; pendingPause = null; connectionReady = false;
    retire(old);
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
      script.onerror = () => finish(failure("NETWORK_ERROR", "Impossibile caricare Spotify. Controlla la connessione e riconnetti Spotify."));
      timer = setTimeout(() => finish(failure("NETWORK_ERROR", "Timeout caricamento Spotify SDK.")), config.readyTimeoutMs);
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
          if (instance === player) disconnectDevice(error);
        });
      },
    });
    instance.addListener("ready", event => {
      if (instance !== player) return;
      if (typeof event?.device_id !== "string" || !event.device_id.trim()) {
        connectionReady = false; deviceId = null;
        notifyError(failure("DEVICE_NOT_READY", "Spotify non ha fornito un dispositivo valido. Riconnetti Spotify.")); return;
      }
      if (currentRound?.device && currentRound.device !== event.device_id) {
        const error = failure("DEVICE_NOT_READY", "Dispositivo Spotify cambiato durante il round. Riconnetti Spotify.");
        abandon(currentRound, error); notifyError(error); return;
      }
      deviceId = event.device_id; active = false;
      for (const callback of [...readyListeners]) callback(deviceId);
    });
    instance.addListener("not_ready", () => {
      if (instance !== player) return;
      deviceId = null; active = false; connectionReady = false;
      notifyError(failure("DEVICE_NOT_READY", "Dispositivo Spotify offline. Riconnetti Spotify."));
    });
    instance.addListener("player_state_changed", () => {
      if (instance !== player) return;
      const sequence = ++stateSequence;
      // Event payloads can refer to the previous round on this same device.
      core.withTimeout(instance.getCurrentState(), config.requestTimeoutMs, "Timeout stato Spotify.")
        .then(state => {
          if (instance !== player || sequence !== stateSequence) return;
          active = Boolean(state);
          for (const callback of [...stateListeners]) callback(state);
        }).catch(error => { if (instance === player && sequence === stateSequence) notifyError(error); });
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
        if (type !== "playback_error" && type !== "autoplay_failed") { deviceId = null; active = false; connectionReady = false; }
        const error = type === "authentication_error" ? new auth.LoginRequired(messages[type])
          : failure(type === "initialization_error" || type === "account_error" ? "PLAYER_NOT_READY" : "PLAYBACK_FAILED", messages[type]);
        notifyError(error);
      });
    }
    return instance;
  }
  function prepare() {
    if (connected) return connected;
    const epoch = connectionEpoch;
    const operation = (async () => {
      await auth.getToken();
      if (epoch !== connectionEpoch) throw failure("PLAYER_NOT_READY", "Preparazione player annullata.");
      if (isReady()) return deviceId;
      await loadSDK();
      if (epoch !== connectionEpoch) throw new Error("Preparazione player annullata.");
      if (!player) player = createPlayer();
      const instance = player;
      let onReady, onError, timer;
      const ready = new Promise((resolve, reject) => {
        onReady = resolve; onError = reject;
        cancelConnection = reject;
        readyListeners.add(onReady); errorListeners.add(onError);
        timer = setTimeout(() => reject(failure("PLAYER_NOT_READY", "Player Spotify non pronto. Riconnetti Spotify.")), config.readyTimeoutMs);
      });
      try {
        await Promise.all([ready, core.withTimeout(instance.connect(), config.readyTimeoutMs,
          "Timeout connessione Spotify.").then(ok => {
          if (!ok) throw failure("PLAYER_NOT_READY", "Connessione Spotify non riuscita.");
        })]);
        if (epoch !== connectionEpoch || instance !== player) throw new Error("Connessione annullata.");
        if (!deviceId) throw failure("DEVICE_NOT_READY", "Dispositivo Spotify non pronto.");
        connectionReady = true;
        return deviceId;
      } catch (error) {
        onError(error);
        retire(instance);
        if (player === instance) { player = null; deviceId = null; active = false; connectionReady = false; }
        throw error.code ? error : failure("PLAYER_NOT_READY", error.message);
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
    // Only activate an authenticated, connected instance in the user's click.
    if (!auth.hasValidToken()) return Promise.reject(new auth.LoginRequired("Accedi a Spotify per iniziare."));
    if (!isReady()) return Promise.reject(failure("PLAYER_NOT_READY", "Connessione a Spotify necessaria prima di SCAN."));
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
    timeout = setTimeout(() => fail(failure("PLAYBACK_NOT_CONFIRMED", "Riproduzione non confermata. Verifica Spotify e riconnetti il player.")), timeoutMs);
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
    return core.randomPosition(duration, config.roundMs, config.endMarginMs, Math.random, config.minimumStartMs);
  }
  function atPosition(state, round) {
    return matches(state, round.song.id) && !state.loading &&
      Math.abs(state.position - round.position) <= config.positionToleranceMs;
  }
  async function prepareTrack(round, trace) {
    const knownDuration = round.song.durationMs || durations.get(round.song.id);
    if (knownDuration) round.position = choosePosition(knownDuration);
    // Establish the SDK device without transferring playback until mute is verified.
    const device = await prepare();
    check(round);
    round.instance = player; round.device = device;
    check(round);
    const volume = await step(round, round.instance.getVolume(), "Volume Spotify non disponibile.");
    if (!Number.isFinite(volume) || volume <= 0 || volume > 1)
      throw new Error("Il volume Spotify è a zero o non disponibile. Alzalo prima di riprovare.");
    round.volume = volume;
    desiredVolume = volume;
    await volumeFor(round, 0);
    trace("mute confirmed");
    await ensureActive(trace, round);
    await volumeFor(round, 0); // Transfer must not change the pre-load mute.

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
    round.onStarting();
    check(round);
    await volumeFor(round, round.volume);
    const confirmed = await stateFor(round, state => matches(state, round.song.id) && !state.paused &&
      !state.loading && state.position >= round.position &&
      state.position <= round.position + config.maximumStartDriftMs);
    round.started = true;
    trace("SDK playback and volume confirmed (physical audio unmeasured)");
    return confirmed.at;
  }
  async function play(song, trace = () => {}, { signal, readyToStart = Promise.resolve(), onStarting = () => {} } = {}) {
    if (currentRound || pendingPause) throw new Error("Il round precedente non è ancora terminato.");
    // Attach the countdown rejection handler immediately, even if setup fails.
    readyToStart.catch(() => {});
    const round = { song, controller: new AbortController(),
      instance: null, device: null, started: false, position: null, volume: desiredVolume, onStarting };
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
  function resetSession() {
    disconnect(); desiredVolume = config.defaultVolume; durations.clear();
    try { sessionStorage.removeItem(durationKey); } catch { /* Optional storage. */ }
  }
  auth.onInvalidated(resetSession);
  window.Bamboc.playback = { prepare, activate, ensureActive, play, stop, disconnect, resetSession, isReady, matches, waitForState,
    onError(callback) { errorListeners.add(callback); return () => errorListeners.delete(callback); },
    onState(callback) { stateListeners.add(callback); return () => stateListeners.delete(callback); },
  };
})();
