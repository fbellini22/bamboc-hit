# Correzione autenticazione e readiness Spotify

Audit del 26 settembre 2026, base locale inizialmente pulita: `a6577e43a3a65f4d407161ba908b96de19ce380c`. Nessun commit/push. `song.js`, configurazione OAuth, scanner e flusso 3-2-1 non modificati. Questo documento aggiorna le conclusioni sull'autenticazione del precedente AUDIT_REPORT.md.

## 1. Causa identificata e riproduzione

Il vecchio `app.js` confondeva **token recuperato** con **player pronto**. In `boot()`, dopo `auth.getToken()`, impostava subito `authenticated = true`. Soltanto dopo attendeva `playback.prepare()`. Se connect/READY fallivano, `report()` riportava al login esclusivamente gli errori `LoginRequired`; gli errori SDK erano normali `Error`. Il `finally` azzerava comunque `booting`, e `render()` abilitava SCAN in base a quella variabile senza verificare player/device.

Ho riprodotto il problema in un harness temporaneo caricando tramite `git show HEAD:<file>` **app.js, player.js e spotify-auth.js originali**, non soltanto la versione corretta:

| Scenario simulato con sessione salvata | Vecchio LOGIN nascosto | Vecchio SCAN abilitato | Player disconnesso |
| --- | --- | --- | --- |
| connect restituisce false | sì | sì | sì |
| SDK authentication_error | sì | sì | sì |

Altri difetti collegati: token caricati dal JSON senza validare tipo/completezza; refresh 503/rete restituito come errore generico; errori SDK ignorati dalla UI in IDLE/SCANNING; `prepare()` poteva restituire un vecchio device senza ricontrollare auth; `activate()` poteva creare un player fuori dalla procedura autenticata; callback OAuth errata non eliminava la vecchia sessione; UI login e cleanup del player erano separati.

**Limite della diagnosi del test reale:** il percorso con storage realmente vuoto già avrebbe dovuto fermarsi al login. Anche il messaggio preciso “Login non valido o scaduto” generato dal controllo PKCE arrestava il boot. Non posso ricostruire quale token/query/versione fosse nel browser dell'utente né affermare che tutti i messaggi osservati derivino da una singola esecuzione. Il passaggio errato a SCAN con sessione salvata rifiutata dal player è invece riprodotto. La pagina Pages non era accessibile dal tool di verifica; configurazione dashboard e build effettivamente servita non sono state certificate.

## 2. Flusso e funzioni responsabili prima del fix

1. `spotify-auth.js`: legge `bamboc.spotify.tokens` da localStorage all'esecuzione dello script.
2. `app.boot()` chiama `auth.handleRedirect()`: legge code/state, cerca verifier/state/createdAt in sessionStorage, pulisce URL, verifica PKCE e scambia code/token.
3. `auth.getToken()`: accetta accessToken truthy ed expiresAt confrontabile, oppure tenta refresh; mancanza refresh produce LoginRequired, alcuni altri fallimenti erano errori generici.
4. `boot()` imposta authenticated=true e nasconde LOGIN **prima** della readiness.
5. `player.prepare()`: token → caricamento SDK → Player → connect + evento ready. Scorciatoia iniziale su deviceId già presente.
6. Errori SDK di autenticazione generici; `app.playback.onError` li gestiva solo in PREPARING/PLAYING.
7. `boot.finally` imposta booting=false anche dopo fallimento → `render()` abilita SCAN senza verificare device/connessione.
8. `begin()` attiva l'elemento e apre lo scanner; i problemi auth/device emergono soltanto durante preparazione/playback, come timeout o retry inefficace.

## 3. Modifiche effettuate

