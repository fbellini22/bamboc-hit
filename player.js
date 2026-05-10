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

window.onSpotifyWebPlaybackSDKReady = () => {
  const token = localStorage.getItem("access_token");

  if (!token) {
    console.warn("Token non ancora presente, player inizializzato comunque");
  }

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
    }
  });
};
