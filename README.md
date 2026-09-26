# Bamboc-Hit

Gioco musicale vanilla HTML/CSS/JS. Spotify autentica e riproduce; `song.js` controlla esclusivamente titolo, artista e anno. Nessuna richiesta al catalogo Spotify.

## Avvio

Servire questa cartella tramite un server statico HTTPS, oppure HTTP su `127.0.0.1` per sviluppo. Non aprire index.html via file://. Registrare nel dashboard Spotify l'URI esatto restituito da `config.js`, includendo porta, percorso e slash finale. Il callback di produzione resta `https://fbellini22.github.io/bamboc-hit/`.

Occorrono un account Spotify Premium abilitato alla app, un browser con DRM compatibile e accesso alla camera. Dopo un vecchio login senza refresh token è necessario accedere di nuovo. La app non usa un client secret.

Login → attendere player → SCAN → QR → PREPARING e 3-2-1 → VIA! → segmento casuale e 45 secondi → REVEAL → NEXT SONG.
SCAN è disponibile soltanto con sessione completa, token non scaduto, connect riuscito e READY con device valido. Token corrotti, callback OAuth invalido e refresh fallito riportano al pulsante LOGIN, cancellando soltanto le chiavi dell'app. Un device non pronto espone **Riconnetti Spotify**, senza avviare un round; **Esci da Spotify** annulla round e richieste, ferma camera/player e invalida la sessione. Una sessione valida salvata può essere recuperata al reload senza un nuovo login interattivo.

In Spotify Developer Dashboard registrare esattamente `https://fbellini22.github.io/bamboc-hit/` come Redirect URI (HTTPS, slash finale, nessuna query). La configurazione del dashboard deve essere verificata dal proprietario; non è modificata dall'app.
QR supportati: URI spotify:track:ID e URL HTTPS open.spotify.com/track/ID, anche query/hash e prefisso intl-it. Album, playlist e link abbreviati non sono risolti.

## Dati

Conservare gli ID stampati. Aggiungere le voci in `window.SONGS` con id/title/artist/year. È possibile aggiungere `durationMs` soltanto se verificata.
Catalogo indicizzato una sola volta; duplicati identici segnalati, conflitti editoriali bloccati. Brano sconosciuto: avviso e scanner ancora utilizzabile.

Le durate vengono ottenute dallo SDK e memorizzate per ID in sessionStorage. La preparazione verifica volume zero prima del transfer e del caricamento; mette in pausa, cerca il punto casuale e ne verifica la posizione. Ai round successivi il punto casuale è già nel comando play. Preparazione e countdown lavorano in parallelo; se Spotify tarda appare PREPARAZIONE… . VIA viene aggiornato prima del ripristino del volume, dopo la conferma del movimento al punto corretto. Il timer parte dalla successiva conferma SDK. Nessun metadato SDK modifica il reveal.

Il codice non misura il primo campione audio fisico né l'istante di paint del browser. Su iOS il volume SDK non è controllabile: se il mute non viene confermato il round si interrompe prima del transfer/play. Una traccia troppo corta per lasciare 45 secondi, 2 secondi finali e almeno 1 secondo iniziale viene rifiutata esplicitamente. Dopo un errore di preparazione il device viene ritirato, mantenendo il volume scelto per il player sostitutivo, senza riattivare uno stream ambiguo.

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