| File | Correzione |
| --- | --- |
| core.js | SpotifyError con codice esplicito e classificazione condivisa |
| spotify-auth.js | Validazione di accessToken/refreshToken/expiry, hasValidToken, evento di invalidazione, abort delle richieste possedute, refresh fallito sempre → AUTH_REQUIRED, pulizia callback incompleta, protezione epoch delle risposte tardive |
| player.js | isReady richiede connect riuscito + READY con device non vuoto; prepare ricontrolla auth; activate non crea istanze; errori SDK tipizzati; reset sessione ritira device/cache e rimuove listener SDK |
| app.js | Stato Spotify separato dal round, guardie SCAN/QR, connessione prima dell'accesso al gioco, reset centralizzato, retry connessione distinto da playback, logout, errori gestiti anche fuori da un round |
| index.html | Pulsanti Riconnetti Spotify ed Esci da Spotify, senza redesign |
| tests/run.mjs | 26 scenari aggiunti, fixture integrate auth reale del progetto + player reale del progetto + app reale del progetto; rete/SDK/DOM restano simulati |
| README.md | Flusso sessione e URI esatta documentati |
| AUTH_FIX_REPORT.md | Diagnosi, risultati e secondo test reale |

Stati della sessione: AUTH_REQUIRED → AUTHENTICATING → PLAYER_CONNECTING → PLAYER_READY. In caso di connessione fallita: PLAYER_NOT_READY con pulsante dedicato. Gli stati del round restano opening/scanning/preparing/playing/stopping/revealed/stop-error; non sostituiscono l'autenticazione. Lo stato Spotify e il codice d'errore sono consultabili negli attributi data del nodo status, senza credenziali.

SCAN controlla contemporaneamente stato PLAYER_READY, token locale strutturalmente valido e non scaduto, player connesso e READY/device valido. Il token locale da solo non certifica l'autenticazione remota: la readiness SDK è richiesta. Token revocati sono gestiti tramite authentication_error o 401. Il click conserva activateElement prima di await; prima della camera si ricontrolla getToken. Se scaduto con refresh valido, si rinnova e si riconferma la connessione; non si avvia un round nel frattempo.

Reset/logout: access/refresh/expiry in memoria e storage, chiavi legacy access_token/refresh_token/token_expires_at/verifier, PKCE verifier/state, richieste in corso, promise refresh, round/controller/timer, UI reveal, camera, player/device/readiness, listener SDK e cache tecnica delle durate. Solo chiavi possedute; mai localStorage.clear. La camera viene chiusa tramite la coda esistente; un nuovo collegamento deve confermare lo stop, quindi il login non blocca ma lo scan non supera cleanup falliti. Epoch della sessione, roundId e identità dell'istanza scartano callback vecchie. Il refresh conserva il refresh token precedente solo se la risposta di rinnovo non ne fornisce uno nuovo; un nuovo scambio code non eredita quello di un'altra sessione.

## 4. Comportamento prima/dopo ed errori

| Codice / situazione | Comportamento corretto |
| --- | --- |
| AUTH_REQUIRED | Cleanup completo, LOGIN visibile e cliccabile, nessun SCAN/playback; comprende SDK authentication_error, refresh fallito e 401 dopo un solo rinnovo/retry |
| PLAYER_NOT_READY | SCAN bloccato; messaggio connessione/compatibilità; Riconnetti Spotify verifica auth e connect/READY |
| DEVICE_NOT_READY | Device mancante/offline: blocco SCAN e recovery connessione; nessun round su ID vuoto |
| PLAYBACK_FAILED | Errore di playback distinto da login; stop/ritiro esistente, poi riconnessione quando necessaria |
| PLAYBACK_NOT_CONFIRMED | Timeout esplicito; device ritirato; ritorno alla connessione prima di un nuovo scan |
| NETWORK_ERROR | Errore di rete delle richieste playback/SDK; niente retry playback cieco, connessione da recuperare |
| Rete fallita durante refresh | AUTH_REQUIRED, come richiesto: sessione eliminata e nuovo login disponibile |

Prima: un fallimento dopo authenticated=true poteva lasciare SCAN e nascondere LOGIN. Dopo: soltanto completamento della procedura auth + connect + READY abilita SCAN. Retry non invoca play: ricontrolla token, player e camera. Nessun cambiamento a tempi 3-2-1, mute/seek/volume, source of truth editoriale o margini random. Protezioni della pausa tardiva e del round precedente preservate.

