# Bamboc-Hit

Gioco musicale vanilla HTML/CSS/JS. Spotify autentica e riproduce; `song.js` contiene ID, titolo, artista, anno e durata verificata. Nessuna richiesta al catalogo Spotify durante il gioco.

## Avvio

Servire questa cartella tramite un server statico HTTPS, oppure HTTP su `127.0.0.1` per sviluppo. Non aprire index.html via file://. Registrare nel dashboard Spotify l'URI esatto restituito da `config.js`, includendo porta, percorso e slash finale. Il callback di produzione resta `https://fbellini22.github.io/bamboc-hit/`.

Occorrono un account Spotify Premium abilitato alla app, un browser con DRM compatibile e accesso alla camera. Dopo un vecchio login senza refresh token è necessario accedere di nuovo. La app non usa un client secret.

Login → attendere player → SCAN → QR → 3 → 2 → 1 → segmento casuale e 45 secondi → REVEAL → NEXT SONG.
SCAN è disponibile soltanto con sessione completa, token non scaduto, connect riuscito e READY con device valido. Token corrotti, callback OAuth invalido e refresh fallito riportano al pulsante LOGIN, cancellando soltanto le chiavi dell'app. Un device non pronto espone **Riconnetti Spotify**, senza avviare un round; **Esci da Spotify** annulla round e richieste, ferma camera/player e invalida la sessione. Una sessione valida salvata può essere recuperata al reload senza un nuovo login interattivo.

In Spotify Developer Dashboard registrare esattamente `https://fbellini22.github.io/bamboc-hit/` come Redirect URI (HTTPS, slash finale, nessuna query). La configurazione del dashboard deve essere verificata dal proprietario; non è modificata dall'app.
QR supportati: URI spotify:track:ID e URL HTTPS open.spotify.com/track/ID, anche query/hash e prefisso intl-it. Album, playlist e link abbreviati non sono risolti.

## Dati

Conservare gli ID stampati. Aggiungere le voci in `window.SONGS` con id/title/artist/year. È possibile aggiungere `durationMs` soltanto se verificata.
Catalogo indicizzato una sola volta; duplicati identici segnalati, conflitti editoriali bloccati. Brano sconosciuto: avviso e scanner ancora utilizzabile.

Le durate vengono verificate offline per l'esatto Spotify ID e salvate come `durationMs`. Il runtime calcola l'offset dai soli dati locali, prepara la connessione durante 3-2-1 e invia il primo play direttamente all'offset dopo il countdown. Non esegue precaricamento a zero, mute, pausa/seek/resume preparatori o transfer separati. Se manca la durata locale, il round viene bloccato esplicitamente. Dopo 1 il countdown scompare, anche se la conferma Spotify tarda; non compaiono scritte intermedie e il timer attende sempre la conferma reale.

Il timer parte solo dopo due campioni SDK coerenti con traccia/offset e avanzamento della posizione. La finestra di posizione tiene conto del tempo reale trascorso dall'invio del comando, senza aumentare il timeout. Un 2xx HTTP non basta a dichiarare PLAYING. Il controllo non misura il primo campione audio fisico e non garantisce latenza zero della rete.

Per aggiornare le durate **solo in manutenzione**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fetch-durations.ps1
node scripts/apply-durations.mjs
```

Il recupero legge l'oggetto strutturato della pagina embed pubblica Spotify, verifica ID e URI esatti e scarta il resto. `duration-verification.json` contiene le evidenze per ID; `duration-report.json` elenca mancanti e anomalie. L'applicazione rifiuta un recupero incompleto e modifica solo durationMs, aggiornando lo stesso campo nelle segnalazioni già note della baseline. Titolo, artista, anno e QR mapping restano invariati. Una verifica fallita lascia la durata mancante; niente valori stimati.

La diagnostica temporanea sul telefono resta visibile sugli errori, con timestamp, round ID e confirmation_started/success/failed/timeout. Non contiene token o payload grezzi. Vedi [report durate e avvio diretto](DURATION_PLAYBACK_REPORT.md).

## Verifiche

Node 22 o successivo; nessuna installazione npm richiesta:

```sh
npm run check
npm test
npm run validate:data
npm run validate:data:ci
npm run validate:dataset
npm run ci
```

La validazione rigorosa segnala un conflitto esistente nel dataset. La variante CI e `validate:dataset` confrontano ogni anomalia con `data-warnings-baseline.json` e falliscono per anomalie nuove/cambiate; mantengono visibili quelle esistenti. Il confronto ignora numeri di riga e soli spazi esterni, preservando ID e contenuti editoriali. Non rigenerare la baseline senza revisione editoriale.

`?debug=1` abilita tempi relativi in console per preparazione e playback. Nessun token viene stampato.
I test simulano SDK, auth, camera e DOM. Il test fisico Premium/mobile resta necessario.

- [Report tecnico completo](AUDIT_REPORT.md)
- [Correzione autenticazione e readiness dopo il test reale](AUTH_FIX_REPORT.md)
- [Elenco anomalie dati](DATASET_AUDIT.md)

Le tab sospese possono impedire la pausa puntuale del browser; il countdown recupera il tempo reale trascorso al ritorno.

Per confrontare Android mobile e sito desktop, aprire **Diagnostica browser temporanea** dopo il tentativo. Il controllo manuale DRM non avvia audio né modifica il player. Procedura e limiti: [report countdown e Android](COUNTDOWN_ANDROID_REPORT.md).
