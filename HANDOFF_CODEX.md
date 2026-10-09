# Bamboc-Hit — audit e handoff locale

Verifica eseguita il **9 ottobre 2026** sul repository `C:\Users\filip\Desktop\bamboc-hit`. Questo documento fotografa i file presenti e il riferimento remoto **già registrato localmente**: non è stato eseguito `fetch`, quindi non certifica lo stato attuale di GitHub. Non contiene credenziali. Durante l'audit non sono stati modificati sorgenti, asset, configurazioni o stato Git; sono stati creati soltanto questo documento e `PROMPT_RIPRESA_CODEX.md`.

## 1. Executive summary e stato generale

Bamboc-Hit è un gioco musicale statico HTML/CSS/JavaScript: autenticazione Spotify Premium, scanner QR, countdown 3–2–1, avvio diretto di un brano a offset casuale calcolato da `durationMs` locale, conferma SDK, round da 30 secondi e reveal dei metadati locali. La logica pubblicata resta quella del commit `b2f697b` secondo il diff locale. Il lavoro **non pubblicato** consiste in `index.html`, `style.css`, otto asset in `assets/maremma/` e `preview-maremma.html`. La Login Maremma Disco è l'ultima modifica, ancora **in attesa di verifica visiva e approvazione**. Nessun commit locale risulta avanti al riferimento `origin/main` memorizzato.

## 2. Architettura e file principali

| File | Ruolo |
| --- | --- |
| `index.html` | Schermate Login/Scan/Playing/Reveal, controlli e ordine degli script. |
| `style.css` | Layout, scenografia, vinile CSS, responsive, accessibilità visiva. |
| `config.js` | Redirect OAuth per produzione o origine/percorso locale; round 30000 ms, countdown 3000 ms, timeout. |
| `spotify-auth.js` | PKCE, callback, token in storage, refresh serializzato e richieste Web API. |
| `player.js` | SDK, READY/device, offset locale, PUT play diretto, conferma della progressione, arresto. |
| `scanner.js` | Camera/QR, serializzazione e fallback fotocamera. |
| `app.js` | Boot, state machine, rendering, countdown, round, STOP/REVEAL/NEXT. |
| `core.js` | Catalogo, validazione, estrazione ID, offset e countdown puri. |
| `song.js` | 359 righe editoriali e `durationMs`; nessuna modifica locale. |
| `duration-verification.json`, `duration-report.json`, `data-warnings-baseline.json` | Evidenze e validazione dati; nessuna modifica locale. |
| `tests/run.mjs`, `tests/core.test.js`, `scripts/` | Test e validatori. Nessuna modifica locale. |
| `docs/` | Report storici; alcuni descrivono stati intermedi ormai superati. |

Il caricamento degli script è in `index.html:9-16`; la Login inizia a `index.html:26`, la schermata di gioco a `index.html:40`. Il pulsante Spotify conserva `id="login-btn"` e il listener in `app.js:269`. La rotazione `vinyl-spin 10s linear infinite` è in `style.css:31-32`; `prefers-reduced-motion` la disabilita intenzionalmente.

## 3. Stato Git dettagliato

- Branch: `main`; HEAD `b2f697ba080a0ba62f7b7d9765e7fd3bc3da619c`, messaggio `nuove canzoni`, data commit 5 ottobre 2026.
- Upstream: `origin/main`; remote configurato `origin` su GitHub. `git branch -vv`, `git rev-list` e `git rev-parse` mostrano **0 commit avanti / 0 indietro** rispetto al riferimento locale `origin/main`, che punta allo stesso hash. Senza contattare GitHub non è possibile garantire che il server sia ancora a quel commit.
- Tracked, modificati **unstaged**: `index.html`, `style.css`. Nessuna modifica staged (`git diff --cached` vuoto), nessuna eliminazione o rinomina.
- Untracked: `preview-maremma.html` e l'intera cartella `assets/maremma/` (otto file elencati sotto). GitHub **non** contiene questi file secondo l'indice locale.
- Ignorato: `debug.log` (48.100 byte al controllo, escluso da `.gitignore`); non è stato letto né modificato. È un log locale, non necessario al funzionamento. Non copiarlo come materiale di progetto. `node_modules/` e `coverage/` sono anch'essi ignorati ma non risultano presenti nel controllo.
- `git diff --check`: PASS. Git ha emesso soltanto un avviso informativo LF/CRLF per i due file modificati.

