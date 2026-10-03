# Durate locali verificate e avvio diretto dopo 3-2-1

## Risultato dataset

| Misura | Risultato |
| --- | ---: |
| Righe song.js con durationMs verificata | 347 / 347 |
| Spotify ID unici verificati | 346 / 346 |
| Righe senza durata | 0 |
| ID con durata non verificabile | 0 |
| ID ammessi dal catalogo dopo la quarantena editoriale | 345 |

**Elenco esatto durate mancanti/non verificabili: nessuno (`[]`).**
Le durate recuperate vanno da 91040 a 505333 ms. La verifica è avvenuta il
27 settembre 2026; ogni ID ha il proprio timestamp UTC in `duration-verification.json`.
`duration-report.json` contiene il riepilogo leggibile anche da script.

### Come sono state verificate

Lo script offline `scripts/fetch-durations.ps1` ha richiesto, senza autenticazione
e senza riproduzione, `https://open.spotify.com/embed/track/ID` per ogni ID unico.
La risposta contiene JSON strutturato `__NEXT_DATA__`, con
`props.pageProps.state.data.entity`. Il valore numerico **duration** di questo
oggetto è espresso in millisecondi; è la durata completa della traccia, non la
durata di audioPreview. Non è stata usata una durata approssimata da testo o mm:ss.

Per ciascuna risposta: HTTP 200, `entity.type === track`, `entity.id === ID`,
`entity.uri === spotify:track:ID`, durata intera e positiva. Qualsiasi incongruenza
viene segnalata e non produce una durata. Il file di evidenze conserva soltanto
ID, URI, fonte, timestamp, campo letto, status, durata e disponibilità embed.
Non conserva HTML, token, cookie, anteprime o metadati editoriali Spotify.

Questa fonte pubblica usa il nome `duration`, non `duration_ms` della Web API:
il valore in millisecondi viene salvato come `durationMs`. Non è stata eseguita
una richiesta Web API autenticata `/tracks`. Le pagine embed possono cambiare schema:
in quel caso lo script fallisce esplicitamente, senza indovinare valori.

`scripts/apply-durations.mjs` richiede copertura completa degli ID, ricontrolla
l'identità delle evidenze e inserisce soltanto durationMs. Confronta prima/dopo
tutti i campi diversi dalla durata e rifiuta modifiche editoriali. Sono state
verificate anche l'uguaglianza del sorgente song.js tolte le nuove righe durata
e l'uguaglianza della baseline tolto quel campo. La baseline conserva le stesse
anomalie; nessuna è stata risolta, aggiunta o accettata automaticamente.

### ID problematici, invariati

- `515XcapFOMtOOiGU31UqNp`: due righe locali, Queen / Bohemian Rhapsody e
  Francesco De Gregori / Rimmel. Durata dell'ID verificata: **220640 ms**, inserita
  identica nelle due righe. Questo non verifica né corregge l'associazione editoriale:
  il catalogo continua a bloccare completamente l'ID. Serve decisione manuale.
- `5QNEUi7oFTKcOrEMzLA9uV`: **178626 ms**, voce locale “Chi Non Lavora Non Fa L'Amore”.
- `56i7VC28M9eCBRMZ5autBG`: **187193 ms**, voce locale “La moto Morini”.

Gli ultimi due hanno identità e durata verificate ma `embedPlayable: false` nella
pagina pubblica. Questo non dimostra che siano invalidi o indisponibili per tutti
gli account/mercati; vanno verificati fisicamente con l'account di gioco. Non sono
stati rimappati o corretti. Rimangono inoltre le 29 segnalazioni editoriali già note
in `DATASET_AUDIT.md` e nella baseline.

## Vecchio e nuovo percorso

**Prima:** QR → countdown in parallelo a mute → play a zero per durata SDK → pausa →
seek casuale → attesa parked → resume silenziato → ripristino volume → conferma.

