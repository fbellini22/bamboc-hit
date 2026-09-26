# Audit editoriale song.js

26 settembre 2026. Tutte le 348 voci controllate. Nessuna modifica al file originale; numeri sotto riferiti alle voci (base 1), non alle righe JS.

## Esito strutturale

348 voci, 346 ID distinti, 345 ID indicizzabili senza ambiguità. 39 segnalazioni automatiche: 38 warning e 1 errore conflittuale. Nessun ID di lunghezza/formato errato, titolo/artista/anno mancante, anno fuori da 1900–2026 o testo con caratteri di encoding sospetti. Le durate non sono presenti nel dataset. Il controllo non certifica esistenza, mercato o corrispondenza musicale degli ID.

## ID duplicati ed entry duplicate

| Voci | ID | Contenuti | Gestione |
| --- | --- | --- | --- |
| 46, 260 | 515XcapFOMtOOiGU31UqNp | Bohemian Rhapsody — Queen — 1975 / Rimmel — Francesco De Gregori — 1975 | Conflitto: bloccato. Occorre identificare quale associazione è corretta; non sostituire ID senza verificare QR. |
| 221, 222 | 7zrkOMlUmpdS6COxQykfVU | Nessuno Mi Può Giudicare — Caterina Caselli — 1966, ripetuto identico | Una sola voce in Map. Entrambe le righe originali conservate. |

Non sono emerse altre coppie con titolo/artista/anno identici.

## Spazi iniziali/finali

Tutti i casi rilevati sono spazi finali. Valori riportati come stringhe JSON per renderli visibili. Nessuna normalizzazione applicata.

| Voce | ID | Brano | Campo | Valore |
| --- | --- | --- | --- | --- |
| 32 | 0QOFqNjkNJ8fh3yiXZieYg | Baila | artist | "Zucchero " |
| 41 | 0QlNv7zrkgYIccd7O3VzyT | Bella Vita  | title | "Bella Vita " |
| 95 | 0LXXnjBrLOiGVYg5vPBIXR | Eppur mi son scordato di te  | title | "Eppur mi son scordato di te " |
| 185 | 4hfIVhq0F0zFUcrbecsYmo | Let's Get It Started  | title | "Let's Get It Started " |
| 266 | 4JhVT1nbnp9eyIU70mUqot | Samarcanda | artist | "Roberto Vecchioni " |
| 285 | 2bCQHF9gdG5BNDVuEIEnNk | Smooth Criminalr | artist | "Michael Jackson " |
| 303 | 6oWLiyRpo1ibp2vKNxHG0T | Sweet Dreams | artist | "Eurythmics " |
| 320 | 4hv9MeB0ZuzbFFThnQqLPC | Trinity  | title | "Trinity " |

## Separatori degli artisti

Il punto e virgola senza spazi convive con virgole con/senza spazio. Una virgola o & possono appartenere a un nome collettivo (per esempio Earth, Wind & Fire): non vanno sostituiti automaticamente. Ecco tutte le voci segnalate per virgola/punto e virgola.

