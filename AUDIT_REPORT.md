# Audit tecnico Bamboc-Hit

Audit e implementazione: 26 settembre 2026. Repository locale `fbellini22/bamboc-hit`.
Tutti gli otto file originali esaminati; nessun framework, backend, pacchetto npm o servizio aggiunto.
Non è stato effettuato push/deploy. `song.js` è rimasto byte per byte invariato.

## PROBLEMI TROVATI

| File / area originale | Problema e conseguenza | Gravità |
| --- | --- | --- |
| app.js / handleSpotifyTrack | GET /tracks prima di ogni playback: un round trip e parsing JSON sul percorso critico, anche con metadati locali disponibili | high |
| app.js / playRandomSnippet | Trasferimento device prima di ogni brano: latenza e possibili interruzioni della sessione già attiva | high |
| app.js + player.js / waitForPlaybackStart | Attesa registrata dopo PUT play: l'evento poteva arrivare prima del resolver e causare 5 secondi artificiali di attesa | high |
| player.js / conferma | Qualsiasi traccia non in pausa confermava il round, senza controllare ID, caricamento o posizione | high |
| app.js / timeout | Countdown avviato anche se il playback non era stato confermato | high |
| app.js / revealEarly + resetGame | Pause non attese, duplicazione dello stop e NEXT subito disponibile: una vecchia pausa poteva fermare la nuova canzone | critical |
| app.js / errori Spotify | Qualsiasi errore di /tracks cancellava tutto localStorage e ricaricava la pagina; perdita di chiavi di altre app e trattamento errato di 403/404/429/5xx | high |
| app.js / lookup | Ricerca lineare, lookup sull'ID restituito da Spotify anziché sull'ID stampato: possibile mismatch per relinking | high |
| song.js / duplicati | Bohemian Rhapsody e Rimmel condividono un ID; find sceglieva silenziosamente la prima voce | critical |
| song.js / qualità | Duplicato esatto, spazi finali, crediti troncati, typo e separatori disomogenei non segnalati | medium |
| spotify-auth.js / token | Nessuna scadenza, refresh token o refresh condiviso: sessione utilizzabile solo finché vive l'access token | high |
| spotify-auth.js / PKCE | Math.random per verifier, assenza di state e verifica callback; verifier persistente senza scadenza | high |
| config.js / redirect | Origin senza pathname per installazioni diverse da GitHub Pages: callback non coincidente con pagina/URI registrato | medium |
| index.html + player.js / SDK | SDK caricato prima di installare callback e completare OAuth: inizializzazione dipendente dall'ordine di rete | high |
| player.js / readiness | Promise unica senza timeout/rejection, device non invalidato su not_ready, errori solo in console | high |
| player.js / resolver | Un unico resolver globale sostituibile; listener/eventi non correlati al round | high |
| scanner.js / errori QR | Lock impostato prima della validazione e mai rilasciato dopo QR invalido/assente o errore | high |
| scanner.js / stop | Arresto camera atteso prima di avviare la richiesta audio | medium |
| scanner.js / camera | Fallback anche dopo rifiuto permesso; qrbox 280 px maggiore del reader mobile da 250 px | medium |
| app.js / timer | time-- ogni secondo: drift e ritardo di reveal in tab sospesa; ring mai aggiornato | high |
| app.js / rendering | Metadati interpolati in innerHTML; timeout flip non legato alla vita della card | medium |
| app.js / stato | Booleani e variabili globali indipendenti, SCAN disponibile in fasi incompatibili, UI/errori non centralizzati | high |
| style.css / mobile | Altezza fissa 100vh, reader rigido, card alta 160 px: overflow su viewport piccole e titoli lunghi | medium |
| index.html / accessibilità | Inline handlers, niente stato leggibile/disabled coerente, nessun rispetto reduced-motion | medium |
| index.html / dipendenze | html5-qrcode senza versione: aggiornamento CDN non controllato | medium |
| repository / manutenzione | Assenza di test, validazione dataset e CI | medium |

Il vecchio reveal privilegiava già i campi locali quando la lookup riusciva: non è corretto dire che sovrascrivesse sempre titolo e anno. Il problema era la dipendenza preliminare da Spotify, l'ID usato per il lookup e l'assenza di una gestione esplicita dei conflitti.

## MODIFICHE EFFETTUATE

