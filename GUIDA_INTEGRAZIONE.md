# Guida all'Integrazione - Calendario Interventi ASIM Multiservices
# Guida: Pubblicazione su GitHub Pages e Incorporamento nel CRM

Questo componente è stato progettato per integrarsi perfettamente in un sito **PHP, JavaScript e CSS** esistente, nello specifico per essere caricato nella cartella `calendario_custom` sotto l'URL:
`https://www.asimultiservices.com/calendario/`
Questa soluzione è ideale se **non disponi di accesso FTP**: il calendario viene ospitato gratuitamente e con certificato SSL (HTTPS) su **GitHub Pages**, e può essere inserito nel tuo CRM tramite backoffice semplicemente incollando un piccolo snippet HTML.

L'indirizzo pubblico del tuo repository GitHub è:
**`https://casual70.github.io/calendarioASIM/`**

---

## 📁 Struttura della Cartella `calendario_custom`
## 🚀 Passo 1: Attivare GitHub Pages sul Repository

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
1. Vai sul tuo repository GitHub: [https://github.com/Casual70/calendarioASIM](https://github.com/Casual70/calendarioASIM)
2. Clicca sulla scheda **Settings** (Impostazioni) in alto a destra.
3. Nel menu laterale sinistro clicca su **Pages**.
4. Sotto la sezione **"Build and deployment"**:
   - **Source**: seleziona `Deploy from a branch`
   - **Branch**: seleziona `main` e cartella `/ (root)`
   - Clicca su **Save**.
5. Dopo circa 1-2 minuti, il tuo calendario sarà attivo e navigabile all'indirizzo:
   👉 **`https://casual70.github.io/calendarioASIM/`**

---

## 🚀 Come Incorporarlo (Embed) nel Tuo Sito
## 💻 Passo 2: Incorporare il Calendario nel CRM

### Metodo 1: Tramite PHP Include (Consigliato per pagine PHP)
A seconda di ciò che il tuo CRM ti permette di inserire tramite backoffice, puoi scegliere una delle due opzioni:

Se la tua pagina `/calendario/index.php` (o simile) è un file PHP, puoi inserire il calendario esattamente nel punto desiderato del codice con una sola riga:
### Opzione A: Tramite `<iframe>` (Consigliatissima nel CRM)
È il metodo più sicuro, veloce e immune da conflitti CSS/JS con il CRM. Inserisci questo blocco HTML nella pagina del CRM dove vuoi mostrare il calendario:

```php
<div class="il-tuo-layout">
    <!-- Includi il calendario custom -->
    <?php include_once __DIR__ . '/calendario_custom/embed.php'; ?>
```html
<div style="width: 100%; max-width: 1350px; margin: 0 auto;">
  <iframe 
    src="https://casual70.github.io/calendarioASIM/" 
    style="width: 100%; height: 900px; border: none; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.08);" 
    title="Calendario Interventi ASIM">
  </iframe>
</div>
```
*(Nota: quando il calendario rileva di trovarsi dentro un iframe, attiva in automatico la visualizzazione compatta e pulita senza doppi bordi).*

---

### Metodo 2: Tramite HTML, JavaScript e CSS (In qualsiasi elemento DIV)
### Opzione B: Inserimento Diretto via Tag `<head>` e Pagina

Se vuoi controllarne il posizionamento dentro un elemento con ID specifico (ad esempio `<div id="calendario_custom"></div>` o `#mio-calendario`):
Se il CRM ti permette di modificare la `<head>` del sito o iniettare script/stili:

1. **Nell'<head> della tua pagina** aggiungi il foglio di stile:
1. **Nella `<head>` (o nel campo "Codice Header / Custom CSS" del CRM):**
```html
<link rel="stylesheet" href="/calendario/calendario_custom/css/calendar.css">
<link rel="stylesheet" href="https://casual70.github.io/calendarioASIM/css/calendar.css">
```

2. **Nel <body> della tua pagina**, crea l'elemento contenitore:
2. **Nel corpo della pagina (nel punto in cui deve apparire il calendario):**
```html
<div id="calendario_custom"></div>
```

3. **Prima della chiusura del </body>**, carica lo script e inizializza:
3. **Prima della chiusura di `</body>` (o nel campo "Codice Footer / Custom JS" del CRM):**
```html
<script src="/calendario/calendario_custom/js/calendar.js"></script>
<script src="https://casual70.github.io/calendarioASIM/js/calendar.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    AsimCalendar.init({
      container: '#calendario_custom',
      apiUrl: '/calendario/calendario_custom/api.php',
      defaultView: 'month' // oppure: 'week', 'day', 'list'
      defaultCsvUrl: 'https://casual70.github.io/calendarioASIM/sample.csv'
    });
  });
</script>
```

---

### Metodo 3: Accesso Diretto come Pagina Dedicata
## 📂 Come Aggiornare i Dati degli Interventi

Il calendario può essere aperto direttamente visitando:
`https://www.asimultiservices.com/calendario/calendario_custom/`
Hai due modi comodissimi per caricare o aggiornare i dati:

---
### 1. Direttamente dall'interfaccia nel CRM (Senza toccare codice)
Ogni operatore che apre la pagina può:
- **Trascinare il file CSV** direttamente sopra il calendario (Drag & Drop).
- Oppure cliccare sul pulsante verde **"Importa CSV"** e selezionare il file esportato.
- I dati vengono salvati all'istante nel browser (`localStorage`).
- Cliccando su **"Esporta CSV"** è anche possibile scaricare la lista filtrata.

## 📋 Compatibilità con il File CSV (Formato TickTick / ASIM)
### 2. Aggiornare il file base per tutti su GitHub
Se vuoi che chiunque apra il CRM veda subito una serie di interventi precaricati:
- Basta sostituire il file `sample.csv` nel repository GitHub con il nuovo file CSV esportato e fare il commit/push.
- All'apertura della pagina, il calendario caricherà automaticamente il nuovo file per tutti.

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

* **Pill Rapidi dei Tecnici**: Barra cliccabile con i tecnici (`@Goracci`, `@Serpolini`, ecc.) e conteggio interventi per filtrare in 1 clic.
* **4 Viste**: Mese, Settimana, Giorno, Elenco.
* **Ricerca Istantanea**: Cerca per cliente, indirizzo, PDR, matricola, telefono o note.
* **Scheda Dettaglio**:
  * 📍 Link diretto a **Google Maps** per raggiungere il cliente.
  * 📞 Link cliccabile per **chiamata telefonica** immediata.
  * 📋 Pulsante rapido **Copia PDR** e **Copia Matricola**.
  * 📅 Pulsante per **saltare direttamente a quella data** nel calendario.
* **Stampa & PDF**: Ottimizzato per una stampa pulita tramite il pulsante stampa.