| Voce | ID | Brano | Artista |
| --- | --- | --- | --- |
| 6 | 7EM7aTxoicXDjIy3gK6Pnu | A Volte Esagero | Marracash;Salmo;Coez |
| 24 | 4AMwEGVsLR0ApxAhtN4ZQa | Angela | Checco Zalone; |
| 47 | 7fH13hSOyNoeiDGbjEnTUC | Brivido | Guè;Marracash |
| 49 | 57RGKNBUbfIBqMFEfE8CxK | Buona sera | Louis Prima; |
| 63 | 5QNEUi7oFTKcOrEMzLA9uV | Chi Non Lavora Non Fa L'Amore | Claudia Mori,Adriano Celentano |
| 84 | 008wXvCVu8W8vCbq5VQDlC | Django | Luis Bacalov;Rocky Roberts |
| 99 | 0d28khcov6AiegSCpG5TuT | Feel Good Inc. | Gorillaz;De La Soul |
| 103 | 3u5N55tHf7hXATSQrjBh2q | Freed From Desire | Gala;Molella;Phil Jay |
| 111 | 5XJMc1j7M2b4l5v6fBYaNO | giochi di gambe | Giorgio Poi;faccianuvola |
| 162 | 6oYcyS6salzWI1ysjEScFh | LA CODA DEL DIAVOLO (con ELODIE) | Rkomi;Elodie |
| 184 | 4kKdvXD0ez7jp1296JmAts | Let It Snow! Let It Snow! Let It Snow! | Frank Sinatra;B. Swanson Quartet |
| 188 | 6JtY7BCKnfIlKoiglSMZhl | Lo sto sognando | Checco Zalone; |
| 189 | 15JINEqzVMv3SvJTAXAKED | Love the Way You Lie | Eminem;Rihanna |
| 212 | 6qdMhG7pRFi0csRlFGvLE4 | MILLE – feat. Orietta Berti | Fedez, Achille Lauro, Orietta Berti |
| 214 | 5dcyltc1ataieXIeTqhH3t | Missili | Frah Quintale;Giorgio Poi |
| 239 | 4M8filny20Mwlc2gnvtcgU | P.E.S. | Club Dogo;Giuliano Palma |
| 240 | 5lmjRquEuSSRCYOBsTJRWq | Paperella Gay | SpJockey;Crypto |
| 256 | 0Oj0nsrBu8YrJdR84VWJV0 | Quarantaquattro gatti | Piccolo Coro dell'Antoniano;Zecchino d'Oro |
| 279 | 3kXoKlD84c6OmIcOLfrfEs | September | Earth, Wind & Fire |
| 282 | 2VxeLyX666F8uXCJ0dZF8B | Shallow | Lady Gaga, Bradley Cooper |
| 310 | 58uxzfDiTqLqEfNyO3ch21 | Tex-Mex | Mina;Ivano Fossati |

Tre separatori terminali creano una parte artista vuota: Angela (24), Buona sera (49), Lo sto sognando (188).

## Titoli/artisti sospetti e typo

Queste sono richieste di revisione, non sostituzioni autorizzate. Le prime tre hanno anche una segnalazione euristica automatica.

| Voce | ID | Brano | Campo | Motivo |
| --- | --- | --- | --- | --- |
| 285 | 2bCQHF9gdG5BNDVuEIEnNk | Smooth Criminalr | Titolo | r finale sospetta; artista contiene anche uno spazio finale. |
| 326 | 4ONboWX5n2926t6TcJEGHh | un estate al mare | Titolo | Apostrofo apparentemente mancante; controllare anche la scelta di maiuscola iniziale. |
| 283 | 0CuTlmtd8SLVMzzEWcet3B | Siamo Una Squadra Fortissimi | Artista | Siamo Una Squadra Fo sembra una porzione troncata del titolo. |
| 65 | 4OGzwKPn6H5eR6QkAIoIdo | Chitarratella | Artista | Carlo Bruti: possibile trasposizione di lettere nel cognome; verificare sulla registrazione scelta. |
| 182 | 2UZi7uA5vR0msMzGwFuq5f | La vendemia | Titolo | Ortografia da verificare: possibile forma dialettale o consonante mancante; non normalizzare senza riscontro. |
| 7 | 6DaqDhzDgtIPLeowS4N3kA | Abbracciami | Artista | Marino marini: maiuscola del cognome disomogenea. |
| 33 | 2xoVgHZKhYCmCNxqidJ4en | Balla | Artista | Umberto Rosario Balsamo: verificare forma editoriale del nome esteso rispetto al nome artistico. |
| 159 | 5UmGJS0jd1r52OjnNvVHvU | La Bomba | Artista | Alan Duffy: attribuzione da verificare con la registrazione effettivamente prevista dal QR. |
| 212 | 6qdMhG7pRFi0csRlFGvLE4 | MILLE – feat. Orietta Berti | Titolo | Credito feat. nel titolo mentre gli artisti sono già esplicitati: decidere convenzione editoriale. |
| 162 | 6oYcyS6salzWI1ysjEScFh | LA CODA DEL DIAVOLO (con ELODIE) | Titolo | Credito nel titolo e nel campo artist; conservare o uniformare soltanto con decisione editoriale. |

