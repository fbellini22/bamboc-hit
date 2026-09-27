# Verifica conservativa della versione finale

Baseline: working tree inizialmente pulito, commit `407db1a`. L'utente ha confermato
il funzionamento reale su Android/Chrome mobile e iPhone **prima** di questa pulizia.
Questa sessione non effettua prove fisiche con Spotify né pubblicazione.

## Modifiche e classificazione file

| Categoria | File | Decisione |
| --- | --- | --- |
| Runtime necessario | `app.js`, `config.js`, `index.html`, `player.js`, `style.css` | Rimossi pannelli e lavoro diagnostico normale; messaggi/error handling conservati. |
| Runtime invariato | `spotify-auth.js`, `scanner.js`, `core.js`, `song.js` | Nessuna modifica al contenuto. |
| Osservatori utili ai test | `browser-diagnostics.js`, `oauth-diagnostics.js` | Spostati in `tests/support/browser-observer.js` e `oauth-observer.js`; rimossi rendering, mount e listener UI. Non importati dalla pagina. |
| Regressioni permanenti | `tests/run.mjs`, `tests/support/README.md` | Test esistenti mantenuti/adattati e nuove verifiche in modalità produzione senza osservatori. |
| Documentazione corrente | `README.md`, questo report | Descrivono la versione senza pannelli e i limiti della verifica. |
| Evidenza storica utile | `OAUTH_ANDROID_FIRST_LOGIN.md`, `OAUTH_DIAGNOSIS.md`, `PLAYBACK_DIAGNOSIS.md`, `PHONE_PLAYBACK_FINDINGS.md`, `COUNTDOWN_ANDROID_REPORT.md` | Conservati con avviso storico: le vecchie istruzioni sui pannelli non si applicano più. |
| Audit/dati permanenti | `AUDIT_REPORT.md`, `AUTH_FIX_REPORT.md`, `DATASET_AUDIT.md`, `DURATION_PLAYBACK_REPORT.md`, `duration-verification.json`, `duration-report.json`, baseline e script durate | Conservati: motivano regressioni, dati verificati e conflitti editoriali. Non sono dump da eliminare. |
| Temporaneo senza utilità | `FULL_DIFF.txt` | Eliminato: copia obsoleta di un diff, sostituita dalla storia Git e dai report. |

Non eliminati file di dubbia utilità: preferito conservare gli audit storici.
L'eventuale `debug.log` generato localmente dall'eseguibile dei test viene rimosso.

## UI e diagnostica residua

Eliminati tutti e tre i pannelli, il pulsante DRM/camera, i dump JSON visibili, i relativi
selector/subscriber e cinque regole CSS. Aggiornato il messaggio `initialization_error`
che rimandava al pannello eliminato: ora invita a consentire contenuti protetti e riconnettere.

Nel normale uso non vengono caricati gli osservatori OAuth/browser: nessun journal,
sonda EME/permessi, raccolta UA/environment o listener focus/blur diagnostico.
I vecchi dati diagnostici eventualmente presenti nella sessione non vengono letti né
aggiornati dalla versione finale; nessuna pulizia indiscriminata dello storage.

Le chiamate opzionali agli osservatori restano come punti di osservazione per i test;
non sono dipendenze funzionali. Le tracce player dettagliate restano disponibili solo
con `?debug=1` e nel harness. Senza debug: nessuna timeline continua, snapshot JSON,
campionamento del clock diagnostico o callback extra per registrare completamenti.
Rimangono piccoli campi per-round condivisi col supporto debug, senza polling aggiuntivo.
Non è stato intrapreso un refactoring del player per rimuoverli.

La console normale conserva solo eventi `error`/`round_failed` con campi filtrati;
nessun token, code, verifier, payload grezzo o dump storage. Il flag debug non viene
più ereditato dallo storage: serve il parametro esplicito nella pagina corrente.

Rimossi inoltre messaggi di sanitizzazione relativi al vecchio preload/mute/seek,
non più prodotti dal runtime, e corretto il commento obsoleto sulla preparazione muta.

## Confronto funzionale con la baseline

Diff confrontato con `407db1a`: OAuth/PKCE/token/refresh/redirect, scanner, core,
dataset, baseline anomalie e prove delle durate sono byte-identici.
I cambiamenti di app/player riguardano soltanto osservazione e presentazione.
Nessun cambio a SDK connect/READY/device, activateElement sincrono nella gesture,
camera, round/connection epoch, AbortController, timeout, countdown, randomizzazione,
richiesta play, predicati di conferma, polling funzionale, STOP/REVEAL/NEXT.

