# Bamboc Hit — audit locale del 26 settembre 2026

Il report deriva da fetch, lettura del codice e test di questa sessione. I vecchi report non sono prove di funzionamento. Nessun push, commit o reset; dataset preservato. Versione pronta per test manuali sui browser con volume SDK controllabile, non certificata su Spotify/hardware reale.

## 1. Stato Git

HEAD, main e origin/main dopo fetch: `ebf887833ee72563b201ed63b90ed6bb42a60568`. Branch: main. Remote: https://github.com/fbellini22/bamboc-hit.git. Divergenza main...origin/main: 0/0; nessun altro branch locale. Eseguiti prima delle modifiche: git status, branch -avv, log --oneline --decorate --graph --all -30, remote -v, fetch origin --prune e rev-parse dei tre riferimenti. Il primo fetch era bloccato dal sandbox su FETCH_HEAD; quello autorizzato è riuscito.

Working tree iniziale: 12 file modificati e due non tracciati. I conflitti erano testo annidato nei file, non un merge Git attivo. Copie integrali dei 12 file in conflitto conservate nella cartella temporanea `bamboc-audit-jlwfm6lu` prima della ricostruzione.

Working tree finale: modifiche locali non committate e i due file inizialmente non tracciati. Alcuni file ripuliti (config, CSS, workflow) coincidono semanticamente con HEAD e possono risultare modificati soltanto per CRLF/LF. song.js, baseline, FULL_DIFF.txt e cronologia non modificati. origin/main resta con i conflitti pubblicati perché non è stato effettuato push.

## 2. Problemi trovati

| Gravità | File / area | Causa e conseguenza | Correzione |
| --- | --- | --- | --- |
| Critical | app/player/scanner/auth/HTML, core/config/CSS/package/workflow/report | Implementazioni incompatibili e marker annidati: sintassi non valida e app/CI non avviabili | Ricomposta la famiglia coerente window.Bamboc confrontando i rami, preservando countdown/cache/PKCE/isolamento/stop serializzato |
| High | app.js, alternativa legacy | GET metadata, localStorage.clear e timer di 30s potevano essere reintrodotti risolvendo male i conflitti | Eliminata variante obsoleta; dati locali, cleanup selettivo, 45s |
| High | player.js / prepareTrack | Transfer precedente al mute: finestra non protetta | Volume letto e mute verificato prima del transfer, nuovamente verificato prima del play |
| High | player.js / startPrepared; app.js / onScan | VIA mostrato dopo ripristino volume | Callback VIA dopo avanzamento corretto ancora muto, prima dell'unmute; timer solo dopo conferma SDK successiva |
| High | app.js / begin | Callback scanner non legata all'apertura: callback vecchia poteva consumare QR nuovo | Callback con roundId dell'apertura |
| High | player.js / player_state_changed | Payload vecchio dello stesso device poteva interrompere B | Lettura fresca SDK, sequenza, timeout e controllo istanza |
| High | player.js / ready | Cambio device durante round non verificato | Ritiro del device e errore se cambia ID |
| High | core.js / createCatalog | Riga invalida filtrata prima del confronto: conflitto editoriale nascosto | Conflitti rilevati prima del filtro; ID sempre escluso |
| Medium | app.js / cameraStopped, finish | Stop camera fallito ignorato fino a fine round; cleanup poteva attendere indefinitamente | Stop camera nel gate audio, timeout cleanup e RIPROVA STOP |
| Medium | app.js / visibilitychange | Camera/preparazione proseguivano in background | Annullamento apertura/scansione/preparazione; recupero tempo in PLAYING |
| Medium | spotify-auth.js / clear, tokenRequest | Refresh poteva ricreare token dopo clear; chiavi legacy residue | Epoch sessione prima della gestione/salvataggio risposta, cleanup chiavi possedute |
| Medium | spotify-auth.js / callback | PKCE con timestamp futuro accettato | Rifiuto transazione futura |
| Medium | scripts/validate-data.mjs | Baseline legata alle righe: 11 false anomalie nuove dopo deduplicazione già pubblicata | Fingerprint di anomalia e contenuti, ignora righe e soli spazi esterni; baseline intatta |
| Medium | validate-dataset.js, core.test.js | Validatore incompleto e test di sole stringhe | Validatore unico completo; test comportamentali |
| Medium | scripts/check.mjs | Syntax/marker solo sui JS radice | Controllo ricorsivo JS/MJS, JSON e marker anche nei workflow/report |
| Low | core/player, documentazione | Formula random testata ma non usata, contatore inutile, vecchi report contraddittori | Formula unica realmente usata; rimosso contatore; documentazione aggiornata |