- Namespace `Bamboc` per config, catalogo/logica pura, auth, playback e scanner; stato e riferimenti DOM privati nell'app.
- Flusso verificabile: idle → preparing → scanning → loading → playing → stopping → revealed → preparing. Errori di stop: stop-error → stopping. QR sconosciuti lasciano scanning attivo.
- Catalogo Map creato una sola volta. Snapshot immutabile dei campi locali, nessun fallback editoriale Spotify. ID conflittuali esclusi; duplicati identici indicizzati una volta.
- OAuth PKCE con crypto.getRandomValues, SHA-256, state, verifier per tab con durata di 10 minuti, pulizia callback conservando query/hash estranei.
- Access token, refresh token ed expiresAt conservati in chiave dedicata; refresh con margine di 60 secondi, condiviso tra richieste concorrenti; un solo retry su 401; messaggi distinti per 403/404/429 e timeout.
- Vecchie chiavi `access_token` e `verifier` eliminate soltanto in cleanup auth. Mai `localStorage.clear()`. Le sessioni legacy senza scadenza/refresh richiedono un nuovo login.
- SDK caricato dopo auth, callback installata prima dello script, errore rete/timeout/retry gestiti. Connect e ready attesi insieme, listener rimossi alla conclusione.
- SCAN e NEXT invocano activateElement sincronicamente nel click, poi preparano/trasferiscono il device prima di aprire la camera. Il device resta connesso fra i round.
- Attesa playback registrata prima del comando; controlli su traccia, paused, loading e posizione; fallback con getCurrentState ogni 250 ms solo durante l'attesa, timeout esplicito e cleanup.
- Trasferimento ripetuto solo se non attivo o per un recupero limitato dopo 404. Nessun retry automatico di PUT play dopo un timeout ambiguo.
- Scanner serializza start/stop, blocca rilevazioni duplicate, riapre il lock sui QR rifiutati, usa la posteriore e distingue rifiuto permessi da mancata camera.
- Arresto camera fuori dal percorso critico audio. Prima della prossima apertura lo scanner ritenta l'arresto se necessario.
- REVEAL mostra subito la risposta locale, ma NEXT resta disabilitato durante la pausa SDK e la verifica di arresto. Se fallisce, compare RIPROVA STOP. Un comando pause ancora pendente viene riutilizzato al retry: non viene inviata una seconda pausa capace di scavalcarlo.
- Countdown da timestamp confermato; requestAnimationFrame per ring fluido, timeout alla deadline e ricalcolo al ritorno in primo piano. Nessuna decrementazione cumulativa.
- Rendering con textContent, card adattabile al contenuto, hidden coerente, pulsanti touch/disabled/focus, status aria-live, timer accessibile, viewport dinamica e reduced-motion.
- html5-qrcode fissato a 2.3.8. SDK all'URL ufficiale Spotify (senza inventare una versione non pubblicata).

## PERFORMANCE

Prima: scan → stop camera → GET track → parsing JSON → attesa device → PUT transfer → PUT play → registrazione tardiva waiter → eventuali 5 secondi → countdown.

Adesso: click → attivazione audio + preparazione device + eventuale transfer → scanner. Poi scan → parsing → Map locale → PUT play con URI costruito direttamente → evento SDK/poll di conferma → countdown. La chiusura camera procede indipendentemente.

La preparazione è anticipata al click: non viene eliminato il suo costo iniziale, ma non ricade normalmente fra lettura del QR e primo audio. Non vengono recuperati profilo utente, album o metadati di traccia.

### Punto casuale e compromesso esplicito

Non ci sono durate attendibili nel dataset originale. Senza durata locale/cache è impossibile scegliere con certezza un offset casuale sicuro prima del primo caricamento senza una richiesta aggiuntiva.

Strategia implementata:
1. Durata locale opzionale `durationMs` oppure cache sessionStorage: un solo play con position_ms casuale.
2. Durata sconosciuta: play immediato da zero, lettura durata dal primo stato SDK della traccia, un seek SDK al punto casuale e nuova conferma. Il countdown di 45 secondi parte dalla conferma del segmento scelto.
3. Durata salvata in cache per lo stesso ID stampato, separata dai metadati editoriali.
4. Offset massimo: durata - 45000 - 2000 ms. Tracce più brevi partono da zero; se finiscono prima, il round viene svelato per interruzione.
5. Una durata memorizzata troppo lunga viene corretta se lo stato SDK indica che l'offset scelto è troppo vicino alla fine.

Il primo ascolto di una traccia non in cache può far sentire un breve frammento iniziale prima del salto. È il compromesso adottato per non ritardare il primo audio e mantenere il segmento casuale. Se si vuole sempre e soltanto audio dal punto casuale, servono durate verificate nel database o un pre-caricamento/muting, con costi ulteriori.