Le differenze di maiuscole in titoli o nomi (per esempio AMOR, VOCE, la noia, giochi di gambe, Ricchi e poveri, Abba, O-zone) non sono trattate come errori certi: possono essere scelte stilistiche. Non sono state cambiate.

## Anni sospetti

Tutti gli anni sono sintatticamente plausibili. Il controllo automatico non può conoscere l'anno editoriale corretto. Alcuni riscontri esterni mostrano discrepanze da sottoporre al curatore; la data del festival non certifica da sola quale versione sia codificata dal QR.

| Voce | Brano | Anno locale | Riscontro da verificare |
| --- | --- | --- | --- |
| 2 | 4/3/1943 | 1970 | RAI documenta l’esibizione a Sanremo 1971. [Archivio RAI](https://www.raiplay.it/video/2022/03/Festival-di-Sanremo-1971-Lucio-Dalla-canta-431943---04032022-bffe7525-ea46-4540-9a88-0a9a31e17c0c.html) |
| 66 | Ciao amore, ciao | 1959 | RAI Teche documenta il brano in gara a Sanremo 1967. [RAI Teche](https://www.teche.rai.it/2023/03/ciao-amore-ciao-ricordando-luigi-tenco/) |
| 290 | Sono solo parole | 2011 | RAI indica presentazione a Sanremo 2012. [RAI](https://www.raiplay.it/video/2021/11/Noemi-e-Fiorella-Mannoia-cantano-Sono-solo-parole---La-versione-di-Fiorella-29112021-e8fcdf7e-864e-4a8f-9f61-ba4ba55ee2e9.html) |
| 348 | Zingara | 1970 | RAI documenta vittoria a Sanremo 1969. [Archivio Sanremo](https://www.raiplay.it/programmi/sanremo1969) |
| 1 | 24.000 Baci | 1963 | La presentazione RAI di C’era una volta Studio Uno ambienta il primo ascolto nel 1961; controllare la versione. [RAI](https://www.raiplay.it/programmi/ceraunavoltastudiouno) |

Ulteriori candidati emersi dalla revisione, **non verificati discograficamente in questo audit**. Non sono affermazioni di errore né proposte automatiche di un anno alternativo. Per ciascuno confrontare prima uscita del brano, registrazione dell’artista, singolo/album e ristampa; scegliere consapevolmente la regola del gioco.

| Voce | ID | Brano | Artista | Anno locale |
| --- | --- | --- | --- | --- |
| 8 | 1N46SW28bpacvXmNYP6PTB | Acqua azzurra, acqua chiara | Lucio Battisti | 1970 |
| 17 | 5ueyLj6e6oVaTY0KQ6yLaA | All Shook Up | Elvis Presley | 1958 |
| 38 | 0kzGjSRHGVcaWxagzQwAyD | Bando | ANNA | 2022 |
| 39 | 5pYlc1vQ6999WU43WzF4SR | Barbra Streisand | Duck Sauce | 2011 |
| 52 | 08rTyeWZjwUhLcGhNupFZT | C'era un ragazzo che come me amava i beatles e i rolling stones | Gianni Morandi | 1967 |
| 57 | 0mHC3BK9vFGoEU0EcGPWRZ | CENERE | Lazza | 2022 |
| 82 | 4xq1trF0ztWPjtwlYkqAEw | Dieci ragazze | Lucio Battisti | 1970 |
| 84 | 008wXvCVu8W8vCbq5VQDlC | Django | Luis Bacalov;Rocky Roberts | 1985 |
| 85 | 1DFFUsN49AUonUcTiQNnjI | Dolcenera | Fabrizio De André | 1995 |
| 96 | 2oVvW4wbCGjtAOvatvYAFu | Eppure Sentire (un senso di te) | Elisa | 2006 |
| 103 | 3u5N55tHf7hXATSQrjBh2q | Freed From Desire | Gala;Molella;Phil Jay | 1997 |
| 112 | 74CjS2xMK4KLnniXzFB9GI | Gli anni | 883 | 1998 |
| 135 | 0i4mLwfyxnSSgF6hwIkU2L | Il pescatore | Fabrizio De André | 1968 |
| 164 | 7gUOmOhe5xO20Hu0bXR9SC | La Coppia Più Bella Del Mondo | Adriano Celentano | 1968 |
| 167 | 1lNop22I4dLz5MYuc60fUX | La guerra di Piero | Fabrizio De André | 1966 |
| 177 | 2TtT6prILO9coEbbbMGDjv | La Partita Di Pallone | Rita Pavone | 1963 |
| 181 | 0BZoZbffwUSf4cn9gdXX2S | La tipica ragazza italiana | Dj Matrix | 2011 |
| 185 | 4hfIVhq0F0zFUcrbecsYmo | Let's Get It Started  | Black Eyed Peas | 2003 |
| 201 | 5pv2bpJXi0vspHETP1QjIy | Mare mare | Luca Carboni | 1991 |
| 209 | 29EPnA4KRr1Eb8j835Vxqh | Mi vendo | Renato Zero | 1978 |
| 235 | 4EsU1itX1LEPptKwjhGbVl | Oggi Sono Io | Alex Britti | 1998 |
| 237 | 0DiWol3AO6WpXZgp0goxAV | One More Time | Daft Punk | 2001 |
| 252 | 0HQf0bd3oSZei450iKuUFR | Prisencolinensinainciusol | Adriano Celentano | 1973 |
| 254 | 5NVKrGAZjusEqZJ7onT9gO | Quando, Quando, Quando | Tony Renis | 1963 |
| 256 | 0Oj0nsrBu8YrJdR84VWJV0 | Quarantaquattro gatti | Piccolo Coro dell'Antoniano;Zecchino d'Oro | 1996 |
| 259 | 0NAjpcNOjROBcwFNQlcXY9 | Ricominciamo | Adriano Pappalardo | 1998 |
| 273 | 3Qjr2mNDOn24M4Y50hR9hJ | Se mi lasci non vale | Julio Iglesias | 1976 |
| 295 | 3SdTKo2uVsxFblQjpScoHy | Stand By Me | Ben E. King | 1962 |
| 308 | 3ZqL7rtfHLxWk7PQnZv7hH | Tanto pè cantà | Nino Manfredi | 1932 |
| 325 | 7eAEs2SiV7DtS8b13PGXWZ | Un bacio a mezzanotte | Quartetto Cetra | 1945 |
| 335 | 7DUs0muJGnpQ4g8N4xC35S | Vengo Anch'io No tu No | Enzo Jannacci | 1967 |

Per cover/versioni (es. La Bamba — Los Lobos; Unchain My Heart — Joe Cocker; Tanto pè cantà — Nino Manfredi; Quarantaquattro gatti — coro) occorre chiarire se l’anno desiderato sia quello della composizione, della prima edizione o dell’interprete. Non è deducibile in sicurezza dal catalogo Spotify.

## Inventario automatico completo

| Voce | ID | Codice | Campo | Gravità | Altra voce |
| --- | --- | --- | --- | --- | --- |
| 6 | 7EM7aTxoicXDjIy3gK6Pnu | artist-separator | artist | warning |  |
| 24 | 4AMwEGVsLR0ApxAhtN4ZQa | artist-separator | artist | warning |  |
| 24 | 4AMwEGVsLR0ApxAhtN4ZQa | empty-artist-part | artist | warning |  |
| 32 | 0QOFqNjkNJ8fh3yiXZieYg | whitespace | artist | warning |  |
| 41 | 0QlNv7zrkgYIccd7O3VzyT | whitespace | title | warning |  |
| 47 | 7fH13hSOyNoeiDGbjEnTUC | artist-separator | artist | warning |  |
| 49 | 57RGKNBUbfIBqMFEfE8CxK | artist-separator | artist | warning |  |
| 49 | 57RGKNBUbfIBqMFEfE8CxK | empty-artist-part | artist | warning |  |
| 63 | 5QNEUi7oFTKcOrEMzLA9uV | artist-separator | artist | warning |  |
| 84 | 008wXvCVu8W8vCbq5VQDlC | artist-separator | artist | warning |  |
| 95 | 0LXXnjBrLOiGVYg5vPBIXR | whitespace | title | warning |  |
| 99 | 0d28khcov6AiegSCpG5TuT | artist-separator | artist | warning |  |
| 103 | 3u5N55tHf7hXATSQrjBh2q | artist-separator | artist | warning |  |
| 111 | 5XJMc1j7M2b4l5v6fBYaNO | artist-separator | artist | warning |  |
| 162 | 6oYcyS6salzWI1ysjEScFh | artist-separator | artist | warning |  |
| 184 | 4kKdvXD0ez7jp1296JmAts | artist-separator | artist | warning |  |
| 185 | 4hfIVhq0F0zFUcrbecsYmo | whitespace | title | warning |  |
| 188 | 6JtY7BCKnfIlKoiglSMZhl | artist-separator | artist | warning |  |
| 188 | 6JtY7BCKnfIlKoiglSMZhl | empty-artist-part | artist | warning |  |
| 189 | 15JINEqzVMv3SvJTAXAKED | artist-separator | artist | warning |  |
| 212 | 6qdMhG7pRFi0csRlFGvLE4 | artist-separator | artist | warning |  |
| 214 | 5dcyltc1ataieXIeTqhH3t | artist-separator | artist | warning |  |
| 222 | 7zrkOMlUmpdS6COxQykfVU | duplicate-id | id | warning | 221 |
| 222 | 7zrkOMlUmpdS6COxQykfVU | duplicate-entry |  | warning | 221 |
| 239 | 4M8filny20Mwlc2gnvtcgU | artist-separator | artist | warning |  |
| 240 | 5lmjRquEuSSRCYOBsTJRWq | artist-separator | artist | warning |  |
| 256 | 0Oj0nsrBu8YrJdR84VWJV0 | artist-separator | artist | warning |  |
| 260 | 515XcapFOMtOOiGU31UqNp | duplicate-id | id | warning | 46 |
| 266 | 4JhVT1nbnp9eyIU70mUqot | whitespace | artist | warning |  |
| 279 | 3kXoKlD84c6OmIcOLfrfEs | artist-separator | artist | warning |  |
| 282 | 2VxeLyX666F8uXCJ0dZF8B | artist-separator | artist | warning |  |
| 283 | 0CuTlmtd8SLVMzzEWcet3B | possibly-truncated-artist | artist | warning |  |
| 285 | 2bCQHF9gdG5BNDVuEIEnNk | whitespace | artist | warning |  |
| 285 | 2bCQHF9gdG5BNDVuEIEnNk | possible-title-typo | title | warning |  |
| 303 | 6oWLiyRpo1ibp2vKNxHG0T | whitespace | artist | warning |  |
| 310 | 58uxzfDiTqLqEfNyO3ch21 | artist-separator | artist | warning |  |
| 320 | 4hv9MeB0ZuzbFFThnQqLPC | whitespace | title | warning |  |
| 326 | 4ONboWX5n2926t6TcJEGHh | possible-title-typo | title | warning |  |
| 260 | 515XcapFOMtOOiGU31UqNp | conflicting-id |  | error |  |

## Validazione e responsabilità editoriale

`npm run validate:data` fallisce sul conflitto di ID. `npm run validate:data:ci` confronta le 39 segnalazioni con la baseline esplicita (inclusi contenuti di entrambe le righe duplicate) e passa solo se non ci sono anomalie nuove/cambiate. La baseline non contiene né corregge gli ulteriori dubbi storico-editoriali. Correggere song.js e aggiornare report/baseline solo dopo revisione umana; non rigenerare ciecamente la baseline.