## 5. Redirect URI di produzione

`https://fbellini22.github.io/bamboc-hit/`

Deriva direttamente da config.js, hostname GitHub Pages del repository e path previsto. HTTPS, hostname fbellini22.github.io, path /bamboc-hit/, slash finale obbligatorio; nessun code/state/debug o fragment. Il codice è rimasto invariato. Test copre anche ingresso via index.html con query, verificando che OAuth utilizzi comunque l'URI canonica.

La callback elimina soltanto code, state, error ed error_description, anche quando incompleta/non valida, preservando parametri applicativi e hash. State/verifier non vengono riutilizzati. Un errore permette un nuovo LOGIN senza cancellare manualmente lo storage.

## 6. Spotify Developer Dashboard

Nelle impostazioni dell'app con Client ID `1031669a52cf4742b6e908a536a247e5`, verificare **Redirect URIs** e aggiungere/salvare esattamente l'URI del punto 5 se manca. Se è già presente identica, non serve modificarla. Non usare localhost, una variante senza slash o l'URL con index.html al suo posto per questo callback di produzione.

Non ho accesso alla dashboard e non ho modificato impostazioni remote. Spotify richiede la corrispondenza esatta della redirect URI: [documentazione ufficiale](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).

## 7. Test aggiunti e copertura richiesta

26 nuovi scenari nella suite VM. Copertura dei 18 casi richiesti:

| Caso | Verifica |
| --- | --- |
| 1. Primo accesso | LOGIN abilitato; click SCAN/reset non apre camera; zero istanze SDK; click LOGIN genera PKCE/redirect |
| 2. Scaduto/refresh valido | Una richiesta refresh prima di init/READY |
| 3. Refresh fallito | 400/401/503/rete/risposta malformata → LOGIN, cleanup selettivo |
| 4. Token corrotto | JSON rotto/null/numero/array, accessToken oggetto, expiry stringa/enorme → LOGIN |
| 5. Refresh assente | Anche accessToken con scadenza futura ma sessione parziale → LOGIN |
| 6. OAuth valido | Scambio token, URL pulito, init player, attesa READY |
| 7. State errato | Vecchi token eliminati, LOGIN subito riutilizzabile |
| 8. Player non READY | SCAN disabilitato anche se connect risolve; timeout → riconnessione |
| 9. Device assente | READY con device vuoto non abilita SCAN |
| 10. READY | Abilita soltanto insieme a connect riuscito; connect pendente/falso resta bloccato |
| 11. Auth persa PREPARING | Moduli integrati, richiesta play sospesa: abort del segnale, logout, niente audio/timer tardivi |
| 12. Auth persa PLAYING | Round reale nei mock: reset player/camera/timer/UI; test aggiuntivo rinnovo SDK fallito |
| 13. 401 playback | Percorso app→player→API: un rinnovo e un retry, poi LOGIN se ancora 401 |
| 14. Retry AUTH_REQUIRED | Riconnetti/reset/SCAN non generano nuove richieste |
| 15. Logout | Device ritirato, token rimossi, vecchi eventi ignorati anche durante nuovo PKCE |
| 16. Reload valido | Recupero sessione salvata, connect/READY, SCAN |
| 17. Reload invalido | Tutte le varianti corrotte/scadute senza recovery tornano al login |
| 18. Query callback | code/state rimossi, debug/hash conservati dopo successo |

Ulteriori regressioni: PKCE mancante, callback con solo state/code vuoto/access_denied, not_ready in idle, logout durante connect/refresh, vecchia risposta 401 non cancella nuova transazione, expiry prima di SCAN e durante scansione, errore NETWORK_ERROR, URI Pages esatta.