**Ora:** QR → lookup locale → verifica durationMs → offset casuale → connessione
SDK durante 3→2→1 → primo PUT play con device_id esplicito, URI locale e offset →
conferma traccia/posizione → conferma avanzamento → PLAYING/timer.

L'offset rimane nell'intervallo 1000…durationMs−45000−2000, senza cambiare la formula
casuale. Non si consulta la cache delle durate SDK e non si richiedono metadati
nel runtime. Durata mancante/non intera/non positiva: `LOCAL_DURATION_MISSING` e
zero comandi play. Traccia troppo breve: errore esplicito, nessun play.

Non esistono più nel percorso iniziale mute, getVolume, setVolume, pause, seek o
resume. Non viene inviato neppure un transfer separato con play:false: il comando
play indirizza direttamente il device READY. Questo elimina un ulteriore comando
che potrebbe arrivare tardi e interferire con l'avvio. Nessun nuovo retry; il vecchio
recupero automatico 404 con transfer/riplay è stato rimosso. I retry OAuth esistenti
non sono stati modificati.

La pausa resta soltanto nella gestione STOP/REVEAL. Un round nuovo resta vietato
finché una pausa precedente è pendente. Cancellazioni ritirano l'istanza e mantengono
ID/epoch per impedire ai completamenti vecchi di agire sul nuovo round.

UI: solo **3 → 2 → 1**. Se connessione o conferma richiedono più tempo, resta 1;
niente Preparazione, VIA, secondo countdown o schermo tecnico intermedio. La fine
del countdown è una condizione necessaria, non sufficiente: occorrono anche
device pronto, durata/offset validi, fotocamera arrestata e round ancora corrente.
Il codice non può garantire latenza fisica zero tra richiesta remota e primo suono.

## PLAYBACK_NOT_CONFIRMED: cosa è accertato

Nel test precedente `confirm_parked_position` era **l'ingresso nell'attesa**, non il
successo. Con paused:false il predicato non poteva riuscire. Timeout → abandon →
disconnect spiega lo stop finale. In quella sequenza non era stato raggiunto resume.
L'offset 102891 era valido per durata 171740; non era quello il limite violato.

Il vecchio codice aveva ottenuto almeno un campione paused:true prima del seek;
il campione finale dopo il seek era false. Non è possibile attribuire onestamente
dal solo snapshot il cambio a una particolare operazione interna del SDK o a un
comando remoto riordinato. La simulazione precedente mostrava una sequenza compatibile,
non una prova del comportamento interno di Spotify. Ora il percorso pausa/seek
preparatorio è eliminato, quindi non può più produrre quel tipo di attesa né una
pausa preparatoria tardiva.

Un difetto distinto è stato corretto: la conferma di avvio usava un limite superiore
fisso offset+1500 anche quando il tempo di rete/SDK superava quel valore. Ora il
limite considera il tempo trascorso dall'invio più la stessa tolleranza. I timeout
restano invariati. Servono sempre traccia corretta, non-paused, non-loading, posizione
coerente e un secondo campione con avanzamento. Se la durata SDK osservata dimostra
che non resta il segmento richiesto, `LOCAL_DURATION_MISMATCH` interrompe il round,
senza seek o fallback a zero. La durata SDK non sostituisce quella locale.

