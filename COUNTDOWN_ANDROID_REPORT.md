# Countdown e confronto Android mobile / sito desktop

> Report storico dell’indagine. La versione finale non espone più i pannelli temporanei qui descritti; vedere [verifica finale](RELEASE_CHECK.md). Il contenuto resta come evidenza delle regressioni e delle decisioni.

## 1. Causa e correzione del secondo 1

`core.preplayCountdown` termina chiamando la callback con zero. In `app.js/onScan`,
`Math.max(1, seconds)` trasformava quello zero nuovamente in 1. Inoltre la classe
`waiting` riduceva il font da 100–180 px a 20–32 px: lo stesso numero cambiava aspetto,
sembrando una seconda fase. `render` manteneva visibile il contenitore per tutto lo
stato `preparing`, che comprende anche l'attesa della conferma SDK.

Ora `countdownVisible` governa solo la presentazione, separatamente dalla state
machine del round. I tick positivi scrivono 3, 2, 1 una sola volta; tick duplicati
non riscrivono il numero. Al tick zero il contenitore viene nascosto, senza scrivere
un altro valore né applicare classi. Anche successivi render lo mantengono nascosto.
Il numero può restare nel DOM nascosto, ma non è visibile né nuovamente renderizzato.
La regola `[hidden] { display: none !important; }` prevale sul display grid del preplay.

La Promise countdown e la sua durata non sono cambiate. `playback.play` usa la stessa
barriera, lo stesso offset e le stesse conferme. `startedAt`, transizione PLAYING,
timer 45 secondi, STOP/REVEAL/NEXT restano subordinati alla conferma effettiva.
Il messaggio di accompagnamento viene svuotato al termine del countdown: intervallo
pulito, senza numero, spinner, Preparazione o VIA. Il pannello diagnostico resta.

## 2. Android: conclusione sostenibile oggi

**La causa del guasto Android mobile non è determinabile dal solo repository e
dalla descrizione del test. Non è stata applicata una presunta correzione Android.**
È accertato dal test utente che sullo stesso dispositivo il risultato cambia usando
sito desktop. Non disponiamo ancora dei valori runtime di EME, connect, READY,
activateElement e degli eventi SDK nelle due modalità. Non li presentiamo come misurati.

La documentazione Spotify corrente dichiara supporto per i browser principali,
incluso Chrome, su Android e iOS. Non documenta un'esclusione generale di Chrome
Android mobile. Documenta requisiti/limitazioni EME, autoplay, permessi degli iframe
cross-origin e alcuni limiti iOS. Il limite iOS non dimostra la causa di questo Android.

Chrome documenta che la modalità desktop può presentare UA da Linux desktop e
un viewport diverso. UA e Client Hints sono indicatori della presentazione, non
una misura affidabile dell'hardware o un'API che certifichi "sito desktop attivo".
L'app non usa questi indicatori per decidere come riprodurre.

## 3. Controllo del percorso del progetto

| Area | Risultato dell'analisi |
| --- | --- |
| Mobile detection | Nessun branch mobile/desktop nel codice di gioco. UA/UAData vengono ora letti solo per la diagnostica, senza spoofing. |
| SDK | Stesso URL `sdk.scdn.co/spotify-player.js`, stessi parametri Player e stessa sequenza prepare/connect in entrambe le modalità. Eventuali scelte interne del SDK non sono deducibili dal nostro codice. |
| EME/DRM | Il progetto non creava MediaKeys né effettuava feature detection preventiva. La nuova verifica è separata e non blocca/autorizza il player. |
| READY/device | SCAN continua a richiedere token, connect riuscito, READY e device valido. Diagnostica disponibile anche quando questa condizione non viene raggiunta. |
| Gesture/autoplay | Il click SCAN chiama activateElement prima di ogni await e prima della fotocamera. Il play avviene dopo QR/countdown, quindi non nello stesso task della gesture: è già questo lo scopo dell'attivazione preventiva SDK. Non è stata aggiunta una nuova gesture o un retry. |
| AudioContext | L'app non crea né gestisce AudioContext. La presenza dell'API è riportata; lo stato del contesto interno del SDK non è esposto e non viene inventato. |
| Media Session | Non usata dalla logica app. Presenza e playbackState top-level riportati, senza leggere metadati. Non provano lo stato del player dentro iframe. |
| Transfer/play | Nessun transfer separato. Primo PUT play diretto al device con offset locale, invariato. Status HTTP registrato senza header/payload. |
| Camera | Stesso html5-qrcode, stessi vincoli camera e fallback. La camera viene arrestata prima che possa partire il play. La nuova diagnostica registra avvio/richiesta stop/esito. Non dimostra di per sé l'assenza di sospensioni audio interne al browser. |
| Visibility/focus | Il codice esistente cancella scansione/preparazione quando la pagina diventa nascosta. Ora gli eventi visibility/focus/blur vengono registrati: una differenza reale può spiegare un annullamento, ma non è stata osservata qui. |
| Permessi | HTTPS necessario per camera; query diagnostica camera non apre prompt. Permissions Policy top-level per encrypted-media/autoplay/camera viene letta se disponibile. La policy effettiva degli iframe SDK può essere più restrittiva. |
| CSS | Media query a 500 px cambia solo dimensione timer; prefers-reduced-motion cambia animazioni. Nessun ramo CSS che selezioni SDK, device o endpoint. Dimensioni scanner adattive alla viewport, stesso decoder QR. |

Non c'è evidenza per forzare desktop, simulare un UA, ricreare un AudioContext o
spostare il play prima del countdown. Non sono stati introdotti questi workaround.

## 4. Fonti ufficiali consultate