Nel secondo controllo del diff sono state aggiunte guardie anche dopo activateElement e dopo lo stop asincrono: una continuazione precedente al logout non deve interrogare di nuovo auth (cancellando un nuovo PKCE), cambiare lo stato UI o fermare la camera della nuova sessione. Due test dedicati verificano questi casi.

Un precedente test richiedeva di mantenere il refresh token dopo 503: ora verifica cleanup/login, perché la nuova richiesta esplicita cambia proprio questa regola. Non è una rimozione di copertura né un aggiustamento per nascondere il bug. I test API con token sintetici sono stati completati con refreshToken per rappresentare sessioni valide secondo il nuovo contratto.

## 8. Risultato dell'intera suite

**91 test passati: 89 VM + 2 node:test.** Include tutti i precedenti scenari di countdown, audio muto, cache, scanner, pausa/seek/HTTP tardivi e dataset. Check sintattico ricorsivo JS/MJS, JSON, riferimenti HTML e marker: PASS. Dataset/baseline: PASS con 29 anomalie note e zero nuove. Validazione rigorosa: conflitto Queen/Rimmel ancora segnalato, dataset intatto. git diff --check: PASS.

Node/npm non disponibili nel PATH di questo ambiente. Eseguiti i componenti degli script tramite il runtime Node v24.18.1 di VS Code (`ELECTRON_RUN_AS_NODE=1`), come nel precedente audit:

```text
scripts/check.mjs
tests/run.mjs
--test tests/core.test.js
scripts/validate-dataset.js
scripts/validate-data.mjs --baseline
scripts/validate-data.mjs  (rigoroso: conflitto noto)
git diff --check
git diff --exit-code -- song.js config.js scanner.js
```

Non dichiaro eseguito letteralmente npm run ci né Actions remoto/Node22: la sequenza equivalente check/test/baseline è eseguita localmente. Avviso Crashpad del runtime Electron: accesso negato al crash reporter; non è un fallimento dei test. Log generato rimosso. Nessuna credenziale reale, camera o audio usati nei test.

## 9. Secondo test reale

1. Verificare la Redirect URI del punto 5 nel dashboard prima del test.
2. Dopo una futura pubblicazione autorizzata, ricaricare evitando cache vecchie. Devono essere presenti Riconnetti Spotify ed Esci da Spotify; queste modifiche ora sono solo locali.
3. Finestra privata senza token: solo LOGIN, SCAN indisponibile. Nessuna camera né playback prima dell'accesso.
4. Login: redirect Spotify, consenso, ritorno a /bamboc-hit/, code/state scompaiono. Messaggio Connessione a Spotify, poi SCAN solo a player pronto.
5. Rifiutare consenso oppure aprire una callback vecchia/incompleta: nuovo LOGIN cliccabile, nessuno SCAN, nessuna necessità di cancellare tutto lo storage.
6. Con sessione valida, ricaricare: recupero senza nuovo consenso, ma sempre attesa connect/READY. Una sessione già salvata valida può correttamente evitare il login interattivo.
7. Scadenza/revoca token e rete durante refresh: rinnovo se possibile; al fallimento vero ritorno al login. Non condividere token o URL OAuth completi nei log.
8. Simulare device offline/cambio device: SCAN bloccato; Riconnetti recupera la connessione e non avvia da solo una canzone. Per incompatibilità/Premium/account non ammesso verificare il messaggio e usare Esci/login se necessario.
9. Durante PREPARING e PLAYING premere Esci: camera/player arrestati, timer/reveal spariscono, LOGIN subito disponibile. Ripetere login: nessun vecchio round riprende.
10. Ripetere 3-2-1, VIA, offset, 45 secondi, REVEAL/NEXT rapido e scansioni consecutive. Restano necessarie prove audio/camera fisiche; il limite volume SDK iOS del report precedente non è stato modificato.

Esito: difetto UI/auth/readiness riprodotto e corretto nei test integrati. L'esatto stato iniziale del browser e la configurazione Spotify remota rimangono da verificare con questo secondo test. Nessun commit e nessun push effettuati.