Riferimenti: [SDK reference](https://developer.spotify.com/documentation/web-playback-sdk/reference)
e [Start/Resume Playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback).
La API accetta device_id e position_ms; Spotify documenta inoltre che l'ordine remoto
non è garantito quando si combinano comandi Player. La conferma SDK non equivale
a misurazione dell'audio fisicamente udibile.

## Diagnostica telefono

Conservato il pannello temporaneo su errore. Per round: timestamp Unix e monotono,
QR, comparsa 3/2/1, scadenza countdown, calcolo offset, play, risoluzioni async,
eventi e campioni SDK, primo avanzamento, PLAYING, errore e cleanup/disconnessione.
I campioni frequenti vengono limitati senza perdere le transizioni critiche.

Gli eventi di conferma sono espliciti:

- `confirmation_started`: attesa iniziata, nessun successo implicito;
- `confirmation_success`: predicato soddisfatto;
- `confirmation_failed`: errore o annullamento;
- `confirmation_timeout`: tempo esaurito.

I fallimenti SDK ripubblicano il report dopo la rejection della conferma, così
l'evento failed non va perso durante il cleanup. Callback tardive mantengono il
vecchio ID e non sovrascrivono la diagnosi del round nuovo. Nessun segreto o payload
SDK grezzo viene mostrato. In questo percorso pause/seek/resume/volume restore non
compariranno nella preparazione perché non vengono più chiamati.

## Test

**119 test VM + 2 test core = 121 passati**, zero fallimenti. I test del vecchio
precaricamento sono stati aggiornati al comportamento richiesto, mantenendo le
coperture su autenticazione, camera, timer, metadata locali e race condition.
Nove ulteriori test coprono evidenze del dataset, assenza comandi preparatori,
valori durata invalidi, device non pronto, lifecycle conferme, ritardo reale di
avanzamento, mancato PLAYING su HTTP 2xx, integrazione app/player 3-2-1 e snapshot
di errore SDK durante conferma.

| Requisito | Copertura |
| --- | --- |
| 1–3: mai zero, offset prima del primo play, primo play diretto | Test known duration, offset precedes first play, integrazione app/player |
| 4–5: niente seek/pausa preparatori | Test direct playback transport, regressione telefono |
| 6–7: nessun GET tracks né sostituzione editoriale | Guard sintattico runtime, test richieste e reveal integrato |
| 8–9: durata mancante blocca senza fallback/cache | Test missing duration, valori invalidi, legacy cache |
| 10–12: solo 3→2→1, niente scritte intermedie | Test UI lento e integrazione reale app/player simulati |
| 13: callback vecchie non fermano il round nuovo | Test gate/HTTP vecchi, stato vecchio, STOP pendente, logout |
| 14: start/success/failure/timeout distinti | Test confirmation lifecycle e SDK failure snapshot |
| 15: PLAYING solo dopo avanzamento confermato | Test stalled con HTTP success e device non pronto |

Check sintassi ricorsivo JS/MJS, JSON, script HTML e marker di conflitto: passato.
Entrambi i validatori con baseline: 29 segnalazioni note, zero nuove/cambiate.
Validazione rigorosa: continua a fallire intenzionalmente sul conflitto Queen/Rimmel.
`git diff --check`: passato. Editoriali e baseline, escluse durate, confrontati con HEAD.
Esecuzione con Node 24 integrato in VS Code; node/npm non sono nel PATH. Nessun
test con Spotify reale/audio fisico eseguito in questa sessione.

## File modificati

- `song.js`: solo durationMs nelle 347 righe.
- `duration-verification.json`, `duration-report.json`: evidenze e riepilogo offline.
- `scripts/fetch-durations.ps1`, `scripts/apply-durations.mjs`: manutenzione ripetibile.
- `data-warnings-baseline.json`: solo durationMs nelle copie dei record già segnalati.
- `player.js`: avvio diretto e conferme, eliminazione preload/cache/transfer preparatori.
- `app.js`, `index.html`, `config.js`: UX numerica e diagnostica temporale, includendo
  le modifiche locali del passaggio precedente; configurazione OAuth invariata.
- `tests/run.mjs`, `README.md` e questo report; report precedenti marcati storici.

## Prossimo test fisico

Verificare assenza di audio durante 3-2-1, inizio all'offset (mai intro), disponibilità
del device con play diretto, conferma sul telefono, STOP/REVEAL/NEXT e i due ID con
embed non disponibile. In caso di errore condividere il pannello completo con
round ID, play command, durata locale, campioni SDK e confirmation_*.
Non occorre DevTools per leggere il pannello. Nessun commit o push eseguito.
