function debug(msg) {
  const el = document.getElementById("debug");
  if (el) el.innerText = msg;
}

let gameTimer = null;
let gameActive = false;
let currentTrack = null;
const ROUND_DURATION_SECONDS = 45;
const ROUND_DURATION_MS = ROUND_DURATION_SECONDS * 1000;

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

async function playRandomSnippet(track) {
  const token = localStorage.getItem("access_token");
  if (!token) {
    gameActive = false;
    return;
  }

  if (!window.device_id && window.player_ready_promise) {
    await window.player_ready_promise;
  }

  if (!window.device_id) {
    alert("Player non pronto");
    gameActive = false;
    return;
  }

  const duration = track.duration_ms;
  const start = Math.floor(Math.random() * Math.max(duration - ROUND_DURATION_MS, 0));

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
  let time = ROUND_DURATION_SECONDS;

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
