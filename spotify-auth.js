async function redirectToSpotifyLogin() {
  const verifier = generateRandomString(64);

  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem("verifier", verifier);

  const params = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,

    response_type: "code",

    redirect_uri: CONFIG.REDIRECT_URI,

    scope: CONFIG.SCOPES.join(" "),

    code_challenge_method: "S256",

    code_challenge: challenge,
  });

  window.location =
    "https://accounts.spotify.com/authorize?" + params.toString();
}

/* =========================
   HANDLE REDIRECT
========================= */

async function handleRedirect() {
  const params = new URLSearchParams(window.location.search);

  const code = params.get("code");

  if (!code) return;

  const verifier = localStorage.getItem("verifier");

  const body = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,

    grant_type: "authorization_code",

    code: code,

    redirect_uri: CONFIG.REDIRECT_URI,

    code_verifier: verifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  });

  if (!response.ok) {
    throw new Error("Errore autenticazione Spotify");
  }

  const data = await response.json();

  localStorage.setItem("access_token", data.access_token);

  /* pulisce URL */

  window.history.replaceState({}, document.title, window.location.pathname);
}

/* =========================
   HELPERS
========================= */

function generateRandomString(length) {
  let text = "";

  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);

  const digest = await crypto.subtle.digest("SHA-256", data);

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
