# Diagnosi OAuth e raccolta del prossimo test reale

> Report storico dell’indagine. La versione finale non espone più i pannelli temporanei qui descritti; vedere [verifica finale](RELEASE_CHECK.md). Il contenuto resta come evidenza delle regressioni e delle decisioni.

Analisi della base locale `a467a4a` (Fix Spotify authentication and player readiness).
Modifiche diagnostiche locali, senza commit o push. La causa del fallimento nel browser
di produzione **non è determinabile dal solo codice**. Il sito Pages non è risultato
accessibile allo strumento web usato in questa sessione: nessuna verifica della build
effettivamente servita, del Dashboard Spotify o dello storage del browser dell'utente.

## Configurazione effettiva

- `config.js`, `clientId`: `1031669a52cf4742b6e908a536a247e5`.
- Con hostname `fbellini22.github.io`, `redirectUri` è la costante
  `https://fbellini22.github.io/bamboc-hit/`.
- Non viene ricavata da query/hash, protocollo o pathname della pagina su questo host.
  Anche entrando da `index.html`, il valore rimane HTTPS, path corretto e slash finale.
- `login()` inserisce `config.redirectUri` in `/authorize`;
  `handleRedirect()` passa lo stesso valore a `tokenRequest()` per `/api/token`.
- Nessun client secret. Il client ID è pubblico; non posso confermare che coincida
  con l'app nel Dashboard senza la configurazione effettiva del proprietario.
- Il Dashboard deve contenere esattamente la URI sopra. La documentazione ufficiale
  descrive gli stessi parametri PKCE e richiede la stessa redirect URI nello scambio:
  [Spotify Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow).

## Flusso, funzione per funzione

