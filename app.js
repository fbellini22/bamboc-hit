function debug(msg) {
  const el = document.getElementById("debug");
  if (el) el.innerText = msg;
}

let gameTimer = null;
let gameActive = false;
let currentTrack = null;

/* =========================
   START APP
========================= */

window.onload = async () => {
  await handleRedirect();

  const token = localStorage.getItem("access_token");

  if (token) {
    showGame();
  } else {
    showLogin();
  }
};

/* =========================
   SCREEN
========================= */

function showLogin() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("game-screen").style.display = "none";
}

function showGame() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("game-screen").style.display = "flex";
}

/* =========================
   🔥 ATTIVA PLAYER + SCAN (MOBILE FIX)
========================= */

async function initPlayerAndScan() {
  if (window.player) {
    try {
      await window.player.activateElement(); // fondamentale per audio mobile
    } catch (e) {
      console.warn(e);
    }
  }

  startScanner();
}

/* =========================
   FIND SONG
========================= */

function findSongData(trackId) {
  if (!trackId || !window.SONGS) return null;
  return SONGS.find((s) => s.id && s.id === trackId);
}

/* =========================
   HANDLE QR
========================= */

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
      alert("Sessione scaduta");
      localStorage.clear();
      location.reload();
      return;
    }

    const track = await res.json();

    currentTrack = {
      spotify: track,
      local: findSongData(track.id),
    };

    await playRandomSnippet(track);
  } catch (err) {
    console.error(err);
    gameActive = false;
  }
}

/* =========================
   PLAY (PLAYER INTERNO)
========================= */

async function playRandomSnippet(track) {
  const token = localStorage.getItem("access_token");

  if (!token) {
    gameActive = false;
    return;
  }

  /* aspetta player pronto */
  if (!window.device_id && window.player_ready_promise) {
    await window.player_ready_promise;
  }

  if (!window.device_id) {
    alert("Player non pronto");
    gameActive = false;
    return;
  }

  const duration = track.duration_ms;
  const start = Math.floor(Math.random() * Math.max(duration - 30000, 0));

  try {
    /* attiva device */
    await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_ids: [window.device_id],
        play: false,
      }),
    });

    /* play */
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${window.device_id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [track.uri],
          position_ms: start,
        }),
      },
    );

    if (res.status !== 204) {
      alert("Errore avvio musica");
      gameActive = false;
      return;
    }

    startCountdown();
  } catch (err) {
    console.error(err);
    gameActive = false;
  }
}

/* =========================
   COUNTDOWN
========================= */

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
    }
  }, 1000);
}

/* =========================
   REVEAL
========================= */

function revealEarly() {
  if (!gameActive || !currentTrack) return;

  clearInterval(gameTimer);

  stopSpotifyPlayback();

  document.getElementById("countdown").innerText = "";

  revealTrack(currentTrack);

  gameActive = false;
}

/* =========================
   STOP
========================= */

async function stopSpotifyPlayback() {
  const token = localStorage.getItem("access_token");

  if (!token) return;

  try {
    await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error(err);
  }
}

/* =========================
   🎴 REVEAL (FLIP ONLY)
========================= */

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
              <h2>${track.spotify.name}</h2>
              <p>${track.spotify.artists.map((a) => a.name).join(", ")}</p>
              <p>${track.spotify.album.release_date.slice(0, 4)}</p>
            `
        }
      </div>
    </div>
  `;

  /* flip animazione */
  setTimeout(() => {
    const card = document.querySelector(".card");
    if (card) card.classList.add("flip");
  }, 100);

  document.getElementById("reset-btn").style.display = "block";
}

/* =========================
   RESET
========================= */

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