### Misure

Aprire `?debug=1`: la console riporta label e millisecondi relativi per preparazione e singolo scan, senza token o metadati della risposta.
Label: audio activation requested, device ready, transfer requested, scanner ready, scan detected, local lookup, play requested, play retried, random seek requested, playback confirmed.

Nessuna misura di latenza reale o miglioramento percentuale viene dichiarata: non era disponibile una sessione audio/camera autenticata. Lo stato SDK conferma ragionevolmente la riproduzione, non misura il suono fisico dagli altoparlanti.

## SPOTIFY

| Fase | Chiamate applicative |
| --- | --- |
| Login/callback | Authorize + POST accounts.spotify.com/api/token con PKCE |
| Refresh | POST token solo quando necessario; nessun client secret |
| SCAN/NEXT | activateElement SDK; connect/ready se necessario; PUT /v1/me/player solo per device non attivo |
| Round normale con durata | PUT /v1/me/player/play?device_id=... con uris e position_ms |
| Primo round senza durata | Stesso PUT play + un seek SDK, salvo offset zero |
| Conferma | Evento player_state_changed; getCurrentState SDK durante attesa (non polling Web API del catalogo) |
| REVEAL/scadenza | pause SDK sul player di questo browser + conferma pausa/null |
| Recupero 404 | Un transfer e un retry play; nessun loop |
| QR invalido/assente/conflittuale | Nessuna richiesta per quella traccia |

L'SDK effettua autonomamente traffico interno: “un PUT” descrive i comandi Web API emessi dall'app, non tutto il traffico di rete Spotify.