| Passaggio | File / funzione | Input | Output | Errore possibile / diagnosi |
| --- | --- | --- | --- | --- |
| Click login | `app.js`, listener `login-btn` | Stato AUTH_REQUIRED, gesto utente | Chiama `auth.login()`, poi UI AUTHENTICATING | Click ignorato se stato diverso o pagina in uscita |
| Reset prima della nuova transazione | `spotify-auth.js`, `login()` → `clear()` | Vecchia sessione | Incrementa epoch, interrompe richieste, elimina vecchi token/PKCE, notifica app/player | Storage non disponibile: rimozione best effort; non esiste ancora il nuovo verifier |
| Verifier e state | `spotify-auth.js`, `randomString()` | Due chiamate crypto, 32 byte casuali ciascuna | Due stringhe hex indipendenti di 64 caratteri | `PKCE_CRYPTO_FAILED` |
| Challenge | `spotify-auth.js`, `login()` | Verifier UTF-8 | SHA-256, base64url senza padding, S256 | `PKCE_CRYPTO_FAILED`; epoch cambiato annulla login |
| Persistenza | `spotify-auth.js`, `login()` | Verifier, state, timestamp | JSON in sessionStorage `bamboc.spotify.pkce` | `PKCE_STORAGE_FAILED`, nessun redirect |
| Redirect | `spotify-auth.js`, `login()` | client ID, URI, scope, challenge, state | `location.assign` verso accounts.spotify.com/authorize | `OAUTH_REDIRECT_FAILED`; un rifiuto sulla pagina Spotify precede la callback e non è osservabile dal nostro JS |
| Nuovo documento | `index.html`, script defer | URL di ritorno, storage della scheda | Ordine config → core → auth → player → scanner → song → app | Errore di caricamento/script esterno può impedire boot; nessuna callback se Spotify non torna alla pagina |
| Lettura iniziale sessione | `spotify-auth.js`, inizializzazione modulo | localStorage `bamboc.spotify.tokens` | Copia token in memoria, senza validarli/rinnovarli/cancellarli | JSON corrotto ignorato; PKCE non toccato |
| Boot | `app.js`, `boot()` → `connectSpotify(true)` | Stato iniziale | Render, avvisi dataset, poi `await auth.handleRedirect()` | Nessun getToken prima della callback |
| Rilevamento callback | `spotify-auth.js`, `handleRedirect()` | Presenza di code/state/error/error_description | `callback_detected`, lettura code e JSON PKCE | Storage bloccato/corrotto o assente confluisce in verifier mancante |
| Pulizia URL e consumo PKCE | `spotify-auth.js`, `handleRedirect()` | URL e copia PKCE locale | Rimuove solo parametri OAuth, conserva altre query/hash; elimina record PKCE dallo storage | La copia locale resta disponibile; un reload successivo non può riutilizzare il code |
| Verifica callback | `spotify-auth.js`, `handleRedirect()` | Verifier, state URL/salvato, createdAt, code/error | `state_valid`, `verifier_found` | `PKCE_VERIFIER_MISSING`, `OAUTH_STATE_MISMATCH`, `OAUTH_TRANSACTION_EXPIRED` (>10 minuti o timestamp futuro/non valido), `OAUTH_CALLBACK_INCOMPLETE` |
| Negazione consenso | `spotify-auth.js`, `handleRedirect()` | Parametro error dopo validazione transazione | Login richiesto, nessuno scambio | `OAUTH_ACCESS_DENIED`; non viene stampato error_description |
| Scambio | `spotify-auth.js`, `handleRedirect()` → `tokenRequest()` | grant_type authorization_code, code, identica redirect_uri, verifier; aggiunta client_id | POST form-urlencoded a accounts.spotify.com/api/token | `TOKEN_EXCHANGE_400`, `TOKEN_EXCHANGE_401`, altro status HTTP, `TOKEN_EXCHANGE_NETWORK` (rete/abort/timeout) |
| Risposta e salvataggio | `spotify-auth.js`, `tokenRequest()` | access_token, refresh_token, expires_in | Validazione stringhe/scadenza; memoria e localStorage `bamboc.spotify.tokens`; `token_exchange_success` | `TOKEN_RESPONSE_INVALID`, status preservato; storage token bloccato lascia sessione in memoria |
| Validazione / rinnovo | `app.js`, `connectSpotify()` → `auth.getToken()` | Sessione appena scambiata, oppure salvata se non c'era callback | `token_valid`, oppure refresh deduplicato | `TOKEN_EXPIRED` segnala scadenza prima del rinnovo; `REFRESH_FAILED` conserva fase/status e forza login |
| SDK | `player.js`, `prepare()` → `loadSDK()` | Token disponibile | Script SDK pronto, `sdk_loaded`, istanza Player | `SDK_LOAD_FAILED` |
| OAuth callback SDK | `player.js`, `createPlayer()` → `getOAuthToken` | Richiesta del SDK | `auth.getToken()` consegnato solo all'istanza corrente | Fallimento del rinnovo diagnosticato in AUTH; nessun token loggato |
| Connect | `player.js`, `prepare()` | Istanza corrente, listener già registrati | `connect_start`, Promise connect e attesa ready in parallelo | `PLAYER_CONNECT_FAILED` per false/rejection/timeout |
| READY e device | `player.js`, listener ready | Evento SDK con device_id | `ready`, `device_id_present` booleano, ID conservato solo internamente | `DEVICE_MISSING`; mancato evento: `PLAYER_READY_TIMEOUT` |
| Errori SDK | `player.js`, listener dedicati | authentication_error/account_error/initialization_error | Diagnosi `SDK_AUTHENTICATION_ERROR`, `SDK_ACCOUNT_ERROR`, `SDK_INITIALIZATION_ERROR` | Solo authentication_error richiede login; account_error espone Premium/account autorizzato, initialization_error DRM/browser |
| Abilitazione SCAN | `app.js`, `connectSpotify()` → `canScan()` / `render()` | Token valido, connect riuscito, READY, device; fotocamera arrestata | PLAYER_READY e `scan_enabled` | Fallimento precedente mantiene SCAN disabilitato; epoch impedisce completamenti obsoleti |

`getOAuthToken`, READY e risoluzione della Promise connect possono interlecciarsi:
READY può precedere `connect_result`. Non devono essere interpretati come una
sequenza strettamente lineare. SCAN richiede entrambi più un device valido.

## Persistenza PKCE e ordine reale

Verifier e state sono entrambi nel JSON `sessionStorage["bamboc.spotify.pkce"]`,
con `createdAt`. Non sono solo in memoria. sessionStorage è appropriato per un
redirect nella stessa scheda e sullo stesso origin; non garantisce continuità se
si cambia scheda, browser, contesto di navigazione o se lo storage è cancellato.
Queste sono condizioni da verificare nel test reale, non cause accertate.

All'avvio auth legge solo i vecchi token, player legge solo la cache durate e registra
il subscriber di invalidazione. App registra i suoi listener e chiama boot.
`boot → connectSpotify(true) → await handleRedirect → await getToken → prepare`.
La callback valida fa `tokens = null` prima dello scambio per non ereditare il vecchio
refresh token; non chiama `clear()`. I reset app/player non cancellano PKCE da soli.

La rimozione esplicita del record PKCE nella callback avviene **dopo la lettura** e
**prima dello scambio**: è consumo della transazione, non perdita del verifier.
Il POST riceve la copia locale. Il test con caricamento in due contesti VM distinti
verifica proprio questa proprietà. `clear()` cancella PKCE a login/logout/errore;
non viene chiamato dal recupero sessione prima della callback nel boot attuale.