- [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk): supporto Android/iOS, limiti iOS e policy encrypted-media/autoplay negli iframe.
- [SDK reference](https://developer.spotify.com/documentation/web-playback-sdk/reference): activateElement, autoplay_failed e distinzione initialization/authentication/account/playback errors.
- [Spotify getting started](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started): avvio percepito come autoplay e attivazione preventiva da click.
- [Chrome desktop mode](https://developer.chrome.com/blog/desktop-mode): presentazione desktop su Android, UA/viewport; non è una diagnosi dello specifico telefono.
- [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay): gesture, differenze di policy e delega iframe.
- [Chrome User-Agent Client Hints](https://developer.chrome.com/docs/privacy-security/user-agent-client-hints): navigator.userAgentData e flag mobile.

## 5. Diagnostica aggiunta e limiti

Nuovo pannello chiuso **Diagnostica browser temporanea**, disponibile senza debug=1,
anche a login/connessione fallita. Versione `browser-diag-1`, ambiente sintetico e
fino a 80 eventi con timestamp. Include browser/versione principale/piattaforma,
UA mobile hint, UAData disponibile/platform/mobile, HTTPS, EME, MediaSource,
AudioContext disponibile, Media Session, getUserMedia, policy, visibility/focus,
userActivation attiva/pregressa; SDK loaded, creazione player, connect result, READY,
device ID presente (non valore grezzo), activateElement chiamato/riuscito/fallito,
errori SDK con tipo, camera, status play HTTP e errori app.

**Verifica DRM e permesso camera** avvia su richiesta un probe
`requestMediaKeySystemAccess('com.widevine.alpha', ...)` con audio MP4/AAC,
initData cenc e sessione temporary. Distingue API assente, accesso disponibile per
quella configurazione, rejection con nome sicuro, timeout. Non crea MediaKeys,
sessioni, richieste di licenza o audio. Non altera Player. Un esito positivo non
garantisce licenza Spotify/codec/policy iframe; uno negativo non prova da solo
incompatibilità con ogni configurazione del SDK. Non viene effettuato un probe
FairPlay su iPhone, né tratto un verdetto di compatibilità da questo test Widevine.

La query camera restituisce granted/denied/prompt se supportata. Timeout diagnostici
sono separati da quelli del gioco e non vengono attesi dal playback. Nessun UA
grezzo, token, device ID, messaggio SDK arbitrario, URL callback o payload viene
mostrato. Dati solo in memoria, nessun invio esterno della diagnostica.

L'errore initialization_error ora descrive un fallimento di inizializzazione audio
protetto e rimanda alla diagnostica, senza dichiarare automaticamente il browser
non supportato. Gli errori auth/account/autoplay restano distinti.

## 6. Test e file

Sette test nuovi: scritture esatte dei numeri con HTTP pendente e timer fermo;
tick duplicati; EME presente/assente/rejection con UA mobile/desktop; errore connect
prima del round; chiamata activateElement sincrona nella gesture; eventi SDK e
redazione segreti; HTTP/visibility/policy/permesso camera. Due test precedenti
aggiornati dal vecchio mantenimento di 1 alla nuova UI nascosta.

Il confronto EME cambia realmente le API simulate e il loro risultato, non soltanto
la stringa UA. Questi sono test VM, non un CDM reale o emulazione completa di Chrome
Android: il confronto fisico rimane necessario.

Risultato dell'intera suite: **126 test VM + 2 core = 128 passati, zero fallimenti**.
Sintassi JS/MJS, JSON, riferimenti HTML e marker: passati. Entrambi i validatori
con baseline: 29 segnalazioni note, zero nuove/cambiate. `git diff --check` passato;
dataset, durate, OAuth, core e scanner confrontati con HEAD e invariati.
Script eseguiti tramite Node integrato in VS Code perché node/npm non sono nel PATH.
Nessun commit o push e nessuna prova fisica Android eseguiti in questa sessione.

File: `app.js` (visibilità e osservazioni), `style.css` (rimozione stile waiting e
pannello), `index.html` (modulo/pannello), `browser-diagnostics.js` (nuovo),
`player.js` (sole osservazioni, esito activateElement e messaggio initialization),
`tests/run.mjs`, README e questo report. Algoritmo offset, countdown core, richieste
play, conferme, dataset, durationMs, OAuth e scanner QR invariati.

## 7. Prossimo confronto fisico

1. Pubblicata questa versione, ricaricare in modalità mobile normale e provare il
   gioco **prima di premere il controllo DRM**. Anche un click diagnostico è una
   nuova interazione utente e potrebbe cambiare le condizioni autoplay del tentativo successivo.
2. Subito dopo il tentativo aprire Diagnostica browser, raccogliere il testo e
   l'eventuale pannello playback. Indicare se il blocco precede SCAN, riguarda
   fotocamera, oppure arriva dopo 3-2-1. Annotare anche se la pagina passa in background.
3. Eseguire il controllo DRM/camera dopo il tentativo e raccogliere il risultato.
4. Attivare sito desktop, ricaricare e ripetere con stesso QR/account/rete. Raccogliere
   gli stessi dati, verificando versione browser-diag-1. Per un nuovo confronto
   senza effetti del click diagnostico, ricaricare di nuovo.
5. Confrontare primo punto divergente: sdk_loaded/connect/READY/device; userActivation
   nel activate_called ed esito; errore SDK; camera/visibility; HTTP play; campioni
   di conferma. Confrontare EME e policy senza equiparare UA mobile a supporto DRM.

Non servono token, HAR o screenshot della barra con callback OAuth. Se entrambi i
probe riescono ma il SDK diverge, serve la traccia degli eventi SDK per il prossimo
intervento. Non viene dichiarata una correzione Android non verificata.
