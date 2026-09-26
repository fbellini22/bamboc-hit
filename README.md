# Bamboc-Hit

Gioco musicale vanilla HTML/CSS/JS. Spotify autentica e riproduce; `song.js` controlla esclusivamente titolo, artista e anno. Nessuna richiesta al catalogo Spotify.

## Avvio

Servire questa cartella tramite un server statico HTTPS, oppure HTTP su `127.0.0.1` per sviluppo. Non aprire index.html via file://. Registrare nel dashboard Spotify l'URI esatto restituito da `config.js`, includendo porta, percorso e slash finale. Il callback di produzione resta `https://fbellini22.github.io/bamboc-hit/`.

Occorrono un account Spotify Premium abilitato alla app, un browser con DRM compatibile e accesso alla camera. Dopo un vecchio login senza refresh token è necessario accedere di nuovo. La app non usa un client secret.

Login → attendere player → SCAN → QR → segmento casuale e 45 secondi → REVEAL → NEXT SONG.
QR supportati: URI spotify:track:ID e URL HTTPS open.spotify.com/track/ID, anche query/hash e prefisso intl-it. Album, playlist e link abbreviati non sono risolti.

## Dati

Conservare gli ID stampati. Aggiungere le voci in `window.SONGS` con id/title/artist/year. È possibile aggiungere `durationMs` soltanto se verificata.
Catalogo indicizzato una sola volta; duplicati identici segnalati, conflitti editoriali bloccati. Brano sconosciuto: avviso e scanner ancora utilizzabile.

Le durate vengono ottenute dallo SDK e memorizzate in sessionStorage. Alla prima riproduzione senza durata si può sentire brevemente l'inizio prima del seek casuale. Ai round successivi lo start casuale è nel comando play. Nessun metadato SDK modifica il reveal.

## Verifiche

Node 22 o successivo; nessuna installazione npm richiesta:

```sh
npm run check
npm test
npm run validate:data
npm run validate:data:ci
npm run ci
```

La validazione rigorosa segnala un conflitto esistente nel dataset. La variante CI confronta ogni anomalia con `data-warnings-baseline.json` e fallisce per anomalie nuove/cambiate; mantiene visibili quelle esistenti. Non rigenerare la baseline senza revisione editoriale.

`?debug=1` abilita tempi relativi in console per preparazione e playback. Nessun token viene stampato.
I test simulano SDK, auth, camera e DOM. Il test fisico Premium/mobile resta necessario.

- [Report tecnico completo](AUDIT_REPORT.md)
- [Elenco anomalie dati](DATASET_AUDIT.md)

Le tab sospese possono impedire la pausa puntuale del browser; il countdown recupera il tempo reale trascorso al ritorno.