## Cosa è accertato e cosa manca

Il vecchio messaggio letterale "Login non valido o scaduto" proveniva dal controllo
aggregato di `handleRedirect`, prima della richiesta token. Se quel messaggio proviene
dalla build analizzata, restringe la fase al controllo della transazione callback,
ma non identifica quale condizione sia fallita. Il difetto accertato è la perdita
di diagnosi tra condizioni diverse, non un errore PKCE dimostrato in produzione.

Non è emerso un percorso che abiliti SCAN dopo auth fallita nella build locale:
UI, begin e callback scanner hanno controlli; reset invalida anche gli async obsoleti.
I test provocano callback/token/SDK/READY falliti e verificano il blocco. Questo non
dimostra quale build fosse servita durante il test reale. Un timeout di riproduzione
successivo a una connessione riuscita rimane un evento distinto e non prova che il
precedente scambio OAuth fosse fallito.

`token_valid` significa forma/scadenza locali valide, non una nuova verifica remota
del token: il SDK può ancora rifiutarlo e produrre la propria diagnosi distinta.

## Modifiche limitate alla diagnostica

- `config.js`: logger con campi consentiti e versione `oauth-diag-1`; opt-in tramite
  `?debug=1`, persistente nella scheda con chiave `bamboc.spotify.diagnostics`.
  `?debug=0` lo spegne anche per i caricamenti successivi. Parametri OAuth invariati.
- `spotify-auth.js`: eventi delle fasi e `diagnosticCode`, `phase`, `status` sugli
  errori. `code=AUTH_REQUIRED` resta la categoria UI per mantenere il reset autorizzato,
  ma la causa specifica non viene più persa. Messaggi remoti arbitrari non stampati.
- `player.js`: diagnosi specifiche per SDK/connect/READY/device, senza loggare ID o
  messaggi SDK. Nessun cambiamento alla preparazione o riproduzione dei brani.
- `app.js`: log sicuri al posto degli oggetti Error, evento `scan_enabled`.
- `tests/run.mjs`: dieci test nuovi, alcuni parametrizzati, per ordine, reload,
  URI, errori distinti, SCAN, persistenza opt-in e assenza di segreti nei log.

Invariati song.js, dataset, durationMs, countdown, random offset, reveal, NEXT,
metadati editoriali ed endpoint. Nessun refactoring del flusso OAuth o del gioco.

## Verifiche

- 99 test VM passati, zero fallimenti; inclusi i precedenti 89.
- 2 test core passati: totale 101.
- Check sintassi JS/MJS, JSON, riferimenti HTML e marker di conflitto passato.
- Validazione dataset con baseline: 29 problemi già noti, zero nuovi o modificati.
- `git diff --check` passato. Nessun commit/push.
- Eseguiti gli script con Node integrato in VS Code (`ELECTRON_RUN_AS_NODE=1`),
  perché node/npm non sono nel PATH. Non è un test hardware/browser Spotify reale.

## Prossimo test reale: dati da raccogliere

1. Dopo aver pubblicato questa diagnostica, aprire nella scheda da usare per tutto
   il login `https://fbellini22.github.io/bamboc-hit/?debug=1`.
2. Aprire DevTools Console, abilitare **Preserve log** e il livello **Verbose/Debug**;
   fare un reload con cache disabilitata e poi cliccare Login con Spotify.
3. Verificare che gli eventi BAMBOC abbiano `version: oauth-diag-1`.
   L'assenza può indicare build precedente, console filtrata oppure codice non avviato:
   non attribuirla automaticamente a OAuth.
4. Copiare solo le righe `[BAMBOC AUTH]` e `[BAMBOC PLAYER]` con i relativi campi
   espansi: ordine, ultima fase riuscita, `phase`, `type`, `status`, `ok`, `present`.
   Il client ID e la redirect URI registrati sono pubblici e servono al confronto.
5. Segnalare browser/OS, uso della stessa scheda, eventuale passaggio a un altro
   browser/app, se si ritorna effettivamente a Pages, e testo UI. Se il rifiuto avviene
   sulla pagina Spotify prima del ritorno, riportarne solo il messaggio visibile.
6. Se SCAN appare dopo un errore, includere anche l'eventuale `scan_enabled` successivo:
   aiuta a distinguere un recupero riuscito da un'abilitazione incoerente.
7. Non inviare URL callback completi, HAR, payload di rete, dump dello storage,
   access/refresh token, authorization code, verifier o client secret.
8. Terminato il test, aprire `https://fbellini22.github.io/bamboc-hit/?debug=0`.

Il prossimo intervento sul comportamento deve basarsi su questa traccia reale.
