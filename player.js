let player = null;

/* device id globale */
window.device_id = null;

/* promessa per sapere quando il player è pronto */
window.player_ready_promise = null;

let resolvePlayerReady;

/* inizializza promessa */
window.player_ready_promise = new Promise((resolve) => {
  resolvePlayerReady = resolve;
});

/* =========================
   SDK READY
========================= */

window.onSpotifyWebPlaybackSDKReady = () => {
  console.log("Spotify SDK caricato");

  const token = localStorage.getItem("access_token");

  if (!token) {
    console.warn("Token non ancora presente, player inizializzato comunque");
  }

  /* crea player */

  player = new Spotify.Player({
    name: "Bamboc-Hit Player",

    getOAuthToken: (cb) => {
      const freshToken = localStorage.getItem("access_token");
      cb(freshToken);
    },

    volume: 0.8,
  });

  window.player = player;

  /* =========================
     READY
  ========================= */

  player.addListener("ready", ({ device_id }) => {
    console.log("✅ Player pronto:", device_id);

    window.device_id = device_id;

    if (resolvePlayerReady) {
      resolvePlayerReady(device_id);
      resolvePlayerReady = null;
    }
  });

  /* =========================
     OFFLINE
  ========================= */

  player.addListener("not_ready", ({ device_id }) => {
    console.warn("⚠️ Player offline:", device_id);
  });

  /* =========================
     ERRORI
  ========================= */

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

  /* =========================
     CONNECT
  ========================= */

  player.connect().then((success) => {
    if (success) {
      console.log("🎧 Player connesso");
    } else {
      console.error("❌ Connessione player fallita");
    }
  });
};
