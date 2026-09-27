# Primo login intermittente su Android: analisi e diagnostica

## Evidenza e limite della conclusione

Stesso Android e Chrome mobile: primo login fallito prima del QR, secondo riuscito.
Questo dato non indica un'incompatibilità generale del playback Android.
Nella base locale il testo esatto `Login non valido o scaduto. Avvia nuovamente l'accesso.`
ha un solo produttore: `spotify-auth.js`, validazione di `handleRedirect()`.
Assumendo la stessa versione in produzione, dimostra un rifiuto locale prima del POST token.
Non distingue ancora le quattro condizioni sotto. Non abbiamo lo storage o la traccia
del telefono fallito; nessuna causa specifica è attribuibile con certezza.

## Tutti i percorsi del messaggio esatto, in ordine di precedenza

1. `PKCE_VERIFIER_MISSING`: record assente, JSON illeggibile, lettura storage fallita,
   verifier assente, non stringa o vuoto. Prevale anche su uno state errato.
2. `OAUTH_STATE_MISMATCH`: con verifier presente, state della callback assente/vuoto
   o diverso dallo state salvato (incluso state salvato mancante).
3. `OAUTH_TRANSACTION_EXPIRED`: con verifier/state validi, `createdAt` non numerico
   finito, età oltre 600000 ms oppure timestamp futuro. Anche un cambio dell'orologio
   può soddisfare la condizione; non è una prova di attesa realmente superiore a 10 minuti.
4. `OAUTH_CALLBACK_INCOMPLETE`: transazione valida ma senza code né error valorizzati,
   con almeno uno dei parametri OAuth presente nell'URL.

Un rifiuto Spotify (`error` con transazione valida), HTTP 400/401/503, rete,
refresh, SDK e Premium producono altri messaggi, non questo.

## Percorso effettivo

Click → `auth.login()` pulisce la vecchia sessione e incrementa l'epoch → genera
state/verifier casuali → attende SHA-256 → controlla epoch → salva atomicamente il
record PKCE in sessionStorage → redirect tramite `location.assign()`.
Il bottone è disabilitato nello stesso turno del click prima di un secondo evento.

Nuovo documento → carica eventuali token precedenti in memoria senza refresh → boot
→ `connectSpotify(true)` → `await handleRedirect()` → lettura PKCE in variabile locale
→ pulizia parametri OAuth dall'URL → rimozione record PKCE → validazione → scambio code
→ verifica risposta/epoch → token in memoria e tentativo di salvataggio localStorage
→ `getToken()` → inizializzazione player → READY/abilitazione SCAN.
Il vecchio refresh token non viene riutilizzato per completare una risposta code incompleta.

## Race e lifecycle controllati

- Il boot attuale è invocato una volta; `index.html` include una volta gli script.
  `connecting` serializza la connessione. Il test integrato con scambio sospeso
  conferma nessun refresh preventivo, nessun player anticipato e nessuna seconda callback.
- I refresh concorrenti condividono una promise; abort/epoch proteggono il nuovo
  login dalle risposte tardive. I test preesistenti coprono logout/refresh/login sovrapposti.
- `pagehide` ferma camera/player, ma non chiama `auth.clear()` né elimina PKCE.
  `pageshow.persisted` ricarica la pagina. La diagnostica registra questi eventi senza
  cambiare tali handler. `visibilitychange` non cancella la transazione OAuth.
- **Rischio latente riprodotto:** una seconda chiamata diretta a `handleRedirect()`
  mentre il primo POST è pendente vede l'URL pulito e termina subito. Se quel chiamante
  esegue `getToken()`, trova token null e annulla lo scambio. Non è raggiunto dal boot/UI
  nei test attuali, e produce messaggi diversi dal caso riportato. Non introdotto un fix
  speculativo: ora sono osservabili `callback_overlap` e `callback_already_consumed`.
  Quest'ultimo significa callback già consumata in questo documento e URL ormai senza
  parametri, non prova di replay dello stesso code in un altro documento.
- **Finestra di interruzione esistente:** URL/PKCE rimossi prima del POST. Una ricarica
  durante il POST non può riprendere lo scambio. Con URL già pulito il nuovo boot mostra
  `Accedi a Spotify per iniziare.`, non il messaggio del video. Un ritorno invece allo
  stesso URL OAuth dopo consumo potrebbe mostrare verifier mancante: resta un'ipotesi.
