# Laracasts Subtitle Translator (Chrome Extension)

Estensione Chrome (Manifest V3) per tradurre i sottotitoli dei video su Laracasts.

## Funzioni

- Traduzione sottotitoli in tempo reale
- Modalita `Tradotto + originale`, `Solo tradotto`, `Solo originale`
- Selettore lingua dal popup estensione
- Sottotitoli trascinabili in pagina (drag)
- Slider nel popup per aumentare/diminuire dimensione font
- Cache locale in memoria per evitare richieste duplicate

## Installazione locale

1. Apri `chrome://extensions`
2. Attiva `Modalita sviluppatore`
3. Clicca `Carica estensione non pacchettizzata`
4. Seleziona la cartella `laracasts-subtitle-translator`

## Uso

1. Apri una lezione su Laracasts
2. Assicurati che i sottotitoli originali siano disponibili nel player
3. Clicca l'icona estensione e scegli lingua/modalita
4. Trascina il bottone `drag` sopra i sottotitoli per riposizionarli
5. Usa `Reset posizione sottotitoli` nel popup per tornare alla posizione automatica

## Limiti noti

- Dipende dalla disponibilita delle tracce sottotitoli nel player
- In fullscreen nativo del browser il posizionamento puo variare in base al player
- Usa endpoint di traduzione non ufficiale; se rate-limitato la traduzione puo interrompersi