**Dopo la creazione di questo report**, anche `HANDOFF_CODEX.md` e `PROMPT_RIPRESA_CODEX.md` risultano nuovi/untracked. Sono gli unici file aggiunti dall'audit. Nessuna operazione `git add`, commit, push, pull, fetch, merge, reset, clean, checkout o switch è stata eseguita.

## 4. Differenze locali dalla versione pubblicata conosciuta

Il diff tracked rispetto a HEAD è limitato a `index.html` (+8/-1) e `style.css` (+27). Gli asset e la preview non appaiono in `git diff` perché non tracciati: **vanno copiati fisicamente**, insieme al repository. Non ci sono commit locali non pubblicati identificabili. La versione effettiva su GitHub non è stata interrogata.

`index.html` sostituisce il semplice wrapper del vinile Login con `.record-scene`, paesaggio, vinile originale, cinghiale e vino. Aggiunge un'immagine DJ alla schermata pronta per la scansione e una vacca alla Reveal. Tutti gli ID funzionali e gli script rimangono nella stessa posizione relativa. `style.css:103-126` aggiunge gli strati decorativi; le media query successive cambiano spaziatura/altezza Scan e dimensione delle mascotte. Il lavoro non pubblicato riguarda dunque **anche Scan e Reveal**, non soltanto Login, benché l'ultima richiesta grafica avesse fermato ulteriori interventi su quelle schermate.

## 5. Asset locali importanti

Tutti questi file sono untracked e devono accompagnare il codice sul nuovo PC:

| File | Dimensioni rilevate | Uso/stato |
| --- | --- | --- |
| `assets/maremma/cinghiale-dj.webp` | 1240×948, alpha WebP | Mascotte Scan; contiene cuffie, occhiali e consolle. |
| `assets/maremma/cinghiale-occhiali.webp` | 1160×1200, alpha WebP | Login attuale; occhiali ma **senza cuffie**. |
| `assets/maremma/vacca-maremmana.webp` | 1208×1240, alpha WebP | Reveal. |
| `assets/maremma/vino.webp` | 944×1204, alpha WebP | Login; bottiglia, calice e uva. Gli attributi HTML dichiarano 1208×1208: da controllare per layout prima del caricamento. |
| `assets/maremma/paesaggio-login.webp` | 734×340, alpha WebP | Ritaglio dalla prima tavola illustrata, sfumato via CSS dietro il vinile. |
| `assets/maremma/paesaggio.svg` | SVG | Paesaggio semplificato attualmente usato in Scan/Playing, non nella Login. |
| `assets/maremma/scenografia-mobile.png` | 1246×1262, RGBA | Tentativo precedente con foro centrale trasparente; **non referenziato** dall'HTML/CSS attuale. Conservare per storia/possibili confronti. |
| `assets/maremma/login-reference.png.png` | 1024×1536, RGB | Mockup di riferimento, **non usato come sfondo runtime**. Nome effettivo con doppia estensione `.png.png`. |

`preview-maremma.html` è anch'esso untracked. Carica `index.html` in un iframe con gli script rimossi, usa il CSS reale, offre viewport 320/375/390/430/480/1440 px e non avvia Spotify. Non sostituisce un test funzionale né un confronto visivo su iPhone.

## 6. Modifiche grafiche: presente, parziale, non verificabile

| Intervento storico | Evidenza attuale e stato |
| --- | --- |
| Restyling generale, palette, tipografia, CTA | Presente nel commit HEAD in `index.html`/`style.css`; `docs/VISUAL_REDESIGN.md` descrive una fase precedente. Non è un nuovo diff locale. |
| Login Maremma Disco | Presente **come lavoro locale non pubblicato**, ma fedeltà al mockup e resa su iPhone non confermate. |
| Scenografia unica con foro alpha e vinile centrato | L'asset esiste, ma quella implementazione è stata **scartata/sostituita**. HTML/CSS attuali usano asset separati. Non presentarla come Login corrente. |
| Vinile HTML/CSS separato, etichetta B, 10 secondi | Presente. CSS locale imposta diametro `clamp(186px, 53vw, 212px)` nella Login; l'animazione originale è conservata. |
| Paesaggio colline/cipressi/borgo/tramonto | Presente nel nuovo WebP e posizionato in `.login-landscape`; fusione effettiva con lo sfondo da verificare visivamente. |
| Cinghiale Login e vino | Presenti con alpha. Il boar corrente non ha cuffie; la fedeltà alla posa del mockup è parziale. |
| Nuovo layout Scan e mascotte DJ | Presente localmente in `index.html` e `style.css`; interazione reale/responsive non riesaminati su dispositivo in questo audit. |
| Scanner con cornice neon | Presente in HEAD, non nel diff locale. Overlay CSS con `pointer-events: none` sulla scena; test camera reale non eseguito ora. |
| Countdown grande 3–2–1, Playing/equalizer/timer | Presenti in HEAD. Nessuna modifica locale alla state machine o al countdown. |
| Reveal e vacca | Composizione Reveal di base in HEAD; mascotte aggiunta localmente. Leggibilità e ingombro su telefono da verificare. |
| Responsive/accessibilità | Safe area, `[hidden]`, focus, reduced motion e contenitore max 480 px presenti. La composizione locale non ha screenshot/browser affidabili per le sei viewport. |