## 3. Conflitti Git

Marker reali in origin/main: app.js, index.html, player.js, scanner.js, spotify-auth.js. Localmente anche core.js, config.js, style.css, package.json, .github/workflows/ci.yml, AUDIT_REPORT.md e DATASET_AUDIT.md: 12 file.

Confrontate tre alternative: vecchio codice globale con Web API metadata; BambocCore con reset best effort e attese evento; Bamboc con macchina a stati, snapshot SDK, timeout e ritiro device in errore. Ricomposta l'ultima e integrate le correzioni sopra. Non è bastato cancellare i marker: alcune porzioni comuni erano contaminate da implementazioni diverse.

Ricerca finale locale: zero marker reali. Occorrenze letterali nelle regex di controllo e separatori/commenti di FULL_DIFF.txt sono intenzionali. La ricerca separata su origin/main continua a rilevare il problema remoto, lasciato invariato su richiesta.

## 4. Flusso finale e inventario

LOGIN PKCE → token → SDK/device ready → SCAN (activateElement nello stesso gesto) → OPENING → SCANNING → QR/Map locale → PREPARING, stop camera e 3-2-1 paralleli alla preparazione → eventuale PREPARAZIONE… → progressione corretta ancora muta → VIA → ripristino volume → conferma SDK → PLAYING/timer → REVEAL → STOPPING → REVEALED → NEXT SONG → nuova scansione.

QR sconosciuti, invalidi e conflittuali restano in SCANNING. REVEAL abilitato solo in PLAYING. STOPPING blocca NEXT; stop fallito espone RIPROVA STOP. Annullamento torna a IDLE dopo cleanup. Pausa, cambio traccia o errore durante PLAYING causano reveal/stop. Doppio click/QR non genera round concorrenti.

| File | Responsabilità / dipendenze |
| --- | --- |
| index.html | DOM/accessibilità; script defer config/core/auth/player/scanner/song/app; QR CDN 2.3.8 |
| style.css | Identità neon, layout flessibile, safe-area, pulsanti minimi 44px, wrapping, reduced-motion |
| config.js | URI OAuth/scopes, 45s round, 3s countdown, soglie e timeout |
| core.js | Parsing QR, validazione, Map/quarantena, random, timestamp/transizioni, timeout/abort/countdown |
| song.js | Sorgente editoriale esclusiva, nessuna rete |
| spotify-auth.js | PKCE, token/refresh, storage selettivo, wrapper API |
| player.js | SDK/device, cache tecnica, mute/load/pause/seek/resume, conferme, stop |
| scanner.js | Coda start/stop, sessione, lock, permessi/fallback e clear |
| app.js | UI/stato, ownership round, controller, timer, reveal, lifecycle pagina |
| package.json e workflow | Script senza dipendenze; Actions Ubuntu/Node22, npm run ci, permessi contents:read, timeout 5 minuti |
| scripts/check.mjs | Syntax/riferimenti/guardie e marker ricorsivi |
| scripts/validate-data.mjs, validate-dataset.js | Validazione rigorosa o baseline esplicita |
| tests/run.mjs, core.test.js | SDK/DOM/camera/fetch simulati, orologio controllato, regressioni |
| .gitignore | node_modules, coverage e .DS_Store esclusi |
| README e report | Documentazione, non caricata dall'app |
| data-warnings-baseline.json | Debito editoriale noto, usato solo dal validatore |
| FULL_DIFF.txt | Artefatto storico non runtime, lasciato intatto, non prova |

