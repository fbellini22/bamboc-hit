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