Percorso ricontrollato: boot attende callback e token → SDK connect e READY/device →
SCAN/activateElement → camera → QR/lookup locale → durationMs e offset locale → camera
chiusa e 3-2-1 → numero nascosto → un play con device/URI/position_ms → due letture SDK
coerenti con avanzamento → PLAYING/timer 45s → STOP confermato → REVEAL locale → NEXT.
Un HTTP 204 da solo continua a non abilitare PLAYING.

## Copertura di regressione

I 139 test applicativi precedenti sono conservati; quelli del pannello ora verificano
esito funzionale e snapshot osservati direttamente, non elementi DOM rimossi.
Gli osservatori dei test non simulano il successo fisico di DRM/Spotify.
Sei nuovi test `release:` verificano HTML/CSS senza diagnostica, percorso completo
senza osservatori, callback reale simulata senza journal, errori OAuth/SDK, durata
mancante/HTTP e logging sicuro. Il fake DOM in produzione rifiuta selector diagnostici.
Il test completo rende anche UA/EME/permessi/clock diagnostico inaccessibili: il round
deve riuscire senza consultarli.

Copertura richiesta: metadata esclusivamente locali; nessun GET tracks; durata locale
e mancante; offset valido; assenza preload-zero/seek; 3-2-1 una sola volta; nessun
Preparazione/VIA; play diretto; conferma prima di PLAYING/timer; STOP; REVEAL locale;
NEXT/eventi tardivi; logout asincrono; callback invalida; READY/device prima di SCAN;
doppio tap; chiusura camera; conflitti dataset bloccati. Coperti dai test esistenti
più il percorso produzione aggiunto.

## Problemi conservati e test fisico

Il conflitto Queen/Rimmel per `515XcapFOMtOOiGU31UqNp` resta bloccato e segnalato,
con tutte le altre anomalie note. Nessuna correzione editoriale inventata.
Le osservazioni storiche sul reload durante token exchange o chiamate dirette
concorrenti restano documentate; nessuna correzione preventiva introdotta.

Dopo l'eventuale pubblicazione dell'utente, un breve smoke test Android/iPhone deve
confermare assenza pannelli, login/SCAN/camera, 3-2-1, audio dall'offset, STOP/REVEAL/NEXT.
Autoplay/DRM, autorizzazioni, lifecycle mobile e udibilità richiedono browser/Spotify
reali e non sono dichiarati verificati automaticamente in questa sessione.

## Esiti finali

- `tests/run.mjs`: **145 test, 0 fallimenti**; `tests/core.test.js`: **2 test, 0 fallimenti**.
  Totale **147 test superati**, nessuno saltato.
- `scripts/check.mjs`: PASS, 7 JS di runtime, riferimenti HTML, sintassi ricorsiva
  JS/MJS, JSON e marker conflitti (inclusi gli osservatori di test).
- `scripts/validate-data.mjs --baseline` e `scripts/validate-dataset.js`: PASS,
  **29 segnalazioni note, 0 nuove/modificate**.
- `scripts/validate-data.mjs` rigoroso: exit 1 atteso per il conflitto editoriale
  preesistente; non dichiarato superato e non aggirato.
- `git diff --check`: PASS. Ricerca marker Git: nessun conflitto.
- Nessun selector dei pannelli rimossi nel runtime, import dei vecchi moduli,
  GET metadata tracks, play a zero, seek/setVolume/resume preparatori o messaggio
  Preparazione/VIA. I punti di osservazione opzionali rimasti sono intenzionali,
  usati dal harness; nessun riferimento DOM pendente.
- `node`/`npm` non disponibili nel PATH: eseguiti direttamente gli script equivalenti
  tramite Node 24.18.1 incorporato in VS Code (`ELECTRON_RUN_AS_NODE=1`), **non npm**.
  Il warning locale Crashpad non ha impedito le verifiche.
- Ricontrollato il diff rispetto alla baseline iniziale pulita: nessun cambiamento
  funzionale individuato. Nessuna nuova richiesta, attesa, timeout o polling introdotto.

Stato Git finale (modifiche non staged; gli spostamenti risultano D/?? fino all'eventuale staging):

```text
 M COUNTDOWN_ANDROID_REPORT.md
 D FULL_DIFF.txt
 M OAUTH_ANDROID_FIRST_LOGIN.md
 M OAUTH_DIAGNOSIS.md
 M PHONE_PLAYBACK_FINDINGS.md
 M PLAYBACK_DIAGNOSIS.md
 M README.md
 M app.js
 D browser-diagnostics.js
 M config.js
 M index.html
 D oauth-diagnostics.js
 M player.js
 M style.css
 M tests/run.mjs
?? RELEASE_CHECK.md
?? tests/support/
```

Nessun commit e nessun push effettuati.