Globali intenzionali: window.Bamboc, window.SONGS, callback caricamento SDK. Stato e cache nelle closure. Listener DOM registrati una volta; eventi SDK ignorano istanze ritirate. Waiter eliminano listener/poll/timeout. Timer app: rAF ring, deadline, VIA; countdown separato abortibile. Controller distinti per round app/player e richieste auth. pagehide invalida round, cancella timer, ferma scanner e disconnette; pageshow da bfcache ricarica.

## 5. Audio / intro

Ordine effettivo:

1. Offset subito se durata nota; connessione SDK senza transfer.
2. getVolume, salvataggio volume, setVolume(0), readback.
3. Eventuale PUT transfer con play:false; nuova verifica mute.
4. PUT play sul device specifico, position_ms noto oppure zero.
5. Stato della traccia richiesta, durata finita positiva, cache; ricalcolo offset se necessario.
6. Pause e conferma paused; seek random e conferma posizione entro 250ms; mute verificato.
7. Attesa gate countdown e camera; conferma posizione parcheggiata e volume zero.
8. Resume ancora muto; conferma unpaused e successivo avanzamento entro 1500ms dall'offset.
9. Aggiornamento VIA; ripristino volume/readback; nuova conferma traccia/posizione/unpaused; timestamp del timer.

Il codice non invia transfer/play prima del mute verificato. Il caricamento da zero a durata sconosciuta avviene muto. Il player è parcheggiato durante countdown, non lasciato scorrere. Il punto udibile atteso è vicino all'offset, con piccolo avanzamento tecnico per verificare progressione.

In successo il volume salvato viene ripristinato. In errore/abort si disconnette l'istanza senza riattivare uno stream ambiguo; il nuovo player riceve il volume conservato. Non si afferma che setVolume remoto riesca sempre: il vecchio oggetto può restare a zero e non viene riutilizzato.

Nessuna misura del primo campione fisico. VIA viene aggiornato nel DOM prima dell'unmute, ma paint e DAC/Bluetooth non sono sincronizzati né misurati. Su iOS il volume JavaScript non è controllabile e getVolume restituisce 1: il round si interrompe prima del transfer/play. Fonte: [riferimento ufficiale SDK setVolume](https://developer.spotify.com/documentation/web-playback-sdk/reference#spotifyplayersetvolume). Questa è una limitazione reale, non una certificazione del silenzio hardware.

## 6. Spotify

HTTP usato: navigazione GET accounts.spotify.com/authorize; POST accounts.spotify.com/api/token per scambio code e refresh; PUT api.spotify.com/v1/me/player con device_ids/play:false; PUT api.spotify.com/v1/me/player/play?device_id=... con URI e position_ms. 401: un refresh/retry; 403/404/429 espliciti. Un 404 play permette un recupero transfer e retry muto.

SDK: Player, addListener, connect, disconnect, activateElement, getVolume, setVolume, getCurrentState, pause, seek, resume. Eventi: ready, not_ready, player_state_changed, initialization_error, authentication_error, account_error, playback_error, autoplay_failed. SDK da sdk.scdn.co. Nessun GET /tracks/{id} nel runtime. ID/URI/linked_from usati per identità tecnica; name/artists/album SDK non entrano nel reveal.

## 7. Performance

Prima dello scan: Map costruita una volta, token e SDK ready. Click: attivazione audio prima di await e camera. Dopo QR: parsing/lookup locali O(1), stop camera/countdown/preparazione paralleli. Durante 3-2-1: mute/transfer/load/durata/pause/seek/conferma. A VIA: solo dopo gate e progressione, unmute/conferma. PLAYING: rAF/deadline/eventi, nessuna richiesta metadata.