Riferimenti verificati: [SDK reference](https://developer.spotify.com/documentation/web-playback-sdk/reference), [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [refresh token](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens), [start playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback), [html5-qrcode 2.3.8](https://github.com/mebjas/html5-qrcode/releases/tag/v2.3.8).

## DATABASE

`song.js` è la source of truth esclusiva per titolo, artista e anno. Il reveal usa i campi della voce locale risolta dall'ID del QR. Stato/durata/identità tecnica dello SDK servono soltanto alla riproduzione. Titoli, nomi artista, anno e ID originali sono invariati.

348 voci, 346 ID distinti, 345 ID utilizzabili: un duplicato esatto non genera due elementi, un ID conflittuale viene bloccato esplicitamente. Non è possibile preservare un risultato corretto per due brani diversi sotto lo stesso ID: il QR viene riconosciuto ma mostra l'avviso di ambiguità finché il curatore non corregge i dati.

## DATASET WARNINGS

Elenco completo, separato per categoria e con numeri delle voci/ID/campi: [DATASET_AUDIT.md](DATASET_AUDIT.md).
39 segnalazioni automatiche: 38 warning e 1 errore. Nessun ID sintatticamente invalido, campo richiesto vuoto, anno fuori intervallo o difetto di encoding rilevato. La validazione sintattica non certifica che un ID Spotify esista o corrisponda al brano indicato.

Il file contiene anche candidati editoriali manuali e alcuni riscontri RAI sugli anni: sono segnalazioni da approvare umanamente, mai regole che modificano il dataset.

## TEST

Eseguiti 44 test nel runtime JavaScript integrato, 44 superati, 0 falliti:
- parsing URI e URL, query/hash/localizzazione; URL ostili, album, HTTP, ID malformati;
- lookup locale/assente, duplicati uguali e conflittuali, validazione campi/anni/durate/formattazione;
- countdown con callback ritardate e posizione casuale con margine;
- transizioni valide e blocco NEXT durante stop/errore;
- refresh concorrente, invalid grant, errori temporanei, 401 con retry singolo, 403/404/429;
- PKCE/state, callback incompleta/scaduta/rifiutata, preservazione parametri URL, timeout abortito;
- evento ready/playback anticipato rispetto alla risoluzione del comando;
- durata sconosciuta/cache, recupero 404, correzione durata obsoleta;
- traccia sbagliata, timeout ready, connect false, not_ready e riconnessione;
- authentication/account/initialization/playback/autoplay errors e pausa fallita;
- identità relinked disponibile nello stato SDK;
- doppia scansione, QR rifiutato, callback fallita, restart e fallback camera;
- flusso completo UI simulato, metadati editoriali esatti, pausa pendente, retry stop;
- nessun countdown prima della conferma, no secondo round da QR ripetuto;
- scadenza automatica, playback fallito e callback QR dopo annullamento;
- typo/troncamento segnalati senza riscrittura;
- pausa in timeout riutilizzata senza duplicare comandi tardivi.

Syntax check dei 7 script browser e controlli HTML/regressione: PASS. `git diff --check`: PASS.
Validazione con baseline: PASS, zero anomalie nuove.
Validazione rigorosa: segnala intenzionalmente l'errore editoriale Bohemian Rhapsody/Rimmel. Non viene dichiarato un dataset privo di errori.

Node/npm non sono nel PATH della shell: i file di test/check/validazione sono stati eseguiti con il runtime JavaScript disponibile, non tramite il comando npm nella shell. CI configurata per Node 22; workflow non ancora eseguito su GitHub.
Non aggiunto un linter/formatter esterno: controlli di sintassi e guardie mirate mantengono zero dipendenze npm.

## FILE MODIFICATI

| File | Scopo |
| --- | --- |
| config.js | Costanti, URI con pathname, flag debug |
| spotify-auth.js | PKCE, callback, token/refresh/errori e client API |
| player.js | Lifecycle SDK, conferma playback, cache durata, seek/stop |
| scanner.js | Lock recuperabile, start/stop, camera fallback |
| app.js | Stato centralizzato, flusso asincrono, timer/ring, reveal/reset |
| index.html | Script defer e ordine, CDN fissata, eventi non inline e accessibilità |
| style.css | Layout mobile, card adattabile, hidden/disabled/focus/reduced-motion |
| core.js (nuovo) | Parser, catalogo, validator, countdown, random offset, transizioni, timeout |
| package.json (nuovo) | Comandi check/test/validazione/CI senza dipendenze |
| tests/run.mjs (nuovo) | Suite di regressione e integrazione con SDK/camera/DOM simulati |
| scripts/check.mjs (nuovo) | Syntax check e guardie anti-regressione |
| scripts/validate-data.mjs (nuovo) | Validazione rigorosa o con baseline esplicita |
| data-warnings-baseline.json (nuovo) | Fingerprint delle anomalie esistenti, inclusi entrambi i record duplicati |
| .github/workflows/ci.yml (nuovo) | Check/test/dati su push e pull request, permessi in lettura |
| .gitignore (nuovo) | Esclusione dipendenze/cache di test |
| README.md (nuovo) | Avvio, auth, comandi, comportamento e verifiche manuali |
| AUDIT_REPORT.md (nuovo) | Questo report |
| DATASET_AUDIT.md (nuovo) | Inventario anomalie editoriali |
| song.js (esaminato, non modificato) | Nessun intervento sui dati curati o QR stampati |

## RISCHI / COSE DA TESTARE MANUALMENTE

1. Spotify Premium reale: login, rinnovo dopo scadenza, account ammesso alla app, URI callback esatto registrato. Nessuna credenziale reale è stata utilizzata nei test.
2. Chrome/Firefox/Edge desktop, Safari iOS e Chrome Android: DRM, activateElement, audio dal click, uscita/rientro in background.
3. Fotocamera fisica: permessi concessi/negati/revocati, selezione posteriore, QR già stampati, luce e autofocus, restart ripetuto.
4. Registrare tempi con debug per cache vuota/piena, Wi-Fi/mobile, rete lenta e dispositivo Spotify cambiato esternamente. Ascoltare il primo frammento prima del seek per accettare il compromesso.
5. Tracce indisponibili per mercato o relinked: il match usa ID/URI e linked_from se presente; senza identità verificabile il round fallisce esplicitamente. Nessuna sostituzione editoriale.
6. Tab/sistema sospeso: il tempo trascorso viene ricalcolato correttamente al risveglio, ma JavaScript non può imporre una pausa audio esattamente alla deadline quando il browser/OS non esegue codice. Questo limite non viene nascosto.
7. Nessuna coda applicativa invia vecchie pause dopo NEXT nel flusso ordinario. Un timeout di rete/SDK non prova che il comando remoto sia cancellato: richieste già ricevute da Spotify possono completarsi tardi. Verificare disconnessione/rete instabile sul servizio reale; NEXT è bloccato se lo stop fallisce.
8. Il browser integrato non era collegato: nessuna verifica visuale/screenshot reale desktop-mobile effettuata. Layout controllato nel codice e interazioni via DOM simulato.
9. Risolvere manualmente l'ID conflittuale, eventuali attribuzioni errate e anni sospetti prima di usare le carte coinvolte. Un ID base62 valido non certifica il collegamento musicale.
10. CI deve essere eseguita su GitHub dopo commit/push. La baseline è una registrazione esplicita del debito editoriale, non una correzione; non rigenerarla automaticamente per nascondere nuovi problemi.
