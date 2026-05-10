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