Poll tecnico 250ms solo durante le attese, timeout richieste 12s, readiness 15s, playback 10s. Nessuna attesa artificiale aggiunta dopo countdown, ma resume e progressione SDK richiedono tempo. Rete/DRM/camera/refresh possono allungare PREPARAZIONE. Device mantenuto attivo tra round; transfer solo quando necessario o recupero 404. Debug registra tempi relativi, non token. Latenza fisica non misurata.

## 8. Dataset

347 record, 346 ID distinti, 345 ID giocabili. Zero record strutturalmente invalidi; zero duplicati editoriali perfetti attuali. Durate: 0 presenti, 347 mancanti. Nessuno spazio esterno/ripetuto segnalato. 29 anomalie: 21 separatori artisti, 3 parti vuote nei crediti, 1 duplicate-id, 1 artista forse troncato, 2 titoli sospetti, 1 conflicting-id.

ID manuale 515XcapFOMtOOiGU31UqNp: Queen/Bohemian Rhapsody (voce 46) e De Gregori/Rimmel (259), entrambi 1975; QR bloccato. Nessun ID inventato. Caselli già presente una sola volta (221). Vecchio report di 348 righe obsoleto. song.js invariato rispetto a Git; dettagli e promemoria editoriali in DATASET_AUDIT.md.

## 9. Cache durate

Map e sessionStorage bamboc.spotify.durations.v1, coppie ID/durata. Accetta array di coppie con ID valido e numero finito positivo; JSON corrotto ignorato. Storage indisponibile non blocca il gioco. Durata locale validata ha precedenza; cache solo dell'ID esatto.

Prima scansione: caricamento muto e durata SDK con identità verificata. Successive: offset già nel primo play. Cache aggiornata dalla durata osservata; offset ricalcolato se troppo vicino alla fine effettiva. Traccia diversa, durata mancante/zero o troppo breve non fanno partire il timer. Sotto 48 secondi rifiuto esplicito per conservare 45s + 2s margine + almeno 1s iniziale. Cache limitata alla sessione browser, non certificazione editoriale permanente.

## 10. Race conditions

NEXT bloccato finché pausa e stato paused/null confermati. Promise di pausa scaduta riutilizzata nel retry, senza seconda pausa tardiva accodata. Reset/PREPARING incrementano roundId e abortiscono prima del cleanup. Player usa oggetto round/controller/istanza/device specifici; errori ritirano il device, così comandi tardivi rimangono sul vecchio oggetto. Eventi vecchia istanza ignorati; payload stessa istanza riletto con sequenza. Scanner protetto da coda/sessione/lock e roundId app. Timer cancellati; callback verificano stato. Refresh concorrenti condividono promise; logout invalida risposte pendenti.

Abort di fetch non dimostra cancellazione server di un comando già ricevuto. disconnect non prova silenzio fisico. Isolamento verificato nei mock; rete instabile e comandi remoti tardivi da testare sul servizio. Durante sospensione OS/browser non si può imporre la pausa precisamente al secondo 45: al ritorno il timestamp recupera il tempo e avvia reveal/stop.

## 11. Test

65 test passati: 63 VM e 2 node:test. I 44 test VM originari passavano dopo ricostruzione ma lasciavano rischi scoperti; aggiunti 19 scenari VM. I vecchi test di stringhe sono stati sostituiti da copertura comportamentale e due regressioni catalogo/baseline. Il test della durata obsoleta ora controlla posizione inviata e seek effettivo, non soltanto presenza di una chiamata.

