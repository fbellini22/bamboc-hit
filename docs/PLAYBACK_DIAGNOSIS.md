# Diagnostica temporanea del playback su smartphone

> Report storico dell’indagine. La versione finale non espone più i pannelli temporanei qui descritti; vedere [verifica finale](RELEASE_CHECK.md). Il contenuto resta come evidenza delle regressioni e delle decisioni.

> Report storico: il caricamento silenzioso qui descritto è stato sostituito
> dall'[avvio diretto con durate locali](DURATION_PLAYBACK_REPORT.md).

Il login verificato su PC non identifica la causa del fallimento del playback sul
telefono. Questa modifica raccoglie evidenze: nessuna riscrittura del playback,
nessun nuovo retry, nessun commit o push.

## Come effettuare il prossimo test

Dopo la pubblicazione, ripetere normalmente login, SCAN e scansione QR. Non serve
`?debug=1`: in caso di errore compare sotto lo stato il pannello **Diagnostica
playback temporanea**, anche se il player viene disconnesso o si torna al login.
Copiare il testo oppure fotografare il pannello, includendo `roundId`, `phase`,
`failure`, comandi e `lastState`. Rimane visibile fino alla prossima scansione valida
o al reload. Non è salvato nello storage e non è inviato a servizi esterni.

Con `?debug=1` sono disponibili anche i log console `round_phase`,
`round_operation_completed`, `round_operation_rejected`, `late_round_operation_ignored`
e `round_failed`, tutti con round ID. Gli eventi di connessione SDK precedenti al
round restano eventi di sessione. Un evento SDK non porta un round ID nativo:
non attribuiamo artificialmente un suo payload a un round precedente. Le operazioni
async avviate dal round, invece, conservano il proprio ID anche dopo la cancellazione.

## Percorso effettivo nel codice

1. `app.js/onScan`: estrazione ID QR, rifiuto ID ambiguo, lookup nel catalogo locale
   costruito da song.js. Solo una voce valida avvia preparazione e countdown.
2. Countdown 3→2→1 e `player.js/prepareTrack` procedono **in parallelo**.
   Il completamento del countdown e l'arresto fotocamera sono una barriera prima
   di `startPrepared`. PREPARAZIONE rimane visibile se il lavoro non è finito.
3. `prepareTrack` cerca `song.durationMs`, poi cache SDK per quello specifico ID.
   Se disponibile, `core.randomPosition` sceglie l'offset tra 1.000 ms e
   durata − 45.000 − 2.000 ms. Non ho cambiato questa formula.
4. Connessione SDK, lettura volume iniziale, mute e lettura di verifica a zero.
   Un volume nullo/non valido o un mute non controllabile interrompe qui il round.
5. `ensureActive`: eventuale PUT `/me/player` con device SDK e `play:false`.
   Se già attivo, transfer saltato. Nuova verifica del mute dopo il transfer.
6. PUT `/me/player/play?device_id=...`, body con una sola URI richiesta e
   `position_ms`. Con durata nota usa subito l'offset casuale. Senza durata usa **0**
   per il caricamento silenzioso iniziale: questo è comportamento preesistente.
   Resta il solo recupero preesistente su 404, con transfer e un secondo comando.
7. `stateFor`: attende la traccia richiesta (anche relinked), non loading e durata
   SDK finita/positiva. Non pretende avanzamento né stato non-paused in questa fase.
   Memorizza la durata per ID; calcola l'offset o lo corregge se supera il limite SDK.
8. Pausa, conferma pausa, seek all'offset, conferma posizione in pausa con tolleranza
   250 ms, verifica mute. La preparazione lascia la traccia parcheggiata.
9. Attende countdown e fotocamera; riconferma parcheggio/mute, esegue `resume()`.
10. Attende non-paused sulla traccia corretta, posizione nell'intervallo offset…offset
    + 1.500 ms, quindi un secondo campione con posizione aumentata entro lo stesso limite.
11. Solo dopo l'avanzamento silenziato: callback VIA, ripristino volume verificato,
    ultima conferma stato entro lo stesso limite, timestamp e fase playing/timer.
    La conferma SDK non misura l'audio fisicamente udibile sul telefono.

## Durata e posizione: conclusione precisa

Nel dataset corrente non ci sono campi durationMs. Non sarebbe corretto affermare
che nessun comando play viene emesso con durata mancante: il primo caricamento
silenzioso a zero serve proprio a ricavarla dal SDK. L'avvio casuale e il successivo
unmute sono subordinati a durata SDK valida e preparazione completata.

Durata locale non valida viene scartata dal catalogo; cache non valida viene ignorata.
Se la durata SDK manca/è zero, l'attesa scade senza VIA. Se troppo breve, il calcolo
casuale fallisce senza unmute. La posizione viene confrontata con la durata della
traccia effettivamente osservata. Una durata **numericamente valida ma obsoleta**
può però generare un primo offset sbagliato: la correzione avviene solo dopo aver
ricevuto lo stato SDK. Non è escluso che Spotify rifiuti quel primo comando prima
della correzione. Il pannello conserva posizione del comando e durata/fonte per
riconoscere questa eventualità; non viene cambiato il comportamento per ipotesi.

