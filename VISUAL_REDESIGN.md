# Esperimento visivo locale

Baseline stabile verificata prima di ogni modifica: working tree pulito, branch `main`,
HEAD `89684d91ac680abba4aca4895dea85ec0c6d854e`, uguale al riferimento locale `origin/main`.
Non effettuato un fetch: l'allineamento dichiarato riguarda il riferimento remoto locale.
Nessun commit, push, reset o modifica della cronologia.

## Stile e schermate

Design system CSS: fondo viola inchiostro, superfici scure, magenta, arancio caldo,
testi chiari/secondari, bordi, glow contenuto, raggio, spaziatura e transizioni condivisi.
Nessuna nuova dipendenza o font: mantenuto Monoton già presente, con fallback di sistema.

- Login: logo su due righe, vinile puramente CSS, domanda iniziale e CTA Spotify grande.
- Pronta: stato connesso discreto, titolo grande, scansione dominante con icona SVG CSS.
- Scanner: involucro camera scuro con quattro angoli neon, overlay senza pointer events.
  Nessuna modifica alle dimensioni richieste dal codice scanner, al video o al lifecycle.
- Countdown: numero grande e tre pulsazioni CSS da un secondo; nessuna modifica JS
  al timing o al rendering dei numeri. `hidden` resta prioritario e spegne il numero.
- Playing: titolo INDOVINA, equalizer decorativo CSS, timer leggibile e pulsante RIVELA.
  Nessun accesso audio/Web Audio e nessun dato della canzone prima del reveal.
- Reveal: titolo grande, artista e anno con badge arancio, entrata di 350 ms.
  I nodi creati da `showCard()` e i dati editoriali non sono stati cambiati.
- Next: PROSSIMA CARTA. Lo stop pendente e il retry mantengono etichette e disponibilità.
- Errori: messaggio di stato sempre visibile quando valorizzato, con contrasto, bordo e
  testo a capo. Classificazione, messaggi funzionali e gestione restano invariati.

Touch target almeno 48 px, focus visibile, safe area su quattro lati, 100dvh,
larghezza massima 480 px. Layout a scorrimento naturale su schermi bassi.
Animazioni disabilitate con reduced motion. Nessun effetto glass/backdrop filter.

## Perimetro delle modifiche

`index.html`, `style.css`: presentazione. Aggiunti wrapper decorativi; conservati tutti
gli ID e l'ordine degli script. Logout spostato nell'header, ring con viewBox ma stessa
geometria r=80 e stessa circonferenza. Le introduzioni visive seguono via CSS `:has()`
gli attributi hidden già prodotti dall'app, senza nuovi stati o listener.

`app.js`: **solo due stringhe in render()**, SCAN → SCANSIONA LA CARTA e
NEXT SONG → PROSSIMA CARTA. Tutto il resto è identico alla baseline.
`tests/run.mjs`: due aspettative testuali NEXT aggiornate; nessuna asserzione funzionale
rimossa o indebolita. Aggiunti due test markup/accessibilità/hook.

Non modificati player, OAuth/PKCE, token/refresh, redirect, config, scanner, core,
song.js, durationMs, baseline dati o validatori. Invariati richieste Spotify, offset,
timing, countdown, conferma/timer, STOP/REVEAL/NEXT, epoch/round ID e AbortController.

## Verifica visuale

Edge headless locale, senza OAuth, SDK e camera: 24 combinazioni, login/pronta/playing/
reveal a larghezze 320, 360, 390, 412, 768 e 1280 px, altezza 900 px. ScrollWidth uguale
alla larghezza in tutti i casi. Ispezionate anche le quattro schermate a 390 px.
La preview usa il fallback di sistema, senza download Google Fonts. Gli screenshot e
i profili browser temporanei vengono rimossi dal repository dopo il controllo.

Da verificare fisicamente: font Monoton caricato, safe area iOS, viewport dinamica e
schermi bassi/orientamento landscape, frame sovrapposto alla camera reale, fluidità
countdown. CSS :has richiede un browser moderno; nessuna feature detection o modifica
al supporto playback è stata aggiunta. Non dichiarato alcun nuovo test Spotify reale.

## Esiti finali

- **149 test superati, zero fallimenti**: 147 applicativi (145 precedenti + 2 nuovi)
  e 2 core. Le sole aspettative della baseline aggiornate sono due testi NEXT.
- Syntax check completo superato, inclusi JSON e ricerca marker Git.
- `git diff --check` superato.
- Entrambi i validatori dataset con baseline superati: 29 segnalazioni note, nessuna
  nuova o modificata. Il conflitto Queen/Rimmel resta bloccato e documentato.
- Eseguiti direttamente gli script con Node 24 incorporato in VS Code; non npm,
  non disponibile nel PATH. Nessuna dipendenza installata.
- File critici confrontati con HEAD e invariati; diff app.js limitato alle due stringhe.
- Artefatti/profili di anteprima eliminati, processi di anteprima chiusi.

Stato finale:

```text
 M app.js
 M index.html
 M style.css
 M tests/run.mjs
?? VISUAL_REDESIGN.md
```

HEAD invariato. Esperimento solo locale, **NO COMMIT, NO PUSH**.