Copertura: QR valido/sconosciuto/conflittuale, reveal locale/no metadata, durata nota/sconosciuta/cache-ID/corruzione, mute prima transfer/play, volume successo e sostituzione in errore, errori mute/read/restore/play/pause/seek/resume/durata, posizione verificata, countdown veloce/lento, timer/reveal disabilitati in PREPARING, reset e callback/HTTP/seek vecchi, pausa tardiva, 45s/ring/auto-reveal, scanner lock/retry/permessi, refresh concorrente/logout, transfer riutilizzato/404, device change, traccia diversa, camera stop fallito.

Node/npm assenti nel PATH. Download portatile tentato ma non riuscito (rete sandbox, successivo avvio accesso negato). Usato il runtime Node v24.18.1 già incluso in VS Code con ELECTRON_RUN_AS_NODE=1. Nessuna installazione globale/dipendenza. npm run ci non è stato eseguito letteralmente: eseguiti i componenti equivalenti. Actions resta Node22, da verificare remotamente dopo futura pubblicazione autorizzata.

| Comando richiesto / controllo | Esecuzione effettiva / esito |
| --- | --- |
| git status/branch/log/remote/fetch/rev-parse | Eseguiti; stato sopra |
| git rev-list --left-right --count main...origin/main | 0/0 |
| npm run check | Runtime Node scripts/check.mjs: PASS |
| npm test | Runtime Node tests/run.mjs e --test tests/core.test.js: 65 PASS |
| npm run validate:dataset | Runtime Node scripts/validate-dataset.js: PASS con 29 anomalie note visibili |
| npm run validate:data:ci | Runtime Node scripts/validate-data.mjs --baseline: PASS, 0 nuove |
| npm run ci | Sequenza check/test/baseline equivalente eseguita; npm wrapper e Node22 non eseguiti qui |
| npm run validate:data | Equivalente rigoroso: FAIL previsto sul conflitto editoriale, non nascosto |
| node --check tutti JS/MJS | Ricorsivamente da check via process.execPath: PASS |
| git diff --check | PASS |
| Marker locale/remoto, /tracks/, TODO/FIXME/HACK, console, innerHTML | Ricercati; occorrenze storiche/documentali distinte dal runtime |
| Diff finale completo e file nuovi | Riesaminati prima della consegna |

Avviso ambientale: Electron emette Crashpad Accesso negato per il proprio crash reporter; suite completata. Log generato rimosso dalla repository. Nessun test usa credenziali, camera o audio reali.

## 12. File modificati

| File | Modifica e ragione | Rischio |
| --- | --- | --- |
| app.js | Ricomposizione, VIA, ownership scanner, gate/timeout camera, background | Medio: orchestrazione asincrona, mock non sostituiscono browser |
| player.js | Ricomposizione, mute/transfer, VIA, fresh state, device change, formula unica | Medio/alto sul servizio reale e audio |
| core.js | Quarantena riga invalida e formula random usata davvero | Basso, limiti testati |
| spotify-auth.js | Ricomposizione PKCE/refresh, epoch e chiavi legacy | Medio, OAuth reale da provare |
| scanner.js | Ricomposizione coda/sessione/lock/stop/clear | Medio, hardware/permessi |
| index.html | Eliminata variante duplicata e handler inline | Basso, viewport reale da verificare |
| config.js/style.css/workflow | Conflitti locali risolti alle impostazioni coerenti già in HEAD | Basso; nessun redesign/config Pages nuova |
| package.json | JSON coerente, entrambe suite, alias validate:dataset | Basso; npm wrapper non disponibile qui |
| scripts/check.mjs | Syntax e marker ricorsivi | Basso, fail-fast |
| scripts/validate-data.mjs | Fingerprint indipendente dalle righe, import senza side effect | Basso, mutazioni editoriali distinte |
| scripts/validate-dataset.js | Entry point unico completo; file già non tracciato | Basso |
| tests/run.mjs, core.test.js | Regressioni comportamentali e fixture | Basso, rimangono simulazioni |
| README/AUDIT_REPORT/DATASET_AUDIT | Stato attuale, limiti, risultati e checklist | Nessun effetto runtime |

