# AGENTS.md - Guida operativa per nuove sessioni agentiche

Questo documento serve come contesto persistente per chi riprende il progetto in una nuova sessione.

## 1) Obiettivo del progetto

Estensione Chrome (Manifest V3) per Laracasts/Vimeo che:

- intercetta i sottotitoli del player,
- traduce in tempo reale,
- mostra un overlay custom trascinabile,
- permette configurazione da popup (lingua, modalita, font, hide native captions),
- evita la sovrapposizione con i sottotitoli nativi del player.

## 2) Stato attuale (importante)

Lo stato corrente e considerato **buono/stabile**:

- generazione sottotitoli extension: OK,
- drag overlay: OK,
- switch modalita (`both` / `translated` / `original`): OK,
- controllo dimensione font: OK,
- persistenza impostazioni su `chrome.storage.sync`: OK,
- push su GitHub gia eseguito (`main`).

Nota critica: in passato ci sono state regressioni severe (pagina bianca / sottotitoli spariti). Prima di toccare la logica di hide native captions, leggere la sezione "Rischi e anti-regressione".

## 3) Struttura file

- `manifest.json`: configurazione extension MV3, permissions, content script, service worker, popup.
- `background.js`: traduzione tramite endpoint Google (fallback multipli), gestione messaggi runtime.
- `content.js`: logica principale (video detection, text tracks, rendering overlay, drag, hide native captions, settings sync).
- `popup.html`: UI impostazioni extension.
- `popup.js`: binding popup -> `chrome.storage.sync`.
- `README.md`: installazione/uso locale.

## 4) Flusso tecnico corrente

1. `content.js` rileva il video principale in pagina (anche con elementi dinamici).
2. Prova a legarsi ai `TextTrack` (`subtitles` / `captions`).
3. Se necessario "risveglia" track elements per forzare caricamento cues.
4. Sui `cuechange` ottiene testo sorgente, traduce via `chrome.runtime.sendMessage` al `background.js`.
5. Renderizza testo in overlay custom.
6. In base a impostazioni, nasconde i sottotitoli nativi in modo controllato.

## 5) Rischi e anti-regressione (OBBLIGATORIO)

### 5.1 Non nascondere container globali

In una regressione precedente un fallback aggressivo nascondeva antenati DOM e portava pagina bianca.

Regole:

- non usare hide su `html`, `body`, wrapper macro,
- non nascondere antenati senza limiti stretti,
- evitare `display:none` su nodi non chiaramente caption-like,
- preferire hide mirato con filtri su rettangolo/posizione/dimensioni/testo.

### 5.2 `TextTrack.mode` e loading cues

Su alcuni player i cues non arrivano se track non e "attivata".

Strategia corrente:

- fase warm-up possibile con `showing` per far caricare cues,
- poi gestione rendering nativo tramite hide controllato,
- evitare di lasciare il sistema in stato senza cues + native hidden.

### 5.3 Fail-safe

Se overlay non ha testo, i native captions non devono restare nascosti per sempre.

## 6) Comportamento atteso (acceptance criteria)

Una modifica e accettabile solo se tutte le condizioni sono vere:

1. pagina Laracasts non diventa bianca attivando extension,
2. almeno una lezione mostra sottotitoli extension in play,
3. drag overlay funziona,
4. switch modalita nel popup applicato in tempo reale,
5. slider font applicato in tempo reale,
6. toggling `Nascondi sottotitoli player` produce effetto coerente,
7. disabilitando extension, il player torna utilizzabile (nessun stato sporco persistente),
8. nessun errore JS bloccante in console.

## 7) Checklist operativa per future modifiche

Quando un agent fa cambi non banali in `content.js`:

1. mantenere cambi piccoli e isolati,
2. non introdurre fallback distruttivi su DOM globale,
3. eseguire syntax check locale:
   - `node --check content.js`
   - `node --check background.js`
   - `node --check popup.js`
   - `python3 -m json.tool manifest.json >/dev/null`
4. ricaricare extension in `chrome://extensions`,
5. test manuale rapido su video Laracasts.

## 8) Debug rapido consigliato

Se qualcosa non funziona:

- verificare textTracks esposti:
```js
Array.from(document.querySelector("video")?.textTracks || []).map(t => ({kind:t.kind,label:t.label,lang:t.language,mode:t.mode,cues:t.cues?.length}))
```

- verificare quanti video/track ci sono in pagina:
```js
[...document.querySelectorAll("video")].map((v,i)=>({
  i,
  w: Math.round(v.getBoundingClientRect().width),
  h: Math.round(v.getBoundingClientRect().height),
  trackEls: v.querySelectorAll("track").length,
  textTracks: v.textTracks?.length ?? null
}))
```

- controllare errori runtime in console della pagina e in service worker dell'estensione.

## 9) Priorita prossimi interventi (se richiesti)

1. Ridurre complessita di `content.js` in moduli logici (track manager / overlay manager / settings manager).
2. Aggiungere debug mode opzionale nel popup (es. stato track/cues in overlay).
3. Migliorare detection caption per player non standard senza introdurre regressioni visive.
4. Valutare provider traduzione con API key (DeepL/OpenAI) come alternativa stabile.

## 10) Regole di modifica consigliate

- Preferire robustezza a feature "furbe".
- Se un fix e incerto, introdurre feature flag/toggle invece di cambiare comportamento globale.
- Ogni volta che si tocca hide native captions, fare test con:
  - extension abilitata,
  - extension disabilitata,
  - hideNative ON,
  - hideNative OFF.

## 11) Comandi git utili

```bash
git status
git diff
git add .
git commit -m "<messaggio>"
git push
```

Repository remoto:

- `git@github.com:gghidoni/vimeo-subtitle-translator.git`