Il browser controllato tramite gli strumenti disponibili in questa sessione non ha esposto superfici utilizzabili. La precedente preview HTTP è raggiungibile, ma **HTTP 200 non dimostra allineamento, assenza di overflow o qualità visiva**. Occorre ispezione umana a 320/375/390/430/480/1440 px, con attenzione a label del vinile, testi/CTA, bordo del paesaggio e Scan/Reveal. Non applicare correzioni automatiche dedotte dal solo CSS.

## 7. Logica funzionale e possibili regressioni

`git diff HEAD` è vuoto per `app.js`, `player.js`, `spotify-auth.js`, `scanner.js`, `core.js`, `config.js`, `song.js` e `tests/run.mjs`. Quindi le modifiche locali grafiche **non hanno alterato direttamente** OAuth/sessione, SDK, QR, offset, conferma, countdown, timer, protezioni asincrone o dati. `config.js:9` imposta round da 30 s e preplay da 3 s. `app.js:176` usa `core.preplayCountdown`; `app.js:203-228` gestisce timer/round. `player.js:339-399` valida la durata, sceglie l'offset, invia `position_ms` e attende progressione SDK. `scanner.js:18` avvia lo scanner. La navigazione è orchestrata in `app.js`.

I nuovi elementi grafici possono però produrre regressioni **visive o di interazione** che il diff logico non esclude: maschera paesaggio in Safari, sovrapposizione cinghiale/label, asset grandi, scorrimento verticale, layout Scan con camera e CTA, leggibilità Reveal, font remoto e caricamento immagini. `index.html` dichiara proporzioni errate per `vino.webp`; il CSS imposta `height:auto`, ma il comportamento durante il caricamento va controllato. La nuova Login usa asset separati dopo avere abbandonato la scenografia unica: non dire che il vinile è allineato al foro nell'interfaccia corrente.

`README.md` dichiara che Android Chrome mobile e iPhone erano stati verificati dall'utente prima di questa revisione grafica. Questo audit non ha ripetuto una prova Spotify/QR reale. I report storici su pannelli diagnostici e timer da 45 s descrivono fasi passate: la configurazione corrente è 30 s e la release non carica il pannello diagnostico temporaneo.

## 8. Test e risultati del 9 ottobre 2026

Node/npm non sono nel PATH. Gli script sono stati eseguiti senza installazioni con il Node incorporato in VS Code, tramite `ELECTRON_RUN_AS_NODE=1` e `Code.exe`. Il messaggio Crashpad `Accesso negato` è apparso su stderr, ma i processi sotto sono usciti con codice 0. Nessun test browser/Spotify reale è compreso.

| Verifica eseguita ora | Esito |
| --- | --- |
| `scripts/check.mjs` | PASS: sintassi JS/JSON, riferimenti script e guardie. |
| `tests/run.mjs` | **147/147 PASS**. |
| `--test tests/core.test.js` | **2/2 PASS**. Totale **149/149**. |
| `scripts/validate-dataset.js` | PASS: 359 record, 359 ID riproducibili, 28 warning, 0 errori. |
| `scripts/validate-data.mjs --baseline` | PASS: 28 warning noti, 0 nuovi/modificati. |
| `scripts/validate-data.mjs` | Exit 0; 359 record, 28 warning, 0 errori. |
| Conteggio diretto `song.js` | 359 record, 359 ID unici, `durationMs` intero positivo su 359/359. Non è una nuova verifica live di Spotify. |
| `git diff --check` | PASS. |
| HTTP locale `127.0.0.1:4173` | 200 per preview, HTML, CSS e sei asset correntemente referenziati. Il server in esecuzione è locale a questo PC, non trasferibile. |

