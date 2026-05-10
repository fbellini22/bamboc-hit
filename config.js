function getRedirectUri() {
  if (window.location.hostname === "fbellini22.github.io") {
    return "https://fbellini22.github.io/bamboc-hit/";
  }

  return window.location.origin;
}

const CONFIG = {
  CLIENT_ID: "1031669a52cf4742b6e908a536a247e5",

  REDIRECT_URI: getRedirectUri(),

  SCOPES: [
    "user-read-email",
    "user-read-private",
    "user-modify-playback-state",
    "user-read-playback-state",
    "streaming",
  ],
};
