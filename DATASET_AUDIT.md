# Audit dataset — verifica locale 26 settembre 2026

347 record, 346 ID distinti, 345 ID utilizzabili. Zero record strutturalmente invalidi. 28 warning e un errore editoriale conflittuale. Nessuna durationMs presente (347 mancanti). Nessuno spazio esterno o doppio spazio segnalato. song.js non è stato modificato durante questo audit ed è identico a origin/main.

## QR da bloccare

L'ID `515XcapFOMtOOiGU31UqNp` appartiene alle voci 46 (Bohemian Rhapsody — Queen — 1975) e 259 (Rimmel — Francesco De Gregori — 1975). Entrambe sono escluse dal lookup. Verificare la registrazione e i QR stampati prima di scegliere una correzione manuale. Nessun ID inventato.

Il duplicato identico di Nessuno Mi Può Giudicare è già assente nello stato iniziale: una sola voce (221), ID `7zrkOMlUmpdS6COxQykfVU`. Nessun altro record editoriale identico rilevato.

## Segnalazioni correnti

I separatori nei crediti sono avvisi di convenzione, non errori certi. Non sono stati riscritti artisti, anni, titoli, versioni o ID.

| Voce | ID | Brano | Segnalazione | Campo |
| --- | --- | --- | --- | --- |
| 6 | 7EM7aTxoicXDjIy3gK6Pnu | A Volte Esagero | warning: artist-separator | artist |
| 24 | 4AMwEGVsLR0ApxAhtN4ZQa | Angela | warning: artist-separator | artist |
| 24 | 4AMwEGVsLR0ApxAhtN4ZQa | Angela | warning: empty-artist-part | artist |
| 47 | 7fH13hSOyNoeiDGbjEnTUC | Brivido | warning: artist-separator | artist |
| 49 | 57RGKNBUbfIBqMFEfE8CxK | Buona sera | warning: artist-separator | artist |
| 49 | 57RGKNBUbfIBqMFEfE8CxK | Buona sera | warning: empty-artist-part | artist |
| 63 | 5QNEUi7oFTKcOrEMzLA9uV | Chi Non Lavora Non Fa L'Amore | warning: artist-separator | artist |
| 84 | 008wXvCVu8W8vCbq5VQDlC | Django | warning: artist-separator | artist |
| 99 | 0d28khcov6AiegSCpG5TuT | Feel Good Inc. | warning: artist-separator | artist |
| 103 | 3u5N55tHf7hXATSQrjBh2q | Freed From Desire | warning: artist-separator | artist |
| 111 | 5XJMc1j7M2b4l5v6fBYaNO | giochi di gambe | warning: artist-separator | artist |
| 162 | 6oYcyS6salzWI1ysjEScFh | LA CODA DEL DIAVOLO (con ELODIE) | warning: artist-separator | artist |
| 184 | 4kKdvXD0ez7jp1296JmAts | Let It Snow! Let It Snow! Let It Snow! | warning: artist-separator | artist |
| 188 | 6JtY7BCKnfIlKoiglSMZhl | Lo sto sognando | warning: artist-separator | artist |
| 188 | 6JtY7BCKnfIlKoiglSMZhl | Lo sto sognando | warning: empty-artist-part | artist |
| 189 | 15JINEqzVMv3SvJTAXAKED | Love the Way You Lie | warning: artist-separator | artist |
| 212 | 6qdMhG7pRFi0csRlFGvLE4 | MILLE – feat. Orietta Berti | warning: artist-separator | artist |
| 214 | 5dcyltc1ataieXIeTqhH3t | Missili | warning: artist-separator | artist |
| 238 | 4M8filny20Mwlc2gnvtcgU | P.E.S. | warning: artist-separator | artist |
| 239 | 5lmjRquEuSSRCYOBsTJRWq | Paperella Gay | warning: artist-separator | artist |
| 255 | 0Oj0nsrBu8YrJdR84VWJV0 | Quarantaquattro gatti | warning: artist-separator | artist |
| 259 | 515XcapFOMtOOiGU31UqNp | Rimmel | warning: duplicate-id | id |
| 278 | 3kXoKlD84c6OmIcOLfrfEs | September | warning: artist-separator | artist |
| 281 | 2VxeLyX666F8uXCJ0dZF8B | Shallow | warning: artist-separator | artist |
| 282 | 0CuTlmtd8SLVMzzEWcet3B | Siamo Una Squadra Fortissimi | warning: possibly-truncated-artist | artist |
| 284 | 2bCQHF9gdG5BNDVuEIEnNk | Smooth Criminalr | warning: possible-title-typo | title |
| 309 | 58uxzfDiTqLqEfNyO3ch21 | Tex-Mex | warning: artist-separator | artist |
| 325 | 4ONboWX5n2926t6TcJEGHh | un estate al mare | warning: possible-title-typo | title |
| 259 | 515XcapFOMtOOiGU31UqNp | Rimmel | error: conflicting-id |  |

## Baseline e validazione

La baseline originale resta invariata. Il confronto usa codice, gravità, campo, ID e contenuti delle voci; ignora solo posizione nel file e spazi esterni. Le 11 false novità erano righe spostate dopo la deduplicazione Caselli o spazi già rimossi. Tutte le 29 anomalie attuali corrispondono al debito già registrato. I test verificano che modificare ID, titolo, artista, anno o tipo di anomalia non passi inosservato. La validazione rigorosa continua a fallire sul conflitto; CI/validate:dataset lo mostrano e accettano soltanto la baseline esplicita.

## Promemoria editoriali conservati dal report precedente

Queste sono ipotesi pregresse, non verifiche discografiche di questo audit e non autorizzano correzioni. Sono conservate per non perdere il lavoro editoriale. Per gli anni occorre distinguere prima pubblicazione, versione, registrazione e ristampa.

- Smooth Criminalr: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- un estate al mare: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Siamo Una Squadra Fortissimi: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Chitarratella: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- La vendemia: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Abbracciami: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Balla: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- La Bomba: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- MILLE – feat. Orietta Berti: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- LA CODA DEL DIAVOLO (con ELODIE): revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- 4/3/1943: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Ciao amore, ciao: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Sono solo parole: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Zingara: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- 24.000 Baci: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Acqua azzurra, acqua chiara: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- All Shook Up: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Bando: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Barbra Streisand: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- C'era un ragazzo che come me amava i beatles e i rolling stones: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- CENERE: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Dieci ragazze: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Django: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Dolcenera: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Eppure Sentire (un senso di te): revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Freed From Desire: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Gli anni: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Il pescatore: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- La Coppia Più Bella Del Mondo: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- La guerra di Piero: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- La Partita Di Pallone: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- La tipica ragazza italiana: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Let's Get It Started: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Mare mare: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Mi vendo: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Oggi Sono Io: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- One More Time: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Prisencolinensinainciusol: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Quando, Quando, Quando: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Quarantaquattro gatti: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Ricominciamo: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Se mi lasci non vale: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Stand By Me: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Tanto pè cantà: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Un bacio a mezzanotte: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
- Vengo Anch'io No tu No: revisione manuale di crediti, grafia o anno/versione; nessuna modifica applicata.