- Perdita storage, nuova scheda/istanza, callback vecchia, state sovrascritto e scadenza
  restano ipotesi. I test simulano un contesto con storage separato, non dimostrano che
  Chrome Android lo abbia creato. Nessuna detection mobile modifica il flusso OAuth.

## Persistenza documentata

[MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage):
storage separato per origine e contesto di navigazione superiore, persistente nei reload
e ripristini della stessa sessione; una nuova scheda può avere storage separato o una copia
iniziale dall'opener. Non c'è motivo documentato qui per presumere perdita sistematica
in Chrome Android. Un journal assente non prova da solo l'apertura di una nuova scheda.

[Spotify PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow):
il verifier generato prima del redirect serve al token exchange; lo state protegge la
correlazione della callback. Non sono stati indeboliti questi controlli né aggiunti
fallback in localStorage, retry, timeout o workaround desktop.

## Modifiche solo diagnostiche

- `oauth-diagnostics.js`: journal limitato a 100 eventi, whitelist di eventi/campi,
  timestamp, boot ID indipendente e attempt ID diagnostico non derivato da credenziali.
  Eventi di lifecycle, boot count e confronto booleano origine/redirect. Nessun URL completo.
- `spotify-auth.js`: osservazioni prima della rimozione PKCE; fatti separati su lettura,
  presenza/uguaglianza state, verifier e validità/età timestamp; risultati HTTP exchange
  e refresh, salvataggio token (memoria sempre, `stored` indica localStorage), epoch e
  sovrapposizioni callback. L'ID diagnostico è un campo aggiuntivo del record PKCE,
  non un sostituto dello state e non influisce su validazione/scambio.
- `app.js`: mount del pannello e marcatori boot/inizializzazione player, senza modificare
  attese o comandi playback. `index.html`: script e pannello indipendente dalla schermata login.
- La traccia sopravvive a `auth.clear()` e, se sessionStorage disponibile, al reload
  nella stessa sessione. Fallimento storage diagnostico non blocca l'autenticazione:
  si mantiene la traccia in memoria con `storageWritable:false`.
- `recovered` indica recupero del journal, non prova di integrità PKCE. `attemptId:null`
  significa correlazione non recuperabile; non si attribuisce una callback sconosciuta
  al vecchio tentativo. Le risposte token tardive mantengono l'ID dell'operazione originale.
- Il pannello appare automaticamente su errore e resta visibile anche dopo un nuovo
  tentativo. Registro limitato: fotografarlo prima di riprovare o giocare a lungo.
  Nessun access/refresh token, code, verifier, state, messaggio grezzo del server o SDK.

## Test e prossimo telefono

Suite completa eseguita: **139 test VM + 2 test core = 141 superati, 0 falliti**.
`scripts/check.mjs` superato (9 JS, riferimenti HTML, sintassi ricorsiva/JSON/conflitti).
Entrambe le validazioni dataset con baseline superate: 29 segnalazioni note, 0 nuove.
Nessuna modifica al dataset. Esecuzione con Node incorporato in VS Code poiché Node/npm
non sono nel PATH dell'ambiente; il warning locale Crashpad non ha impedito i test.

13 nuovi test VM: tutte le condizioni del messaggio e precedenza, storage illeggibile/
inaccessibile, reload con storage condiviso, contesto separato e successivo login riuscito,
pannello persistente, serializzazione UI, doppio tap iniziale, reload durante scambio,
callback concorrente diretta, HTTP/rete senza segreti, refresh deduplicato, lifecycle e
storage diagnostico indisponibile. I test non pretendono di emulare il lifecycle reale Android.

Al primo fallimento fotografare **prima di premere nuovamente Login**:

1. Messaggio principale e intestazione `Diagnostica OAuth temporanea` (`oauth-mobile-1`).
2. `bootId`, `attemptId`, `recovered`, `storageWritable`.
3. Tutti gli eventi da `login_start` (se presenti) a `callback_detected`, `pkce_read`,
   `state_*`, `verifier_*`, `transaction_checked`, `error` e `session_clear`.
4. Eventuali `callback_overlap`, `callback_already_consumed`, `pagehide/pageshow`,
   `token_exchange_*` e relativo `status`. Usare screenshot a scorrimento o più foto.

Annotare se il ritorno apre una nuova scheda, passa dall'app Spotify, usa Indietro o
ricarica, e quanto dura il login. Dopo le foto, riprovare nella stessa scheda e fotografare
la traccia del successo per confrontare attempt/boot. Non fotografare l'URL OAuth completo.
