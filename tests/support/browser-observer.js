"use strict";
(() => {
  // Test-only observer; never loaded by index.html. No UA-based playback branches, media sessions or audio
  // contexts are created. Capability probing runs only when a test calls probe().
  const state = { version: "browser-diag-1", sdkLoaded: false, connectResult: null,
    ready: false, deviceIdPresent: false, activateElement: "not_called",
    transfer: "not_used_direct_device", keySystem: { name: "com.widevine.alpha", result: "not_tested" },
    cameraPermission: "not_queried", events: [] };
  let probing = null;
  const n = () => window.navigator || {};
  const safeError = error => ["NotSupportedError", "NotAllowedError", "SecurityError", "TypeError", "AbortError"]
    .includes(error?.name) ? error.name : "Error";
  function environment() {
    const nav = n(), ua = String(nav.userAgent || "");
    const family = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome"
      : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "other";
    const major = /(?:Chrome|Firefox|Edg|Version)\/(\d{1,3})/.exec(ua)?.[1] || "unknown";
    const uaPlatform = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS"
      : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "other";
    const data = nav.userAgentData;
    const platform = ["Android", "Windows", "macOS", "Linux", "Chrome OS"].includes(data?.platform) ? data.platform : "unknown";
    const policy = document.permissionsPolicy || document.featurePolicy;
    const allowed = feature => { try { return typeof policy?.allowsFeature === "function" ? policy.allowsFeature(feature) : null; } catch { return null; } };
    return { uaSummary: family + "/" + major + " " + uaPlatform,
      uaMobile: /Mobile|Android|iPhone|iPad/.test(ua),
      userAgentDataAvailable: Boolean(data), uaDataPlatform: platform,
      mobile: typeof data?.mobile === "boolean" ? data.mobile : /Mobile|Android|iPhone|iPad/.test(ua),
      mobileSource: typeof data?.mobile === "boolean" ? "userAgentData" : "UA_hint_only",
      secureContext: window.isSecureContext === true,
      emeAvailable: typeof nav.requestMediaKeySystemAccess === "function",
      mediaSourceAvailable: typeof window.MediaSource === "function",
      audioContextAvailable: typeof (window.AudioContext || window.webkitAudioContext) === "function",
      sdkAudioContextState: "not_exposed_by_SDK",
      mediaSessionAvailable: Boolean(nav.mediaSession),
      mediaSessionPlaybackState: ["none", "paused", "playing"].includes(nav.mediaSession?.playbackState)
        ? nav.mediaSession.playbackState : "unknown",
      getUserMediaAvailable: typeof nav.mediaDevices?.getUserMedia === "function",
      visibility: ["visible", "hidden", "prerender"].includes(document.visibilityState) ? document.visibilityState : "unknown",
      focused: typeof document.hasFocus === "function" ? document.hasFocus() : null,
      userActivationActive: typeof nav.userActivation?.isActive === "boolean" ? nav.userActivation.isActive : null,
      userActivationEver: typeof nav.userActivation?.hasBeenActive === "boolean" ? nav.userActivation.hasBeenActive : null,
      policy: { encryptedMedia: allowed("encrypted-media"), autoplay: allowed("autoplay"), camera: allowed("camera") } };
  }
  function snapshot() { return JSON.parse(JSON.stringify({ ...state, environment: environment() })); }
  function event(name, details = {}) {
    const entry = { event: name, atMs: Date.now(), environment: environment() };
    for (const key of ["type", "status", "ok", "present", "phase", "roundId"])
      if (["string", "number", "boolean"].includes(typeof details[key])) entry[key] = details[key];
    if (name === "sdk_loaded") state.sdkLoaded = true;
    if (name === "connect_start") { state.connectResult = "pending"; state.ready = false; state.deviceIdPresent = false; }
    if (name === "connect_result") state.connectResult = details.ok;
    if (name === "ready") state.ready = true;
    if (name === "device_id_present") state.deviceIdPresent = details.present;
    if (name === "disconnected" || name === "not_ready") { state.ready = false; state.deviceIdPresent = false; }
    if (name === "error" && ["SDK_AUTHENTICATION_ERROR", "SDK_ACCOUNT_ERROR", "SDK_INITIALIZATION_ERROR"].includes(details.type)) {
      state.ready = false; state.deviceIdPresent = false;
    }
    if (name.startsWith("activate_")) state.activateElement = name.slice(9);
    state.events.push(entry); if (state.events.length > 80) state.events.shift();
   
  }
  function probe() {
    if (probing) return probing;
    probing = (async () => {
      const nav = n();
      state.keySystem.result = "pending";
      delete state.keySystem.errorName;
      if (typeof nav.requestMediaKeySystemAccess !== "function") state.keySystem.result = "EME_API_missing";
      else {
        let timer;
        try {
          // One specific audio capability probe, not a guarantee Spotify licenses
          // or its iframe will succeed. No createMediaKeys/createSession calls.
          const access = await Promise.race([
            nav.requestMediaKeySystemAccess("com.widevine.alpha", [{ initDataTypes: ["cenc"],
              audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }], sessionTypes: ["temporary"] }]),
            new Promise(resolve => { timer = setTimeout(() => resolve(null), 5000); }),
          ]);
          state.keySystem.result = access ? "available_for_probe_config" : "probe_timeout";
        } catch (error) { state.keySystem.result = "probe_rejected"; state.keySystem.errorName = safeError(error); }
        finally { clearTimeout(timer); }
      }
      if (typeof nav.permissions?.query === "function") {
        let timer;
        try {
          const permission = await Promise.race([nav.permissions.query({ name: "camera" }),
            new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); })]);
          state.cameraPermission = ["granted", "denied", "prompt"].includes(permission?.state) ? permission.state : "unknown";
        } catch { state.cameraPermission = "query_unsupported"; }
        finally { clearTimeout(timer); }
      }
      event("capability_probe_completed");
    })().finally(() => { probing = null; });
    return probing;
  }
  window.Bamboc.browserDiagnostics = { event, snapshot, probe };
})();