## 13. Cleanup

Eliminate solo alternative incompatibili, globali/funzioni legacy, contatore player inutile e formula random duplicata. Nessun framework, dipendenza, redesign o riscrittura dataset. FULL_DIFF.txt e baseline preservati; dubbi editoriali pregressi conservati come promemoria non verificati. Commenti/documentazione intro aggiornati. Suite rieseguita dopo cleanup e secondo passaggio.

## 14. Problemi aperti

- Queen/Rimmel resta ambiguo/bloccato; altre anomalie editoriali da rivedere manualmente.
- Safari iPhone con volume SDK non controllabile non completa il percorso silenzioso: errore esplicito, non compatibilità dichiarata.
- Audio fisico/paint VIA/DRM/relinking/camera/latenza non verificati.
- Sospensione può ritardare lo stop oltre 45s; timestamp recuperato al ritorno.
- npm/Node22/workflow remoto non eseguiti qui; componenti verificati su Node24 incorporato.
- origin/main pubblicato resta rotto fino alla revisione/pubblicazione dell'utente. Nessun push.

## 15. Test manuali necessari

- [ ] Premium/account ammesso: login nuovo/rifiutato, reload, refresh dopo scadenza, token invalido e recupero; URI OAuth Pages esatto nel dashboard.
- [ ] Chrome desktop: cache vuota/piena, 3-2-1, PREPARAZIONE su rete lenta, VIA/primo audio, 45s/reveal/NEXT; ripetere con Spotify desktop aperto.
- [ ] Safari iPhone: DRM/attivazione e messaggio mute non supportato; nessun transfer/play prima dell'errore. Blocco sicuro non equivale a gioco funzionante.
- [ ] Chrome Android: gesto SCAN, audio/camera posteriore, portrait/landscape, safe-area e testi lunghi; app Spotify aperta sul telefono.
- [ ] Camera: concedere/negare/revocare; annullare col prompt aperto; doppio start/stop; verificare spia spenta dopo QR/annullamento/background.
- [ ] QR stampati: noto/sconosciuto/malformato/Queen-Rimmel/Caselli; doppia scansione; dieci round consecutivi; query e URL locale.
- [ ] Audio fisico: registrare prima scansione, assenza intro prima del seek; Bluetooth/altoparlante; volume esterno cambiato durante PREPARING e recupero.
- [ ] Background e telefono bloccato/sbloccato: annullamento camera/preparazione; PLAYING recupera tempo e auto-reveal/stop appena possibile.
- [ ] Rete lenta/interrotta durante load/seek/pause/resume/refresh: errore visibile, niente timer prematuro, volume sul nuovo player, STOP retry senza sovrapposizione.
- [ ] NEXT rapido/spam REVEAL: B non parte prima dello stop A; pausa tardiva, reset durante 3-2-1 e nuova scansione.
- [ ] Cambio device desktop/smartphone e not_ready: stop/errore coerenti, riconnessione e nuovo gesto SCAN.
- [ ] Pages: asset relativi e case sensitivity, CDN, callback produzione, reload su /bamboc-hit/; npm run ci con Node22 prima della pubblicazione.

## 16. Verdetto tecnico

Automatico: sintassi/marker/JSON/riferimenti, 65 test simulati, dataset completo/baseline senza novità, diff whitespace. Code review: flusso/stati, ordine mute/transfer/play, source of truth locale, ownership/cleanup, path Pages e CSS conservato. Non verificato: OAuth/SDK live, paint/mobile, camera/audio fisico, comportamento remoto dopo disconnect, sospensione OS, Actions Node22.

Versione locale pronta per test manuale controllato sui browser compatibili. Non significa che ogni dispositivo funzioni: iOS e conflitto editoriale rimangono limiti espliciti. Revisionare il diff prima di pubblicare.