## Punti di fallimento e cosa è escluso

| Punto | Evidenza disponibile / diagnosi |
| --- | --- |
| Volume/mute | `read_volume`, `mute_before_transfer`, `mute_after_transfer`; volume richiesto e osservato. Possibile blocco specifico del browser, da misurare sul telefono. |
| Transfer / play | `transfer`, `play_command`; esito e status HTTP reali, inclusi prima dell'eventuale reset auth. Un 2xx non equivale a playback confermato. |
| Stato o durata mancanti | `confirm_loaded_track_and_duration`; ultimo stato, corrispondenza track, loading e durata. |
| Pausa / seek | Fasi separate per comando e conferma; ultimo paused e positionMs distinguono seek non applicato e stato non ricevuto. |
| Ripresa / autoplay | `resume`, `confirm_unpaused_position`; errori SDK separati, compreso autoplay_failed. |
| Avanzamento / soglie | `confirm_position_progression` o `confirm_playback_after_unmute`; drift massimo 1.500 ms e tolleranza 250 ms sono mostrati. Letture tardive o salti possono non soddisfare queste soglie pur con playback avviato: serve il test reale. |
| Ripristino volume | `restore_volume`; VIA può essere già comparso ma l'unmute può fallire. |
| Interruzione dopo conferma | `playing_confirmed` + PLAYBACK_INTERRUPTED, stato nullo/paused/traccia diversa. |

Non risulta un'attesa logicamente impossibile che pretenda avanzamento mentre il
player deve restare in pausa. Il mute non è usato come sinonimo di pausa: avanzamento
richiesto soltanto dopo resume. Le pause della preparazione sono attese e confermate
prima del resume. Non è stata aggiunta alcuna pausa al countdown.

I test esistenti e nuovi escludono **nelle simulazioni** che seek/HTTP/eventi obsoleti
dei vecchi dispositivi confermino o interrompano il nuovo round. I controlli di epoch,
istanza e AbortController rimangono invariati. Questo non dimostra l'ordine effettivo
dei comandi dentro Spotify o l'assenza di interferenze esterne sul dispositivo reale.
Mute, DRM, autoplay, rete, trasferimento e audio fisico richiedono il test smartphone.

## Dati mostrati e sicurezza

Snapshot prima del cleanup: round ID, fase e cronologia relativa in ms, track ID,
lookup riuscito, presenza/valore/validità durata locale, fonte durata nota, durata SDK,
posizioni effettivamente inviate, offset finale e controllo del limite, READY e
presenza device prima della preparazione e al fallimento, risultato transfer e ogni
comando play, volumi, ultimo stato, evento SDK, tipo/nome/messaggio/status errore e
flag timeout conferma. Il device ID stesso non viene mostrato.

I messaggi creati dall'app vengono conservati; testo arbitrario proveniente dalle
rejection SDK/browser viene sostituito con un messaggio esplicito di omissione per
evitare dati sensibili. Non mostriamo payload SDK grezzi, header, URL completi,
token, authorization code, verifier, state OAuth o storage. Il pannello usa textContent.
Gli snapshot non possono essere sovrascritti dai completamenti tardivi di un round
cancellato; la cronologia è limitata a 60 fasi.

## Modifiche e test

- `player.js`: osservazioni delle fasi e snapshot errori, subscriber diagnostico,
  ID nelle operazioni async, rilevamento dell'interruzione già gestita dalla UI.
- `spotify-auth.js`: comunica status HTTP al chiamante; conserva il 401 nel reset.
  Nessun cambiamento al numero di retry o alle richieste.
- `app.js`, `index.html`, `style.css`: pannello temporaneo sempre disponibile su errore,
  anche senza modalità debug, e associazione del round UI al player.
- `config.js`: roundId ammesso nei log sicuri; parametri gameplay invariati.
- `tests/run.mjs`: nove nuovi test, diversi parametrizzati.

Risultati: **108 test VM + 2 core = 110 passati**, zero fallimenti. Inclusi percorso
3→2→1, caricamento diretto a offset noto, conferma avanzamento, VIA prima dell'unmute;
fallimenti mute/load/durata/pausa/seek/resume/volume; status transfer/play; eventi SDK
e reset auth con pannello persistente; completamenti tardivi separati per round;
assenza di segreti nei messaggi esterni; interruzione dopo conferma.

Check sintassi JS/MJS, JSON, HTML e marker passato. Entrambi i validatori dataset
mantengono 29 segnalazioni note, zero nuove. Test eseguiti con Node 24 integrato in
VS Code perché node/npm non sono nel PATH. Nessun test fisico Spotify eseguito qui.
Song.js, scanner QR, core/randomizzazione, countdown e metadati non modificati.
