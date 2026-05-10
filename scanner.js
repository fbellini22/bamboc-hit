let scanner = null;

/* =========================
   START SCANNER
========================= */

async function startScanner() {
  const reader = document.getElementById("reader");

  if (!reader) {
    console.error("Elemento #reader non trovato");
    return;
  }

  reader.innerHTML = "";

  /* evita scanner duplicati */

  if (scanner) {
    try {
      await scanner.stop();
    } catch (e) {}
    scanner = null;
  }

  scanner = new Html5Qrcode("reader");

  const config = {
    fps: 15,
    qrbox: { width: 280, height: 280 },
  };

  try {
    /* PRIMA PROVA CAMERA POSTERIORE */

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

      await scanner.start(
        cameraId,

        config,

        onScanSuccess,

        onScanError,
      );
    } catch (err2) {
      console.error("Errore avvio scanner:", err2);
      alert("Errore accesso fotocamera");
    }
  }
}

/* =========================
   SUCCESS
========================= */

function onScanSuccess(qrCodeMessage) {
  console.log("QR trovato:", qrCodeMessage);

  if (navigator.vibrate) {
    navigator.vibrate(200);
  }

  if (scanner) {
    scanner.stop();
  }

  if (typeof handleSpotifyTrack === "function") {
    handleSpotifyTrack(qrCodeMessage);
  }
}

/* =========================
   ERROR (IGNORATO)
========================= */

function onScanError(error) {
  /* ignoriamo errori continui */
}

/* =========================
   EXTRACT TRACK ID
========================= */

function extractTrackId(url) {
  if (!url) return null;

  try {
    const match = url.match(/track\/([a-zA-Z0-9]+)/);

    if (match && match[1]) {
      return match[1];
    }

    return null;
  } catch (err) {
    console.error("Errore parsing track ID:", err);
    return null;
  }
}
