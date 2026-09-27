# Osservatori dei test

`browser-observer.js` e `oauth-observer.js` sono strumenti del solo harness VM.
Provengono dalla diagnostica mobile e consentono di conservare i test di correlazione,
ordine eventi e assenza di segreti. Non vengono importati da `index.html`.
Le precedenti funzioni di rendering, mount e listener UI sono state rimosse.

I test standard attivano esplicitamente le tracce dettagliate del player. I test
`release:` eseguono invece auth/player/app senza questi osservatori e con debug spento,
verificando anche che nessun selector cerchi i pannelli rimossi e che il percorso
critico non interroghi l'ambiente browser o il clock diagnostico.

Il probe delle capability resta qui per le regressioni simulate di feature detection:
non è codice caricato dal gioco e non viene eseguito su un browser utente.
