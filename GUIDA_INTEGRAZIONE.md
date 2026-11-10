# Guida: Calendario ASIM con GitHub Pages e Turso Database Cloud

Questa soluzione garantisce:
1. **Zero configurazione server**: hosting gratuito via **GitHub Pages** (con HTTPS certificato per il tuo CRM).
2. **Database Cloud Multi-Utente**: collegato a **Turso DB** (`calendario-casual70.aws-eu-west-1.turso.io`). Tutte le modifiche, creazioni e spostamenti drag-and-drop sono **permanenti e visibili in tempo reale da qualsiasi browser, PC o cellulare**.

L'indirizzo pubblico del tuo calendario è:
👉 **`https://casual70.github.io/calendarioASIM/`**

---

## 🗄️ Database Turso Collegato e Attivo

Il database Turso è già stato inizializzato e popolato con gli interventi iniziali:
* **Database Host**: `https://calendario-casual70.aws-eu-west-1.turso.io`
* **Tabella**: `appointments`
* **Sincronizzazione in tempo reale**:
  * Quando l'ufficio modifica un orario o assegna un tecnico, Turso viene aggiornato all'istante (`UPDATE`/`INSERT`).
  * I dispositivi di tutti gli altri operatori (es. tecnici sul campo) interrogano Turso ogni 15 secondi in background (`SELECT MAX(updated_at)`) aggiornando la schermata senza ricaricare la pagina!
  * Indicatore visivo in alto: **`🟢 Turso Cloud Live`**.

---

## 🚀 Passo 1: Attivare GitHub Pages sul Repository

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

## 💻 Passo 2: Incorporare il Calendario nel CRM

### Tramite `<iframe>` (Consigliatissimo nel CRM)
È il metodo più sicuro, veloce e immune da conflitti con il CRM. Inserisci questo blocco HTML nella pagina del CRM dove vuoi mostrare il calendario:

```html
<div style="width: 100%; max-width: 1400px; margin: 0 auto;">
  <iframe 
    src="https://casual70.github.io/calendarioASIM/" 
    style="width: 100%; height: 920px; border: none; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.08);" 
    title="Calendario Interventi ASIM">
  </iframe>
</div>
```
*(Nota: il calendario rileva automaticamente se si trova dentro un iframe e rimuove i margini esterni per integrarsi alla perfezione nel design del CRM).*

---

## ✨ Funzionalità Complete

1. **Sincronizzazione Cloud Istantanea**:
   * Modifica qualsiasi appuntamento (orario, tecnico, note, cliente, telefono, indirizzo).
   * Sposta gli appuntamenti con il **Drag & Drop** tra i giorni della settimana o del mese.
   * Crea un **Nuovo Intervento** con il pulsante principale `+ Nuovo Intervento` o con il tasto rapido `+` presente su ciascun giorno.
   * Elimina interventi con conferma di sicurezza (`🗑️ Elimina`).
   * Le modifiche sono memorizzate nel cloud Turso e riflesse istantaneamente su tutti gli altri schermi grazie al polling automatico in tempo reale.

2. **Gestione Durata Intervento e Occupazione Fascia Oraria**:
   * All'inserimento o modifica di un intervento è possibile specificare la **durata in ore** (es. `0.5` = 30m, `1` = 1h predefinita, `1.5`, `2`, `3`, `4`).
   * Sono disponibili comodi pulsanti pill per la selezione rapida (`30m`, `1h`, `1h30`, `2h`, `3h`, `4h`).
   * **Occupazione visiva dello spazio**: Nella vista settimanale e giornaliera, la scheda dell'intervento occupa verticalmente uno spazio proporzionale alla durata specificata (un intervento di 2 ore occupa il doppio dello spazio di uno da 1 ora).
   * Mostra l'orario di inizio e di fine calcolato (es. `09:30 - 11:30`) e una barra di occupazione oraria (`⏱️ 2 ore | 09:30 ➔ 11:30`).
   * **Rilevamento conflitti/sovrapposizioni**: Se due interventi per lo stesso tecnico si sovrappongono nella stessa fascia oraria, il sistema avvisa in tempo reale nel modulo con un box rosso (`⚠️ Attenzione sovrapposizione`) e contrassegna la scheda nel calendario con un bordo tratteggiato e badge di conflitto.

3. **Visualizzazione Predefinita a Settimana**:
   * All'apertura viene mostrata la comoda panoramica settimanale a 7 colonne (Lunedì - Domenica).
   * Visualizzazione mensile allineata al pixel: ogni colonna ha identica larghezza garantendo perfetto allineamento tra intestazione giorni e celle.

3. **Invio Calendario via Email**:
   * Pulsante dedicato **`✉️ Invia per Email`** nella barra degli strumenti.
   * Compila automaticamente il riepilogo testuale completo degli interventi visibili nel periodo selezionato.
   * Selezione rapida email tecnici o digitazione libera (con memorizzazione dell'ultimo indirizzo inserito).
   * Invio tramite client di posta predefinito (Outlook, Thunderbird, Mail, Gmail), copia del testo negli appunti e salvataggio PDF allegabile.

4. **Stampa Professionale Ottimizzata**:
   * Cliccando sull'icona della stampante viene stampata **esattamente la visualizzazione selezionata in quel momento** (es. la vista Settimana o Mese).
   * Layout orizzontale (`landscape`), nasconde bottoni e controlli, con testata formale aziendale `ASIM Multiservices SRL`.

5. **Pill Rapidi per Tecnico**:
   * Filtra con 1 clic per vedere solo gli interventi di `@Goracci`, `@Serpolini`, o `Tutti`, con conteggio immediato.

6. **Strumenti per i Tecnici**:
   * 📍 Pulsante **Google Maps** per avviare il navigatore verso l'indirizzo del cliente.
   * 📞 Pulsante **Chiama** per telefonare direttamente con un tocco.
   * 📋 Pulsanti **Copia PDR** e **Copia Matricola**.
   * 📅 Pulsante **"Visualizza questo giorno nel calendario"**.

7. **Import ed Export**:
   * Trascina un nuovo file CSV in qualsiasi momento per importare interventi in massa.
   * Esporta in qualsiasi momento il file CSV aggiornato con tutte le modifiche.
