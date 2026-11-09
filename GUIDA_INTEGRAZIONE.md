# Guida all'Integrazione - Calendario Interventi ASIM Multiservices

Questo componente è stato progettato per integrarsi perfettamente in un sito **PHP, JavaScript e CSS** esistente, nello specifico per essere caricato nella cartella `calendario_custom` sotto l'URL:
`https://www.asimultiservices.com/calendario/`

---

## 📁 Struttura della Cartella `calendario_custom`

```text
calendario_custom/
├── api.php             # Backend PHP per salvataggio e recupero dati (JSON/CSV)
├── embed.php           # Snippet PHP pronto per l'inclusione immediata
├── index.php           # Pagina standalone PHP (accessibile via browser)
├── index.html          # Versione standalone HTML pura (funziona anche offline)
├── sample.csv          # File CSV di esempio con interventi reali forniti
├── css/
│   └── calendar.css    # Stili moderni, responsive e isolati con prefisso .asim-cal
├── js/
│   └── calendar.js     # Motore del calendario, parser CSV, filtri e modale
└── data/               # Cartella creata automaticamente per memorizzare gli eventi
    └── events.json
```

---

## 🚀 Come Incorporarlo (Embed) nel Tuo Sito

### Metodo 1: Tramite PHP Include (Consigliato per pagine PHP)

Se la tua pagina `/calendario/index.php` (o simile) è un file PHP, puoi inserire il calendario esattamente nel punto desiderato del codice con una sola riga:

```php
<div class="il-tuo-layout">
    <!-- Includi il calendario custom -->
    <?php include_once __DIR__ . '/calendario_custom/embed.php'; ?>
</div>
```

---

### Metodo 2: Tramite HTML, JavaScript e CSS (In qualsiasi elemento DIV)

Se vuoi controllarne il posizionamento dentro un elemento con ID specifico (ad esempio `<div id="calendario_custom"></div>` o `#mio-calendario`):

1. **Nell'<head> della tua pagina** aggiungi il foglio di stile:
```html
<link rel="stylesheet" href="/calendario/calendario_custom/css/calendar.css">
```

2. **Nel <body> della tua pagina**, crea l'elemento contenitore:
```html
<div id="calendario_custom"></div>
```

3. **Prima della chiusura del </body>**, carica lo script e inizializza:
```html
<script src="/calendario/calendario_custom/js/calendar.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    AsimCalendar.init({
      container: '#calendario_custom',
      apiUrl: '/calendario/calendario_custom/api.php',
      defaultView: 'month' // oppure: 'week', 'day', 'list'
    });
  });
</script>
```

---

### Metodo 3: Accesso Diretto come Pagina Dedicata

Il calendario può essere aperto direttamente visitando:
`https://www.asimultiservices.com/calendario/calendario_custom/`

---

## 📋 Compatibilità con il File CSV (Formato TickTick / ASIM)

Il parser integrato elabora automaticamente la struttura del file CSV fornito:

| Campo CSV | Rilevamento Automatico | Azione nel Calendario |
| :--- | :--- | :--- |
| **CONTENT** | Nome Cliente + Codice (es. `C03`, `A01`, `D01`) + `@Tecnico` | Estrae il nome cliente, il codice lavoro e il tecnico assegnato |
| **DESCRIPTION** | Righe `PDR:`, `Matricola:`, `Tecnico:`, `Indirizzo:`, `Telefono:`, `NOTE:` | Estrae tutti i dettagli tecnici |
| **DATE** | `today at 12:30`, `tomorrow at 09:30`, `in 2 days at 09:30`, `4 days ago`, o date assolute | Calcola la data e l'orario effettivo dell'intervento |
| **PRIORITY** | Priorità numerica (1, 2, 3, 4...) | Assegna tag visivo di priorità |
| **AUTHOR** | Nome autore (es. `Filippo`) | Mostrato nei metadati dell'intervento |

---

## ✨ Funzionalità Incluse

1. **Importazione CSV Immediata**:
   - Trascina il file CSV direttamente sopra il calendario (Drag & Drop).
   - Oppure premi il pulsante **"Importa CSV"**.
   - Disponibile anche il pulsante **"Carica Demo"** per testare subito i dati di esempio.

2. **Viste Multiple**:
   - **Mese**: Griglia completa con chip colorati per tecnico, orari e codice lavoro.
   - **Settimana**: Vista suddivisa per i 7 giorni con schede interventi.
   - **Giorno**: Vista timeline con orari dettagliati degli appuntamenti.
   - **Elenco**: Lista cronologica completa di tutti gli interventi filtrati.

3. **Filtri e Ricerca in Tempo Reale**:
   - 🔍 **Ricerca libera**: cerca all'istante per nome cliente, indirizzo, telefono, PDR, matricola o note.
   - 👷 **Filtro Tecnico**: visualizza solo gli interventi di un tecnico specifico (`@Goracci`, `@Serpolini`, ecc.).
   - 🏷️ **Filtro Codice Intervento**: filtra per tipo di lavoro (`A01`, `C03`, `D01`, `A40`...).

4. **Scheda Dettaglio Intervento (Modale)**:
   - 📍 **Indirizzo**: pulsante diretto per aprire la destinazione su **Google Maps**.
   - 📞 **Telefono**: pulsante cliccabile per effettuare direttamente la chiamata dal telefono del tecnico (`tel:...`).
   - 📋 **PDR e Matricola**: pulsante "Copia" rapido con feedback visivo.
   - 📅 **Pulsante "Visualizza questo giorno nel calendario"**: per saltare direttamente alla data dell'intervento.

5. **Persistenza dei Dati**:
   - Se il server PHP è raggiungibile, salva i dati in `data/events.json` in modo che tutti i dispositivi e tecnici vedano lo stesso calendario aggiornato.
   - Se utilizzato in locale o senza PHP, memorizza automaticamente tutto in `localStorage`.

6. **Stampa e PDF**:
   - Pulsante dedicato per la stampa con CSS `@media print` ottimizzato (rimuove barre e pulsanti per una stampa pulita).