Il precedente numero **29 warning** è obsoleto rispetto al repository corrente; il numero **149 test** rimane valido. I test simulano SDK/QR/DOM: non provano DRM, autoplay, API Spotify, fotocamera, rendering Safari/Chrome o qualità grafica. Nessun errore nuovo è emerso dagli script. Non sono stati installati pacchetti.

## 9. Bug, limiti e questioni aperte

1. **Fedelità Login al mockup non confermata.** La composizione corrente è un nuovo tentativo con asset separati; va valutata sul dispositivo. L'asset cinghiale senza cuffie non replica esattamente il mockup.
2. **Scan e Reveal hanno modifiche locali precedenti** non coperte dall'ultima approvazione specifica della Login. Esaminarle prima di un eventuale commit.
3. **Asset e preview tutti untracked.** Un trasferimento basato solo su GitHub o su `git diff` li perderebbe.
4. `vino.webp` ha proporzioni reali 944×1204, ma attributi HTML 1208×1208. Possibile spazio/proporzione provvisoria errata prima del caricamento; non corretto per vincolo di sola lettura.
5. `login-reference.png.png` ha doppia estensione; non correggere il nome senza coordinare riferimenti/documentazione.
6. `scenografia-mobile.png` resta nel progetto ma non è usata. Tenerla finché non si decide consapevolmente se conservarla.
7. 28 warning editoriali esistenti, nessun errore bloccante secondo i validatori correnti. Non rigenerare o modificare la baseline automaticamente.
8. Stato reale di GitHub non interrogato; l'allineamento `0/0` riguarda esclusivamente `origin/main` locale.

## 10. Decisioni tecniche e cronologia disponibile

Il progetto conserva metadati locali, durate locali e un solo comando play all'offset dopo il countdown; non usa play preparatorio a zero. Il timer parte soltanto dopo la conferma SDK. L'utente ha richiesto di non cambiare OAuth, playback, QR o dataset durante il redesign. I pannelli diagnostici temporanei furono rimossi dalla release; il normale errore di stato rimane. Un redesign generale fu verificato e committato nei commit precedenti. In seguito furono introdotte localmente le mascotte e provata una scenografia mobile con foro trasparente. L'utente giudicò quella soluzione e successivi collage non sufficientemente fedeli. L'ultimo intervento completato ha sostituito la scenografia unica nella Login con paesaggio ritagliato, boar/vino separati e disco grande; test e HTTP sono passati, ma non è stato ottenuto uno screenshot browser affidabile. L'ultima richiesta è questo **audit/handoff**, non l'autorizzazione a continuare il redesign.

La conversazione disponibile e i documenti storici non provano ogni test visivo precedente né le decisioni fuori dalla cronologia qui accessibile. Non inventare approvazioni. Il prossimo lavoro previsto, **solo dopo istruzioni dell'utente**, è valutare la Login nella preview su iPhone/desktop e decidere se correggerla, poi eventualmente tornare a Scan, Playing e Reveal.

## 11. Avvio sul nuovo PC e dipendenze

1. Copiare **l'intera directory** `bamboc-hit`, compresi `.git`, `.github`, file untracked, `assets/maremma/`, `preview-maremma.html` e i due documenti di handoff. Preservare i nomi esatti, inclusa la doppia estensione del riferimento. Verificare che il software di copia non escluda file nascosti; evitare di usare soltanto GitHub per ricostruire questo stato.
2. Aprire il repository senza eseguire pull/reset/clean. Leggere `HANDOFF_CODEX.md` e `PROMPT_RIPRESA_CODEX.md`, poi controllare `git status --short`, `git branch -vv`, HEAD, file untracked e hash. Conservare una copia separata finché il contenuto trasferito non è verificato.
3. Installare sul nuovo PC **Node.js 22+** solo quando autorizzato/necessario; questa operazione non è stata eseguita nell'audit. Non ci sono dipendenze npm locali richieste dai test. Per sviluppo normale: servire la cartella con un server statico su HTTPS o `http://127.0.0.1:<porta>/`; non usare `file://`. Il server locale corrente su porta 4173 è un processo temporaneo, non parte del repository.
4. Registrare nella Spotify Developer Dashboard il redirect esatto restituito da `config.js` per l'URL locale scelto (porta, percorso, slash); il redirect di produzione è già dichiarato in `README.md`. Serve account Spotify Premium abilitato all'app, browser compatibile con DRM e autorizzazione camera per il test reale. Libreria QR, SDK Spotify e font Monoton sono risorse esterne caricate dall'HTML. Non copiare sessionStorage/localStorage OAuth o token tra PC.
5. La preview statica `preview-maremma.html` mostra la Login senza avviare Spotify. Per i test, vedere gli script in `package.json`; eseguire check/test/validator solo dopo aver verificato l'ambiente.

