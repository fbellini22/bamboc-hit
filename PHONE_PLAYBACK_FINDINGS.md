# Correzione della diagnosi dopo il test fisico

> Report storico del passaggio precedente. La scelta della durata locale è stata
> successivamente implementata: vedi [risultato aggiornato](DURATION_PLAYBACK_REPORT.md).

## Stato del lavoro

Intervento parziale: timestamp e UX aggiornati; **il precaricamento potenzialmente
udibile non è ancora eliminato**. È pendente la scelta richiesta all'utente: leggere
soltanto duration_ms da Spotify prima del playback, oppure bloccare le tracce senza
durata già nota. Nessun cambio OAuth, QR, dataset o metadati editoriali. Nessun commit/push.

## Riconciliazione con il telefono

Il dato `positionMs: 0 → success` riguarda un vero comando di riproduzione, non un
caricamento in pausa. Viene inviato durante il countdown per scoprire la durata
assente dal dataset. Il software considera sufficiente `getVolume() === 0`; il test
fisico dimostra che questo controllo non garantisce il silenzio su quel dispositivo.
Non è accertato se la divergenza dipenda dal browser, dall'implementazione SDK o dal
percorso audio. Non attribuiamo automaticamente il caso a iOS: la documentazione
descrive una lettura di volume 1 su iOS, mentre qui è stato osservato 0.

La timeline contiene nomi di fasi **in ingresso**, non tutte conferme completate:

1. `play_command`: avvia la traccia a zero, da cui l'audio anticipato osservato.
2. `confirm_loaded_track_and_duration`: trova uno stato compatibile e durata 171740.
3. `pause_preparation`: invia pause e attende la Promise.
4. `confirm_paused`: trova almeno uno stato paused=true, altrimenti il codice non
   potrebbe proseguire fino al seek.
5. `seek_random_position`: invia seek a 102891 e attende la Promise.
6. `confirm_parked_position`: **inizia** ad attendere paused=true e posizione entro
   250 ms dall'offset. Lo stato finale paused=false non soddisfa il predicato.
7. L'attesa scade: PLAYBACK_NOT_CONFIRMED. `play` cattura l'errore, `abandon`
   abortisce il round e chiama `disconnectDevice`/`disconnect`. Questo è lo stop
   di cleanup che spiega l'arresto finale, non un resume del round fallito.

Con quella fase finale non sono stati raggiunti `startPrepared`, `resume`, il
ripristino volume o PLAYING. Non c'è evidenza di una pausa di preparazione completata
dopo l'inizio del round: il round non è iniziato. Perché paused passi da true a false
durante/dopo seek non si ricava dal solo snapshot. Promise risolta e stato puntuale
non costituiscono garanzia di una condizione stabile nel dispositivo remoto.

L'offset riportato è valido numericamente: 102891 è tra 1000 e
171740 − 45000 − 2000 = 124740. Il problema riportato non è spiegato da questo limite.

## Limite tecnico da risolvere

L'API documentata di avvio riceve URI e position_ms e avvia la riproduzione. Non
offre un parametro per caricare una nuova URI in pausa. Il SDK espone pause/seek
sulla traccia corrente, senza una primitiva documentata di preload silenzioso di
una nuova URI. Finché la durata viene scoperta con un play silenziato, il codice
mantiene l'assunzione smentita dal telefono.

La soluzione proposta nella domanda è ottenere la durata senza playback e inviare
il primo play all'offset finale dopo 3-2-1, senza pause/seek/resume di preparazione.
Non modifica titolo/artista/anno. Richiede però una fonte durata consentita.
Anche così la latenza fisica fra richiesta e audio non può essere garantita pari
a zero via API remota; la UI può mantenere 1 fino alla conferma senza mostrare
una fase tecnica. Non dichiareremo una garanzia di prebuffering che il SDK non espone.

Fonti ufficiali consultate:
- [SDK reference](https://developer.spotify.com/documentation/web-playback-sdk/reference): volume locale, limiti iOS, pause/resume/seek.
- [Start/Resume Playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback): avvio con URI/position_ms; ordine di esecuzione non garantito in combinazione con altri endpoint Player.

## Modifiche già eseguite

- UI mostra solo 3, 2, 1; resta su 1 in caso di attesa. Nessuna scritta
  Preparazione o VIA e nessun secondo countdown. Questo da solo non risolve l'audio anticipato.
- Timeline con timestamp Unix `atMs` e monotono `monotonicMs`, QR, numeri del
  countdown, ingresso fase, risoluzione/rejection delle operazioni, evento SDK,
  condizione di stato soddisfatta, errore, richiesta/ritorno disconnessione e UI PLAYING.
- Le fasi già esistenti distinguono play, pause, seek, resume, volume restore,
  conferma avanzamento e PLAYING. Gli eventi assenti identificano operazioni mai raggiunte.
- Snapshot ripubblicato dopo cleanup per includere il timestamp di disconnessione.
  Operazioni tardive mantengono il loro round ID senza sovrascrivere il report corrente.
- Massimo 250 eventi per round, nessun payload SDK grezzo o segreto.

## Test e limiti

110 test VM + 2 core = **112 passati**, zero fallimenti. Check sintassi/JSON/HTML
passato; baseline dataset: 29 problemi noti, zero nuovi. Esecuzione tramite Node
integrato in VS Code, senza test hardware.

Nuovo test riproduce con un fake controllato la sequenza del telefono e verifica:
mute nominale non equivale ad audio fisico silenziato; confirm_paused soddisfatto;
confirm_parked_position non soddisfatto; nessun resume; errore prima della disconnessione.
È una dimostrazione di compatibilità della sequenza, non una prova della causa
del comportamento interno del SDK sul telefono.

Nuovo test UI verifica 3→2→1→1 durante attesa, nessuna etichetta intermedia e
nessun timer avviato prematuramente. I test di isolamento callback precedenti passano.
I requisiti di assenza di audio anticipato e avvio diretto senza precaricamento
**restano da implementare e verificare**, dopo la scelta sulla durata.
