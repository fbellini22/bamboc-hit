<<<<<<< ours
"use strict";
(() => {
  let scanner = null, running = false, locked = false, session = 0;
  let operations = Promise.resolve();
  function enqueue(operation) {
    const result = operations.then(operation);
    operations = result.catch(() => {});
    return result;
  }
  async function shutdown() {
    if (scanner && running) { await scanner.stop(); running = false; }
    if (scanner) { scanner.clear(); scanner = null; }
  }
  function stop() {
    ++session; locked = true;
    return enqueue(shutdown);
  }
  function start(onScan, onError) {
    const currentSession = ++session;
    return enqueue(async () => {
      await shutdown();
      if (currentSession !== session) return;
      if (!window.Html5Qrcode) throw new Error("Scanner non caricato. Controlla la connessione e ricarica la pagina.");
      if (!window.isSecureContext) throw new Error("La fotocamera richiede HTTPS o un indirizzo loopback locale.");
      locked = false;
      scanner = new window.Html5Qrcode("reader", {
        formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE], verbose: false,
      });
      const options = { fps: 10, qrbox: (width, height) => {
        const size = Math.max(50, Math.floor(Math.min(width, height) * 0.75));
        return { width: size, height: size };
      } };
      const decoded = text => {
        if (locked || currentSession !== session) return;
        locked = true;
        Promise.resolve().then(() => {
          if (currentSession !== session) return true;
          return onScan(text);
        }).then(accepted => {
          if (!accepted && currentSession === session) locked = false;
        }).catch(error => {
          if (currentSession === session) { locked = false; onError(error); }
        });
      };
      try {
        try {
          await scanner.start({ facingMode: "environment" }, options, decoded, () => {});
        } catch (error) {
          if (currentSession !== session) return;
          const detail = String(error?.name || "") + " " + String(error);
          if (/NotAllowed|Permission|denied|Security/i.test(detail))
            throw new Error("Accesso alla fotocamera negato. Abilitalo nelle impostazioni del browser e riprova.");
          const cameras = await window.Html5Qrcode.getCameras();
          if (currentSession !== session) return;
          if (!cameras.length) throw new Error("Nessuna fotocamera disponibile.");
          const camera = cameras.find(item => /back|rear|environment|posteriore/i.test(item.label)) || cameras[0];
          await scanner.start(camera.id, options, decoded, () => {});
        }
        running = true;
        if (currentSession !== session) await shutdown();
      } catch (error) {
        await shutdown();
        throw error;
      }
    });
  }
  window.Bamboc.scanner = { start, stop };
})();
=======
let scanner = null;
let scannerLock = false;

/* =========================
   START SCANNER
========================= */

async function startScanner() {
  const reader = document.getElementById("reader");

  if (!reader) {
    console.error("Elemento #reader non trovato");
    return;
  }

  scannerLock = false;
  reader.innerHTML = "";

  if (scanner) {
    try {
      await scanner.stop();
    } catch (e) {
      /* ignore */
    }
    scanner = null;
  }

  scanner = new Html5Qrcode("reader");

  const config = {
    fps: 15,
    qrbox: { width: 280, height: 280 },
  };

  try {
    await scanner.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanError,
    );
  } catch (err) {
    console.warn("Environment camera non disponibile, provo fallback");

    try {
      const devices = await Html5Qrcode.getCameras();

      if (!devices || devices.length === 0) {
        alert("Nessuna fotocamera trovata");
        return;
      }

      let cameraId = devices[0].id;

      devices.forEach((device) => {
        const label = (device.label || "").toLowerCase();

        if (
          label.includes("back") ||
          label.includes("rear") ||
          label.includes("environment")
        ) {
          cameraId = device.id;
        }
      });

      await scanner.start(cameraId, config, onScanSuccess, onScanError);
    } catch (err2) {
      console.error("Errore avvio scanner:", err2);
      alert("Errore accesso fotocamera");
    }
  }
}

async function onScanSuccess(qrCodeMessage) {
  if (scannerLock) return;
  scannerLock = true;

  if (navigator.vibrate) {
    navigator.vibrate(200);
  }

  if (scanner) {
    try {
      await scanner.stop();
    } catch (e) {
      console.warn("Errore stop scanner:", e);
    }
  }

  if (typeof handleSpotifyTrack === "function") {
    await handleSpotifyTrack(qrCodeMessage);
  }
}

function onScanError(error) {
  /* ignoriamo errori continui */
}

function extractTrackId(value) {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  const idPattern = /^[A-Za-z0-9]{22}$/;

  const uriMatch = trimmed.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
  if (uriMatch && idPattern.test(uriMatch[1])) return uriMatch[1];

  const urlMatch = trimmed.match(
    /^https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})(?:\?.*)?$/i,
  );
  if (urlMatch && idPattern.test(urlMatch[1])) return urlMatch[1];

  return null;
}
>>>>>>> theirs