## 12. File da trasferire, dati esterni e prevenzione perdita

Copiarne **tutti** i file e directory del progetto, non solo quelli elencati da `git ls-files`. In particolare: i due tracked modificati, `preview-maremma.html`, **tutti gli otto file** di `assets/maremma/`, i due report di handoff, `song.js` e i JSON dati già tracciati, `docs/`, `tests/`, `scripts/`, `.git` e `.github`. `debug.log` è ignorato e non necessario; non aprirlo/includerlo nel report. Le immagini originali nella cartella Downloads e gli allegati della vecchia sessione sono **fuori** dal repository: non sono richiesti per eseguire la versione corrente, ma possono servire per nuovi ritagli o confronti storici. Il riferimento mockup essenziale è stato copiato dentro `assets/maremma/login-reference.png.png`.

Il nuovo PC non erediterà automaticamente il server HTTP locale, lo stato del browser, i permessi camera, la sessione OAuth, eventuali credenziali del sistema o la configurazione Spotify esterna. Il remote Git è configurato nella copia di `.git`, ma la disponibilità/accessibilità del server va verificata separatamente. Evitare copie che normalizzino o saltino gli asset non tracciati. Prima di intervenire, confrontare conteggio file e stato Git tra i PC.

## 13. Piano di ripresa e condizioni prima di un futuro push

La nuova sessione deve prima fare un inventario **di sola lettura** e presentare all'utente differenze rispetto a questo report. Non correggere nulla senza autorizzazione. In seguito: ottenere review visiva Login a 320/375/390/430/480/1440 px e prova iPhone portrait; controllare asset, alpha, composizione, label vinile, scrolling, CTA, errori OAuth. Esaminare separatamente Scan/Playing/Reveal e le modifiche non pubblicate di quelle schermate. Solo dopo una decisione esplicita sulle parti da mantenere, aggiornare test se serve e ripetere test/validator/verifica diff. Un futuro push richiede approvazione dell'utente, revisione esatta di tracked e untracked, assenza di log/segreti/cache, conferma del remote reale e smoke test compatibile con Spotify/camera. Non dedurre approvazione dal semplice trasferimento.

## 14. Integrità al termine dell'audit

Hash SHA-256 dei sorgenti **prima** della creazione dei documenti: `index.html` `900BE165729FDDA0CEEA5288C64BD34EA64F940EA8B14E9FD865F235974CFD32`; `style.css` `AAA845A8608664AA072D3834ECDCE9598A6D02F522249AFFDC29C3B36BAB6770`; `app.js` `352AD44CF8B81BB87027611400CDBDB7A69A5E59F3274BBF68CE970A973A171B`; `player.js` `8611E9686F4A30E376DAEC77B2579263E7D6FE2D0FAD6D895394625866386C40`; `spotify-auth.js` `B62286273B354DC3D572185789ECA4DF9517526A9BB8640293376E74DF5AA06B`; `scanner.js` `4D161C26CC00275905AAAF31B12FE0625E56B68D99DA682FF28AC2EE5B3B5EE1`; `core.js` `45B7726A93E3E12BCB3DF61B0C5BDE3C9A02650622E34C400CADA8BB8594B316`; `config.js` `1CA01503BAF3A4206A141DBBCE840E32DF50A6335CC016E2F725CFEDF1ED0312`; `song.js` `AEFAA0F5BACA7EA65C02CAC063A6739FEB61595A09FC2AD01C0C484A16C1DA19`; `tests/run.mjs` `3646119B342E001C86DC8BA24F74FA392294D0EC93CBE94B832C32E087F6868F`.

Il controllo finale dopo la creazione dei due documenti deve riconfermare questi hash, HEAD e `git status`; il risultato sarà comunicato anche nel messaggio finale.
