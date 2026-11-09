# Calendario Interventi ASIM Multiservices

Componente calendario web leggero, moderno e reattivo per la gestione e visualizzazione degli interventi tecnici di ASIM Multiservices.
Progettato per essere incorporato (embedded) all'interno di:
`https://www.asimultiservices.com/calendario` (cartella `calendario_custom`).

---

## 📂 Contenuto del Progetto

- **`calendario_custom/`**: Cartella da caricare sul server all'interno della cartella `/calendario/`.
  - `js/calendar.js`: Logica frontend, parser CSV (formato TickTick/ASIM), filtri e viste.
  - `css/calendar.css`: Fogli di stile isolati e responsive (desktop, tablet, smartphone, stampa).
  - `api.php`: Script backend per il salvataggio condiviso dei dati in JSON.
  - `embed.php`: Snippet rapido per l'inclusione in pagine PHP.
  - `index.php` & `index.html`: Versioni standalone accessibili direttamente.
  - `sample.csv`: File di esempio con gli interventi forniti.
- **`test_parent_page.php`** / **`test_parent_page.html`**: Pagina demo che simula il sito ospitante con il calendario incorporato dentro `<div id="calendario_custom"></div>`.
- **`GUIDA_INTEGRAZIONE.md`**: Guida passo-passo per l'integrazione sul server.

---

## ⚡ Avvio Rapido Locale

Puoi testare immediatamente il calendario aprendo con un doppio clic nel tuo browser:
- `test_parent_page.html` oppure `calendario_custom/index.html`

Premi su **"Carica Demo"** o trascina il file `sample.csv` per visualizzare subito tutti gli interventi!

