"use strict";
(() => {
  let scanner = null, running = false, locked = false, session = 0;
  let operations = Promise.resolve();
  let blocked = null, stopping = null, cancelUnread = () => {};
  const timeoutError = () => Object.assign(new Error(
    "Fotocamera ancora occupata: attendi e premi RIPROVA STOP. Se non si libera, ricarica la pagina."),
  { code: "SCANNER_BUSY" });
  function enqueue(operation) {
    const result = operations.then(operation);
    // Keep the real operation as the barrier. A timeout must never permit a
    // second camera stream while the library still owns the first one.
    operations = result.catch(() => {});
    let timer;
    const bounded = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        blocked = result;
        ++session; locked = true;
        cancelUnread();
        reject(timeoutError());
      }, window.Bamboc.config.requestTimeoutMs);
      result.then(resolve, reject);
    });
    result.then(() => { if (blocked === result) blocked = null; },
      () => { if (blocked === result) blocked = null; });
    return bounded.finally(() => clearTimeout(timer));
  }
  async function shutdown() {
    if (scanner && running) { await scanner.stop(); running = false; }
    if (scanner) { scanner.clear(); scanner = null; }
  }
  function stop() {
    ++session; locked = true;
    cancelUnread();
    if (stopping) return stopping;
    if (blocked) return Promise.reject(timeoutError());
    const result = enqueue(shutdown);
    stopping = result;
    const settled = () => { if (stopping === result) stopping = null; };
    result.then(settled, settled);
    return result;
  }
  function start(onScan, onError, onStatus = () => {}) {
    if (blocked) return Promise.reject(timeoutError());
    const currentSession = ++session;
    return enqueue(async () => {
      await shutdown();
      if (currentSession !== session) return;
      if (!window.Html5Qrcode) throw new Error("Scanner non caricato. Controlla la connessione e ricarica la pagina.");
      if (!window.isSecureContext) throw new Error("La fotocamera richiede HTTPS o un indirizzo loopback locale.");
      locked = false;
      let unreadTimer;
      const stopUnread = () => { clearTimeout(unreadTimer); unreadTimer = null; };
      cancelUnread = stopUnread;
      // Decode failures are normal frames, not invalid QR payloads. Report an
      // unread QR only after a quiet interval, without flooding or raw payloads.
      const unread = () => {
        if (!unreadTimer && !locked && currentSession === session) {
          unreadTimer = setTimeout(() => {
            if (!locked && currentSession === session)
              onStatus({ code: "QR_NOT_READ", message: "QR non ancora letto. Inquadra tutta la carta e tienila ferma." });
          }, 5000);
        }
      };
      scanner = new window.Html5Qrcode("reader", {
        formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE], verbose: false,
      });
      const options = { fps: 10, qrbox: (width, height) => {
        const size = Math.max(50, Math.floor(Math.min(width, height) * 0.75));
        return { width: size, height: size };
      } };
      const decoded = text => {
        if (locked || currentSession !== session) return;
        stopUnread();
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
          await scanner.start({ facingMode: "environment" }, options, decoded, unread);
        } catch (error) {
          if (currentSession !== session) return;
          const detail = String(error?.name || "") + " " + String(error);
          if (/NotAllowed|Permission|denied|Security/i.test(detail))
            throw new Error("Accesso alla fotocamera negato. Abilitalo nelle impostazioni del browser e riprova.");
          const cameras = await window.Html5Qrcode.getCameras();
          if (currentSession !== session) return;
          if (!cameras.length) throw new Error("Nessuna fotocamera disponibile.");
          const camera = cameras.find(item => /back|rear|environment|posteriore/i.test(item.label)) || cameras[0];
          await scanner.start(camera.id, options, decoded, unread);
        }
        running = true;
        if (currentSession !== session) await shutdown();
      } catch (error) {
        stopUnread();
        await shutdown();
        throw error;
      }
    });
  }
  window.Bamboc.scanner = { start, stop };
})();
