/**
 * ASIM Multiservices - Calendario Interventi Custom
 * Componente modulare per la gestione e visualizzazione di interventi tecnici.
 * Supporta importazione CSV (TickTick/Todoist format), filtri per tecnico, codice lavoro, ricerca e responsive design.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AsimCalendar = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Palette colori per tecnici (colori moderni e leggibili)
  const TECH_COLORS = [
    { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' }, // Blue
    { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' }, // Purple
    { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' }, // Green
    { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' }, // Orange
    { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8' }, // Pink
    { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4' }, // Teal
    { bg: '#fefce8', text: '#a16207', border: '#fef08a' }, // Amber
  ];

  // Client HTTP per Turso libSQL Database
  class TursoClient {
    constructor(url, token) {
      if (url && url.startsWith('libsql://')) {
        this.url = 'https://' + url.substring(9).replace(/\/$/, '') + '/v2/pipeline';
      } else if (url) {
        this.url = url.replace(/\/$/, '') + (url.includes('/v2/pipeline') ? '' : '/v2/pipeline');
      } else {
        this.url = '';
      }
      this.token = token || '';
    }

    isConfigured() {
      return Boolean(this.url && this.token);
    }

    async execute(sql, args = []) {
      const formattedArgs = args.map(arg => {
        if (arg === null || arg === undefined) return { type: 'null' };
        if (typeof arg === 'number') return { type: 'integer', value: String(arg) };
        return { type: 'text', value: String(arg) };
      });

      const body = {
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: sql,
              args: formattedArgs
            }
          },
          { type: 'close' }
        ]
      };

      const resp = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Turso HTTP ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      if (data.results && data.results[0] && data.results[0].response && data.results[0].response.result) {
        const res = data.results[0].response.result;
        const cols = (res.cols || []).map(c => c.name);
        const rows = (res.rows || []).map(row => {
          const obj = {};
          row.forEach((cell, i) => {
            obj[cols[i]] = cell && cell.value !== undefined ? cell.value : null;
          });
          return obj;
        });
        return { rows, affected: res.affected_row_count || 0 };
      }
      return { rows: [], affected: 0 };
    }

    async executeBatch(statements) {
      const requests = statements.map(st => ({
        type: 'execute',
        stmt: {
          sql: st.sql,
          args: (st.args || []).map(arg => {
            if (arg === null || arg === undefined) return { type: 'null' };
            if (typeof arg === 'number') return { type: 'integer', value: String(arg) };
            return { type: 'text', value: String(arg) };
          })
        }
      }));
      requests.push({ type: 'close' });

      const resp = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Turso Batch HTTP ${resp.status}: ${errText}`);
      }
      return await resp.json();
    }
  }

  class CalendarInstance {
    constructor(options = {}) {
      this.container = typeof options.container === 'string'
        ? document.querySelector(options.container)
        : options.container;

      if (!this.container) {
        console.error('[AsimCalendar] Elemento contenitore non trovato:', options.container);
        return;
      }

      // Configurazione Turso DB Edge
      const defaultTursoUrl = 'https://calendario-casual70.aws-eu-west-1.turso.io';
      const defaultTursoToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQyMzc2MDUsImlkIjoiMDFhMWMwZTUtMDkwMS03MzA1LTkyOGUtMzkzM2I0ZjMwMmE2Iiwia2lkIjoiMHlac2dnNndSaDZpdENXakpyNWJ3MHZpWlNSb1lIQzBzY0JESzZpbFhvZyIsInJpZCI6ImJhNGI4Y2ZmLTQ3YTYtNDViNS04NzBkLTg3YTA3OWNlZWYxNCJ9.aZIaEC5u5apP087dGt5kcRZjmrbfezIltsy0ZphIf24p8yaAQmfCKPBcRq9gVN7MhnVJJuEPYaCVGYeuT4VzAw';

      this.turso = new TursoClient(
        options.tursoUrl || localStorage.getItem('asim_turso_url') || defaultTursoUrl,
        options.tursoToken || localStorage.getItem('asim_turso_token') || defaultTursoToken
      );

      this.apiUrl = options.apiUrl || 'api.php';
      this.defaultCsvUrl = options.defaultCsvUrl || 'sample.csv';
      this.storageKey = options.storageKey || 'asim_calendar_events_v1';
      this.events = [];
      this.currentView = options.defaultView || 'week'; // 'week', 'month', 'day', 'list'
      this.selectedDate = new Date();
      this.activeTechnician = 'all';
      this.activeJobCode = 'all';
      this.searchQuery = '';
      this.referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
      this.technicians = new Set();
      this.jobCodes = new Set();
      this.techColorMap = new Map();
      this._lastTursoSignature = '';

      this.init();
    }

    async init() {
      this.renderSkeleton();
      this.bindEvents();
      await this.loadInitialData();
    }

    // Assicura l'esistenza della colonna duration su Turso DB
    async ensureTursoSchema() {
      if (!this.turso.isConfigured()) return;
      try {
        await this.turso.execute('ALTER TABLE appointments ADD COLUMN duration REAL DEFAULT 1;');
      } catch (e) {
        // Ignora se la colonna esiste già
      }
    }

    // Calcola l'orario di fine a partire da start ("HH:MM") e durata in ore (es. 1, 1.5, 2)
    calculateEndTime(startTime, durationHours) {
      if (!startTime || !startTime.includes(':')) return '';
      const parts = startTime.split(':');
      const startH = parseInt(parts[0], 10) || 0;
      const startM = parseInt(parts[1], 10) || 0;
      const dur = parseFloat(durationHours) || 1;
      const totalMinutes = startH * 60 + startM + Math.round(dur * 60);
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endM = totalMinutes % 60;
      return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }

    // Formatta la durata per la visualizzazione utente (es. "1 ora", "2 ore", "30 min", "1h 30m")
    formatDuration(durationHours) {
      const d = parseFloat(durationHours) || 1;
      if (d === 1) return '1 ora';
      if (d === 0.5) return '30 min';
      if (d === 1.5) return '1h 30m';
      if (d === 2) return '2 ore';
      if (d % 1 === 0) return `${d} ore`;
      const h = Math.floor(d);
      const m = Math.round((d - h) * 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    // Calcola l'altezza visiva proporzionale per occupare lo spazio nella colonna
    calculateCardHeight(durationHours) {
      const d = parseFloat(durationHours) || 1;
      return Math.max(68, Math.round(d * 85));
    }

    // Verifica se un orario si sovrappone a un altro evento per lo stesso tecnico
    findOverlappingEvent(date, time, durationHours, technician, excludeId = null) {
      if (!technician || technician === 'Non assegnato' || !time || !date) return null;
      const dur = parseFloat(durationHours) || 1;
      const partsA = time.split(':');
      const startA = (parseInt(partsA[0], 10) || 0) * 60 + (parseInt(partsA[1], 10) || 0);
      const endA = startA + Math.round(dur * 60);

      return this.events.find(ev => {
        if (excludeId && ev.id === excludeId) return false;
        if (ev.date !== date) return false;
        if ((ev.technician || '').toLowerCase() !== technician.toLowerCase()) return false;
        if (!ev.time) return false;

        const partsB = ev.time.split(':');
        const startB = (parseInt(partsB[0], 10) || 0) * 60 + (parseInt(partsB[1], 10) || 0);
        const endB = startB + Math.round((parseFloat(ev.duration) || 1) * 60);

        return (startA < endB && endA > startB);
      }) || null;
    }

    // Aggiorna la preview dell'occupazione oraria nel form modale
    updateOccupyPreview() {
      const root = this.container;
      const timeInput = root.querySelector('#edit-time');
      const durInput = root.querySelector('#edit-duration');
      const dateInput = root.querySelector('#edit-date');
      const techInput = root.querySelector('#edit-tech');
      const startEl = root.querySelector('#preview-start-time');
      const endEl = root.querySelector('#preview-end-time');
      const badgeEl = root.querySelector('#preview-duration-badge');
      const conflictAlert = root.querySelector('#edit-conflict-alert');
      const conflictMsg = root.querySelector('#conflict-message');

      if (!timeInput || !durInput || !startEl || !endEl || !badgeEl) return;

      const time = timeInput.value || '09:00';
      const dur = parseFloat(durInput.value) || 1;
      const endTime = this.calculateEndTime(time, dur);
      const durLabel = this.formatDuration(dur);

      startEl.textContent = time;
      endEl.textContent = endTime;
      badgeEl.textContent = `⏱️ ${durLabel}`;

      root.querySelectorAll('.asim-btn-duration-pill').forEach(pill => {
        if (parseFloat(pill.dataset.hours) === dur) {
          pill.classList.add('is-active');
        } else {
          pill.classList.remove('is-active');
        }
      });

      if (conflictAlert && conflictMsg) {
        const curId = this.currentModalEvent ? this.currentModalEvent.id : null;
        const date = dateInput ? dateInput.value : '';
        const tech = techInput ? techInput.value.trim() : '';
        const conflict = this.findOverlappingEvent(date, time, dur, tech, curId);
        if (conflict) {
          const cDur = parseFloat(conflict.duration) || 1;
          const cEnd = this.calculateEndTime(conflict.time, cDur);
          conflictMsg.textContent = `@${conflict.technician} risulta già occupato dalle ${conflict.time} alle ${cEnd} con "${conflict.clientName}".`;
          conflictAlert.style.display = 'block';
        } else {
          conflictAlert.style.display = 'none';
        }
      }
    }

    // Costruisce la struttura HTML del calendario
    renderSkeleton() {
      this.container.innerHTML = `
        <div class="asim-cal">
          <!-- Intestazione esclusiva per la STAMPA -->
          <div class="asim-print-header">
            <div class="asim-print-brand">
              <h2 class="asim-print-company">ASIM Multiservices SRL</h2>
              <span class="asim-print-tagline">Pianificazione e Gestione Interventi Tecnici</span>
            </div>
            <div class="asim-print-meta">
              <div class="asim-print-view-title" id="asim-print-view-title">Settimana</div>
              <div class="asim-print-filter-info" id="asim-print-filter-info">Tutti gli interventi</div>
            </div>
          </div>

          <!-- Top Toolbar -->
          <div class="asim-cal-toolbar">
            <div class="asim-cal-branding">
              <div class="asim-cal-logo">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <div>
                <h2 class="asim-cal-title">Calendario Interventi</h2>
                <span class="asim-cal-subtitle">ASIM Multiservices</span>
              </div>
              <div class="asim-badge-turso" id="asim-turso-badge" title="Database Turso SQLite Cloud sincronizzato in tempo reale">
                <span class="asim-dot-live"></span>
                <span id="asim-turso-text">Turso Cloud Live</span>
              </div>
            </div>

            <!-- Azioni Rapide (Nuovo Intervento, Invia Email, Import, Demo, Stampa, Esporta) -->
            <div class="asim-cal-actions">
              <button class="asim-btn asim-btn-primary" id="asim-btn-add" title="Aggiungi nuovo intervento">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>+ Nuovo Intervento</span>
              </button>

              <button class="asim-btn asim-btn-outline" id="asim-btn-email" title="Invia il calendario visualizzato ad un indirizzo email">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>Invia per Email</span>
              </button>

              <label class="asim-btn asim-btn-outline" title="Carica file CSV esportato">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Importa CSV</span>
                <input type="file" id="asim-file-input" accept=".csv,text/csv" style="display:none;">
              </label>

              <button class="asim-btn asim-btn-outline" id="asim-btn-demo" title="Carica file di prova">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span>Carica Demo</span>
              </button>

              <button class="asim-btn asim-btn-icon" id="asim-btn-print" title="Stampa o Salva PDF">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
              </button>

              <button class="asim-btn asim-btn-icon" id="asim-btn-export" title="Esporta CSV interventi visibili">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>

              <button class="asim-btn asim-btn-icon asim-btn-danger" id="asim-btn-clear" title="Svuota calendario">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Filtri e Ricerca -->
          <div class="asim-cal-filters">
            <!-- Barra di Ricerca -->
            <div class="asim-search-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="asim-search-input" placeholder="Cerca per cliente, indirizzo, PDR, matricola, tel...">
              <button class="asim-search-clear" id="asim-search-clear" style="display:none;">&times;</button>
            </div>

            <!-- Filtro Tecnico -->
            <div class="asim-filter-group">
              <label for="asim-filter-tech">Tecnico:</label>
              <select id="asim-filter-tech" class="asim-select">
                <option value="all">Tutti i tecnici</option>
              </select>
            </div>

            <!-- Filtro Codice Intervento -->
            <div class="asim-filter-group">
              <label for="asim-filter-code">Codice:</label>
              <select id="asim-filter-code" class="asim-select">
                <option value="all">Tutti i codici</option>
              </select>
            </div>

            <!-- Contatore -->
            <div class="asim-counter-badge" id="asim-counter-badge">
              0 interventi
            </div>
          </div>

          <!-- Barra Pill Rapidi Tecnici -->
          <div class="asim-tech-pills-bar" id="asim-tech-pills"></div>

          <!-- Navigazione Data e Selezione Vista -->
          <div class="asim-cal-nav-bar">
            <div class="asim-nav-buttons">
              <button class="asim-btn asim-btn-sm" id="asim-nav-prev">&larr; Prec</button>
              <button class="asim-btn asim-btn-sm asim-btn-outline" id="asim-nav-today">Oggi</button>
              <button class="asim-btn asim-btn-sm" id="asim-nav-next">Succ &rarr;</button>
              <span class="asim-nav-current-label" id="asim-nav-label">Novembre 2026</span>
            </div>

            <div class="asim-view-buttons">
              <button class="asim-view-btn ${this.currentView === 'month' ? 'active' : ''}" data-view="month">Mese</button>
              <button class="asim-view-btn ${this.currentView === 'week' ? 'active' : ''}" data-view="week">Settimana</button>
              <button class="asim-view-btn ${this.currentView === 'day' ? 'active' : ''}" data-view="day">Giorno</button>
              <button class="asim-view-btn ${this.currentView === 'list' ? 'active' : ''}" data-view="list">Elenco</button>
            </div>
          </div>

          <!-- Area Calendario / Viste -->
          <div class="asim-cal-body" id="asim-cal-body">
            <!-- Render dinamico vista -->
          </div>

          <!-- Dropzone Overlay (visibile durante drag and drop) -->
          <div class="asim-dropzone-overlay" id="asim-dropzone">
            <div class="asim-dropzone-content">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <h3>Trascina qui il file CSV</h3>
              <p>Rilascia il file per importare gli appuntamenti</p>
            </div>
          </div>

          <!-- Modale Dettaglio Intervento & Modifica -->
          <div class="asim-modal-overlay" id="asim-modal" style="display:none;">
            <div class="asim-modal-card">
              <div class="asim-modal-header">
                <div id="modal-header-badges" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span class="asim-badge asim-badge-code" id="modal-code">C03</span>
                  <span class="asim-badge asim-badge-tech" id="modal-tech">@Goracci</span>
                  <span class="asim-badge asim-badge-priority" id="modal-priority">Priorità 3</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
                  <button class="asim-btn asim-btn-xs asim-btn-outline" id="modal-btn-edit" title="Modifica dettagli intervento">
                    ✏️ Modifica
                  </button>
                  <button class="asim-btn asim-btn-xs asim-btn-danger" id="modal-btn-delete-view" title="Elimina definitivamente questo intervento">
                    🗑️ Elimina
                  </button>
                  <button class="asim-modal-close" id="modal-close">&times;</button>
                </div>
              </div>

              <!-- CONTENITORE VISTA (Sola Lettura) -->
              <div id="modal-view-mode">
                <h2 class="asim-modal-title" id="modal-title">NOME CLIENTE</h2>
                <div class="asim-modal-datetime" id="modal-datetime" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span id="modal-date-text">Lunedì 9 Novembre 2026 alle 09:30</span>
                  <span class="asim-occupy-badge" id="modal-duration-badge">⏱️ 1 ora</span>
                </div>

                <div class="asim-modal-body">
                  <!-- Indirizzo -->
                  <div class="asim-detail-row" id="modal-addr-row">
                    <div class="asim-detail-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                    </div>
                    <div class="asim-detail-content">
                      <label>Indirizzo</label>
                      <div class="asim-detail-value" id="modal-address">-</div>
                      <a href="#" target="_blank" class="asim-btn asim-btn-xs asim-btn-maps" id="modal-maps-link">
                        <span>📍 Apri in Google Maps</span>
                      </a>
                    </div>
                  </div>

                  <!-- Telefono -->
                  <div class="asim-detail-row" id="modal-tel-row">
                    <div class="asim-detail-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                    </div>
                    <div class="asim-detail-content">
                      <label>Telefono</label>
                      <div class="asim-detail-value" id="modal-phone">-</div>
                      <a href="#" class="asim-btn asim-btn-xs asim-btn-call" id="modal-phone-link">
                        <span>📞 Chiama Cliente</span>
                      </a>
                    </div>
                  </div>

                  <!-- Dati Tecnici: PDR e Matricola -->
                  <div class="asim-detail-grid">
                    <div class="asim-detail-card">
                      <label>PDR</label>
                      <div class="asim-code-box">
                        <code id="modal-pdr">-</code>
                        <button class="asim-btn-copy" data-target="modal-pdr" title="Copia PDR">📋</button>
                      </div>
                    </div>
                    <div class="asim-detail-card">
                      <label>Matricola</label>
                      <div class="asim-code-box">
                        <code id="modal-matricola">-</code>
                        <button class="asim-btn-copy" data-target="modal-matricola" title="Copia Matricola">📋</button>
                      </div>
                    </div>
                  </div>

                  <!-- Note -->
                  <div class="asim-detail-row" id="modal-notes-row">
                    <div class="asim-detail-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </div>
                    <div class="asim-detail-content">
                      <label>Note / Dettagli</label>
                      <div class="asim-notes-box" id="modal-notes">Nessuna nota aggiuntiva</div>
                    </div>
                  </div>

                  <!-- Assegnazione / Autore -->
                  <div class="asim-modal-meta">
                    <span>Assegnato da: <strong id="modal-author">-</strong></span>
                    <span id="modal-raw-date"></span>
                  </div>

                  <!-- Naviga a questa data nel calendario -->
                  <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                    <button class="asim-btn asim-btn-sm asim-btn-outline" id="modal-goto-date">
                      📅 Visualizza questo giorno nel calendario
                    </button>
                  </div>
                </div>
              </div>

              <!-- CONTENITORE MODIFICA (Form Editabile) -->
              <div id="modal-edit-mode" style="display:none;">
                <h3 style="margin: 0 0 16px 0; font-size: 1.15rem; color: var(--asim-gray-900);">✏️ Modifica Intervento</h3>
                <form id="asim-edit-form" class="asim-form-grid">
                  <div class="asim-form-group full-width">
                    <label>Cliente / Titolo *</label>
                    <input type="text" id="edit-client" class="asim-form-input" required>
                  </div>

                  <div class="asim-form-group">
                    <label>Data Intervento *</label>
                    <input type="date" id="edit-date" class="asim-form-input" required>
                  </div>

                  <div class="asim-form-group">
                    <label>Orario Inizio *</label>
                    <input type="time" id="edit-time" class="asim-form-input" required>
                  </div>

                  <div class="asim-form-group">
                    <label>Durata Intervento *</label>
                    <div style="display:flex; gap:6px; align-items:center;">
                      <input type="number" id="edit-duration" class="asim-form-input" min="0.5" max="12" step="0.5" value="1" required style="width: 85px;">
                      <span style="font-size:0.85rem; color:var(--asim-gray-600); font-weight:600;">ore</span>
                    </div>
                    <div class="asim-duration-pills" style="display:flex; gap:4px; margin-top:5px; flex-wrap:wrap;">
                      <button type="button" class="asim-btn-duration-pill" data-hours="0.5">30m</button>
                      <button type="button" class="asim-btn-duration-pill is-active" data-hours="1">1h</button>
                      <button type="button" class="asim-btn-duration-pill" data-hours="1.5">1h30</button>
                      <button type="button" class="asim-btn-duration-pill" data-hours="2">2h</button>
                      <button type="button" class="asim-btn-duration-pill" data-hours="3">3h</button>
                      <button type="button" class="asim-btn-duration-pill" data-hours="4">4h</button>
                    </div>
                  </div>

                  <div class="asim-form-group full-width asim-occupy-preview-box" id="edit-occupy-preview" style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:8px 12px; margin-top:-6px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; color:#0369a1; flex-wrap:wrap; gap:6px;">
                      <span>⏰ <strong>Fascia occupata:</strong> dalle <strong id="preview-start-time">09:30</strong> alle <strong id="preview-end-time">10:30</strong></span>
                      <span class="asim-occupy-badge" id="preview-duration-badge">⏱️ 1 ora</span>
                    </div>
                    <div id="edit-conflict-alert" style="display:none; margin-top:6px; padding:6px 8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:4px; color:#9f1239; font-size:0.8rem;">
                      ⚠️ <strong>Attenzione sovrapposizione:</strong> <span id="conflict-message"></span>
                    </div>
                  </div>

                  <div class="asim-form-group">
                    <label>Tecnico Assegnato</label>
                    <input type="text" id="edit-tech" class="asim-form-input" list="edit-tech-datalist" placeholder="es. Goracci">
                    <datalist id="edit-tech-datalist"></datalist>
                  </div>

                  <div class="asim-form-group">
                    <label>Codice Intervento</label>
                    <input type="text" id="edit-code" class="asim-form-input" placeholder="es. C03, A01, D01">
                  </div>

                  <div class="asim-form-group full-width">
                    <label>Indirizzo Completo</label>
                    <input type="text" id="edit-address" class="asim-form-input" placeholder="Via, Piazza, Civico, Città">
                  </div>

                  <div class="asim-form-group">
                    <label>Telefono</label>
                    <input type="text" id="edit-phone" class="asim-form-input" placeholder="es. 3405050301">
                  </div>

                  <div class="asim-form-group">
                    <label>Priorità</label>
                    <select id="edit-priority" class="asim-form-input">
                      <option value="1">1 - Bassa</option>
                      <option value="2">2 - Normale</option>
                      <option value="3">3 - Media</option>
                      <option value="4">4 - Alta / Urgente</option>
                    </select>
                  </div>

                  <div class="asim-form-group">
                    <label>PDR</label>
                    <input type="text" id="edit-pdr" class="asim-form-input" placeholder="es. 11714040220001">
                  </div>

                  <div class="asim-form-group">
                    <label>Matricola</label>
                    <input type="text" id="edit-matricola" class="asim-form-input" placeholder="es. 5238698">
                  </div>

                  <div class="asim-form-group full-width">
                    <label>Note e Dettagli</label>
                    <textarea id="edit-notes" class="asim-form-input" rows="3" placeholder="Eventuali note..."></textarea>
                  </div>

                  <div class="asim-form-actions full-width">
                    <button type="button" class="asim-btn asim-btn-danger" id="edit-btn-delete">
                      🗑️ Elimina
                    </button>
                    <div style="display:flex; gap:8px;">
                      <button type="button" class="asim-btn asim-btn-outline" id="edit-btn-cancel">
                        Annulla
                      </button>
                      <button type="submit" class="asim-btn asim-btn-primary" id="edit-btn-save">
                        💾 Salva Modifiche
                      </button>
                    </div>
                  </div>
                </form>
              </div>

            </div>
          </div>

          <!-- Modale Invio Email Calendario -->
          <div class="asim-modal-overlay" id="asim-email-modal" style="display:none;">
            <div class="asim-modal-card asim-modal-card-lg">
              <div class="asim-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 1.25rem;">✉️</span>
                  <h3 style="margin: 0; font-size: 1.15rem; color: var(--asim-gray-900);">Invia Calendario via Email</h3>
                </div>
                <button class="asim-modal-close" id="email-modal-close">&times;</button>
              </div>

              <div class="asim-modal-body" style="padding-top: 8px;">
                <div class="asim-email-context-banner" id="email-context-banner">
                  <strong id="email-view-label">Settimana</strong>
                  <span id="email-view-count">0 interventi</span>
                </div>

                <form id="asim-email-form" class="asim-form-grid" style="margin-top: 14px;">
                  <div class="asim-form-group full-width">
                    <label for="email-to">Destinatario (Email) *</label>
                    <div style="display: flex; gap: 8px;">
                      <input type="email" id="email-to" class="asim-form-input" placeholder="es. tecnico@asimultiservices.com o cliente" required>
                      <select id="email-quick-presets" class="asim-form-input" style="width: auto; max-width: 190px;">
                        <option value="">Destinatario rapido...</option>
                      </select>
                    </div>
                  </div>

                  <div class="asim-form-group full-width">
                    <label for="email-subject">Oggetto Email *</label>
                    <input type="text" id="email-subject" class="asim-form-input" required>
                  </div>

                  <div class="asim-form-group full-width">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <label for="email-body">Riepilogo Interventi (Corpo Messaggio)</label>
                      <button type="button" class="asim-btn asim-btn-xs asim-btn-outline" id="email-btn-copy-body" title="Copia riepilogo negli appunti (formattato per Outlook/Gmail)">
                        📋 Copia Riepilogo
                      </button>
                    </div>
                    <textarea id="email-body" class="asim-form-input" rows="11" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 0.85rem; line-height: 1.55; white-space: pre-wrap; background-color: #fbfcfd;"></textarea>
                    <small style="color: var(--asim-gray-500); font-size: 0.75rem; margin-top: 4px;">
                      💡 Cliccando su <strong>"Apri nel Client Email"</strong> viene caricato il testo strutturato; con <strong>"Copia Riepilogo"</strong> puoi anche incollare (Ctrl+V) la tabella a colori direttamente in Outlook o Gmail.
                    </small>
                  </div>

                  <div class="asim-form-actions full-width" style="margin-top: 14px;">
                    <button type="button" class="asim-btn asim-btn-outline" id="email-btn-print-pdf" title="Stampa o salva come PDF da allegare all'email">
                      📄 Salva PDF da allegare
                    </button>
                    <div style="display: flex; gap: 8px;">
                      <button type="button" class="asim-btn asim-btn-outline" id="email-btn-cancel">
                        Chiudi
                      </button>
                      <button type="submit" class="asim-btn asim-btn-primary" id="email-btn-send">
                        ✉️ Apri nel Client Email
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <!-- Toast Notification -->
          <div class="asim-toast" id="asim-toast" style="display:none;"></div>
        </div>
      `;
    }

    // Associa tutti i gestori di eventi
    bindEvents() {
      const root = this.container;

      // File input CSV
      const fileInput = root.querySelector('#asim-file-input');
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileUpload(e.target.files[0]);
        }
      });

      // Bottone Demo
      root.querySelector('#asim-btn-demo').addEventListener('click', () => {
        this.loadSampleData();
      });

      // Bottone Nuovo Intervento
      root.querySelector('#asim-btn-add').addEventListener('click', () => {
        this.openCreateMode();
      });

      // Bottone Stampa
      root.querySelector('#asim-btn-print').addEventListener('click', () => {
        window.print();
      });

      // Bottone Esporta CSV
      root.querySelector('#asim-btn-export').addEventListener('click', () => {
        this.exportCSV();
      });

      // Bottone Svuota
      root.querySelector('#asim-btn-clear').addEventListener('click', () => {
        if (confirm('Sei sicuro di voler svuotare tutti gli eventi dal calendario?')) {
          this.clearData();
        }
      });

      // Ricerca
      const searchInput = root.querySelector('#asim-search-input');
      const searchClear = root.querySelector('#asim-search-clear');
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        searchClear.style.display = this.searchQuery ? 'block' : 'none';
        this.renderView();
      });
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.style.display = 'none';
        this.renderView();
      });

      // Filtro Tecnico
      root.querySelector('#asim-filter-tech').addEventListener('change', (e) => {
        this.activeTechnician = e.target.value;
        this.renderView();
      });

      // Filtro Codice
      root.querySelector('#asim-filter-code').addEventListener('change', (e) => {
        this.activeJobCode = e.target.value;
        this.renderView();
      });

      // Navigazione Data
      root.querySelector('#asim-nav-prev').addEventListener('click', () => this.navigateDate(-1));
      root.querySelector('#asim-nav-next').addEventListener('click', () => this.navigateDate(1));
      root.querySelector('#asim-nav-today').addEventListener('click', () => {
        this.selectedDate = new Date();
        this.renderView();
      });

      // Cambio Vista
      root.querySelectorAll('.asim-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          root.querySelectorAll('.asim-view-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentView = btn.dataset.view;
          this.renderView();
        });
      });

      // Drag and Drop CSV
      const dropzone = root.querySelector('#asim-dropzone');
      ['dragenter', 'dragover'].forEach(eventName => {
        root.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('visible');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        root.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.type === 'drop' || (e.relatedTarget && !root.contains(e.relatedTarget))) {
            dropzone.classList.remove('visible');
          }
        });
      });

      root.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('visible');
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
          this.handleFileUpload(files[0]);
        }
      });

      // Chiusura Modale
      const modal = root.querySelector('#asim-modal');
      root.querySelector('#modal-close').addEventListener('click', () => {
        modal.style.display = 'none';
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });

      // Naviga alla data dell'evento selezionato
      root.querySelector('#modal-goto-date').addEventListener('click', () => {
        if (this.currentModalEvent && this.currentModalEvent.date) {
          const parts = this.currentModalEvent.date.split('-');
          this.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          this.currentView = 'day';
          root.querySelectorAll('.asim-view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === 'day');
          });
          modal.style.display = 'none';
          this.renderView();
        }
      });

      // Switch a modalità Modifica
      root.querySelector('#modal-btn-edit').addEventListener('click', () => {
        if (!this.currentModalEvent) return;
        this.openEditMode(this.currentModalEvent);
      });

      // Annulla Modifica
      root.querySelector('#edit-btn-cancel').addEventListener('click', () => {
        root.querySelector('#modal-edit-mode').style.display = 'none';
        root.querySelector('#modal-view-mode').style.display = 'block';
        root.querySelector('#modal-btn-edit').style.display = 'inline-block';
        if (!this.currentModalEvent) {
          modal.style.display = 'none';
        } else {
          root.querySelector('#modal-edit-mode').style.display = 'none';
          root.querySelector('#modal-view-mode').style.display = 'block';
          root.querySelector('#modal-btn-edit').style.display = 'inline-flex';
          root.querySelector('#modal-btn-delete-view').style.display = 'inline-flex';
        }
      });

      // Aggiornamento dinamico anteprima orario occupato e pillole durata
      ['#edit-time', '#edit-duration', '#edit-date', '#edit-tech'].forEach(sel => {
        const input = root.querySelector(sel);
        if (input) {
          input.addEventListener('input', () => this.updateOccupyPreview());
          input.addEventListener('change', () => this.updateOccupyPreview());
        }
      });

      root.querySelectorAll('.asim-btn-duration-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
          e.preventDefault();
          const durInput = root.querySelector('#edit-duration');
          if (durInput) {
            durInput.value = pill.dataset.hours;
            this.updateOccupyPreview();
          }
        });
      });

      // Salva Modifiche Form (Salvataggio Permanente nel Cloud Turso)
      root.querySelector('#asim-edit-form').addEventListener('submit', (e) => {
        e.preventDefault();

        if (!this.currentModalEvent) {
          // Creazione Nuovo Intervento
          const newEv = {
            id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            clientName: root.querySelector('#edit-client').value.trim(),
            date: root.querySelector('#edit-date').value,
            time: root.querySelector('#edit-time').value,
            duration: parseFloat(root.querySelector('#edit-duration').value) || 1,
            technician: root.querySelector('#edit-tech').value.trim() || 'Non assegnato',
            jobCode: root.querySelector('#edit-code').value.trim() || 'Altro',
            indirizzo: root.querySelector('#edit-address').value.trim(),
            telefono: root.querySelector('#edit-phone').value.trim(),
            priority: parseInt(root.querySelector('#edit-priority').value, 10) || 1,
            pdr: root.querySelector('#edit-pdr').value.trim(),
            matricola: root.querySelector('#edit-matricola').value.trim(),
            note: root.querySelector('#edit-notes').value.trim(),
            author: 'Operatore CRM',
            rawDate: ''
          };
          const dateParts = newEv.date.split('-');
          const timeParts = newEv.time.split(':');
          newEv.dateTime = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), parseInt(timeParts[0] || 9), parseInt(timeParts[1] || 0));

          this.events.push(newEv);
          this.saveEventsPermanently(newEv, 'upsert');
          this.updateFilters();
          this.renderView();
          this.showToast('Nuovo intervento salvato nel cloud Turso!', 'success');
          this.openModal(newEv);
          return;
        }

        const ev = this.currentModalEvent;
        ev.clientName = root.querySelector('#edit-client').value.trim();
        ev.date = root.querySelector('#edit-date').value;
        ev.time = root.querySelector('#edit-time').value;
        ev.duration = parseFloat(root.querySelector('#edit-duration').value) || 1;
        ev.technician = root.querySelector('#edit-tech').value.trim() || 'Non assegnato';
        ev.jobCode = root.querySelector('#edit-code').value.trim() || 'Altro';
        ev.indirizzo = root.querySelector('#edit-address').value.trim();
        ev.telefono = root.querySelector('#edit-phone').value.trim();
        ev.priority = parseInt(root.querySelector('#edit-priority').value, 10) || 1;
        ev.pdr = root.querySelector('#edit-pdr').value.trim();
        ev.matricola = root.querySelector('#edit-matricola').value.trim();
        ev.note = root.querySelector('#edit-notes').value.trim();

        const dateParts = ev.date.split('-');
        const timeParts = ev.time.split(':');
        ev.dateTime = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), parseInt(timeParts[0] || 9), parseInt(timeParts[1] || 0));

        this.saveEventsPermanently(ev, 'upsert');
        this.updateFilters();
        this.renderView();
        this.showToast('Intervento aggiornato nel cloud Turso!', 'success');
        this.openModal(ev);
      });

      // Elimina Intervento (gestore comune per vista ed edit)
      const handleDeleteEvent = () => {
        if (!this.currentModalEvent) return;
        const targetEv = this.currentModalEvent;
        if (confirm(`Sei sicuro di voler eliminare definitivamente l'intervento di "${targetEv.clientName}"?`)) {
          this.events = this.events.filter(x => x.id !== targetEv.id);
          this.saveEventsPermanently(targetEv, 'delete');
          modal.style.display = 'none';
          this.updateFilters();
          this.renderView();
          this.showToast('Intervento eliminato dal database.', 'info');
        }
      };

      root.querySelector('#edit-btn-delete').addEventListener('click', handleDeleteEvent);
      root.querySelector('#modal-btn-delete-view').addEventListener('click', handleDeleteEvent);

      // Gestione Modale Email Calendario
      const btnEmail = root.querySelector('#asim-btn-email');
      if (btnEmail) {
        btnEmail.addEventListener('click', () => {
          this.openEmailModal();
        });
      }

      const emailModal = root.querySelector('#asim-email-modal');
      const emailClose = root.querySelector('#email-modal-close');
      const emailCancel = root.querySelector('#email-btn-cancel');
      if (emailClose) emailClose.addEventListener('click', () => { emailModal.style.display = 'none'; });
      if (emailCancel) emailCancel.addEventListener('click', () => { emailModal.style.display = 'none'; });

      const emailPresets = root.querySelector('#email-quick-presets');
      if (emailPresets) {
        emailPresets.addEventListener('change', () => {
          if (emailPresets.value) {
            root.querySelector('#email-to').value = emailPresets.value;
          }
        });
      }

      const btnCopyBody = root.querySelector('#email-btn-copy-body');
      if (btnCopyBody) {
        btnCopyBody.addEventListener('click', () => {
          const text = root.querySelector('#email-body').value;
          const html = this._lastGeneratedEmailHtml || text;
          if (text) {
            const doCopy = (navigator.clipboard && window.ClipboardItem)
              ? navigator.clipboard.write([
                  new ClipboardItem({
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                    'text/html': new Blob([html], { type: 'text/html' })
                  })
                ])
              : navigator.clipboard.writeText(text);

            doCopy.then(() => {
              this.showToast('Riepilogo copiato negli appunti! (Pronto per incolla formattato)', 'success');
              const old = btnCopyBody.textContent;
              btnCopyBody.textContent = '✓ Copiato!';
              setTimeout(() => { btnCopyBody.textContent = old; }, 2000);
            }).catch(() => {
              navigator.clipboard.writeText(text);
              this.showToast('Testo copiato negli appunti!', 'success');
            });
          }
        });
      }

      const btnPrintPdf = root.querySelector('#email-btn-print-pdf');
      if (btnPrintPdf) {
        btnPrintPdf.addEventListener('click', () => {
          window.print();
        });
      }

      const emailForm = root.querySelector('#asim-email-form');
      if (emailForm) {
        emailForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const to = root.querySelector('#email-to').value.trim();
          const subject = root.querySelector('#email-subject').value.trim();
          const body = root.querySelector('#email-body').value;

          if (!to) {
            this.showToast('Inserisci un indirizzo email valido', 'error');
            return;
          }

          try {
            localStorage.setItem('asim_last_email_to', to);
          } catch (err) {}

          // Copia sia testo pulito che HTML formattato negli appunti per incolla ricco immediato
          const html = this._lastGeneratedEmailHtml || body;
          try {
            if (navigator.clipboard && window.ClipboardItem) {
              navigator.clipboard.write([
                new ClipboardItem({
                  'text/plain': new Blob([body], { type: 'text/plain' }),
                  'text/html': new Blob([html], { type: 'text/html' })
                })
              ]).catch(() => { navigator.clipboard.writeText(body); });
            } else {
              navigator.clipboard.writeText(body);
            }
          } catch (err) {}

          const mailtoUri = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.location.href = mailtoUri;

          this.showToast('Client email aperto! Testo formattato copiato anche negli appunti.', 'success');

          if (this.apiUrl && this.apiUrl !== '') {
            fetch(this.apiUrl + '?action=send_email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: to, subject: subject, body: body, html: html })
            }).catch(() => {});
          }

          setTimeout(() => {
            emailModal.style.display = 'none';
          }, 800);
        });
      }

      // Pulsanti Copia PDR/Matricola
      root.querySelectorAll('.asim-btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          const text = root.querySelector('#' + targetId).innerText;
          if (text && text !== '-') {
            navigator.clipboard.writeText(text).then(() => {
              const old = btn.innerText;
              btn.innerText = '✓';
              setTimeout(() => btn.innerText = old, 1500);
            });
          }
        });
      });
    }

    // Carica dati iniziali da Turso DB (o fallback locale)
    async loadInitialData() {
      // 1. Prova da Turso Cloud Database
      if (this.turso.isConfigured()) {
        this.updateTursoBadge('syncing');
        try {
          await this.ensureTursoSchema();
          const res = await this.turso.execute('SELECT * FROM appointments ORDER BY date ASC, time ASC;');
          if (res.rows && res.rows.length > 0) {
            this.events = this.mapTursoRowsToEvents(res.rows);
            try { localStorage.setItem(this.storageKey, JSON.stringify(this.events)); } catch (e) {}
            this.updateTursoBadge('online');
            this.updateFilters();
            this.renderView();
            this.startTursoPolling();
            return;
          }
        } catch (err) {
          console.warn('[AsimCalendar] Connessione Turso DB fallita:', err);
          this.updateTursoBadge('error');
        }
      }

      // 2. Prova da backend API PHP
      try {
        const response = await fetch(this.apiUrl + '?action=get', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data && data.status === 'ok' && Array.isArray(data.events) && data.events.length > 0) {
            this.setEvents(data.events);
            this.startTursoPolling();
            return;
          }
        }
      } catch (err) {}

      // 3. Prova da LocalStorage
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        try {
          const events = JSON.parse(stored);
          if (Array.isArray(events) && events.length > 0) {
            this.events = events;
            this.updateFilters();
            this.renderView();
            this.startTursoPolling();
            return;
          }
        } catch (e) {}
      }

      // 4. Fallback per GitHub Pages o primo avvio: carica file CSV di default (sample.csv)
      try {
        const sampleResp = await fetch(this.defaultCsvUrl, { cache: 'no-cache' });
        if (sampleResp.ok) {
          const csvText = await sampleResp.text();
          if (csvText && csvText.includes('task,')) {
            const parsed = this.parseCSV(csvText);
            if (parsed && parsed.length > 0) {
              this.setEvents(parsed);
              this.batchImportToTurso(parsed);
              this.startTursoPolling();
              return;
            }
          }
        }
      } catch (e) {}

      this.renderView();
      this.startTursoPolling();
    }

    // Gestione caricamento file CSV
    handleFileUpload(file) {
      if (!file.name.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
        this.showToast('Seleziona un file CSV valido!', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvContent = e.target.result;
        const parsedEvents = this.parseCSV(csvContent);

        if (!parsedEvents || parsedEvents.length === 0) {
          this.showToast('Nessun intervento valido trovato nel file CSV.', 'error');
          return;
        }

        this.setEvents(parsedEvents);

        // Salva in batch su Turso DB
        if (this.turso.isConfigured()) {
          await this.batchImportToTurso(parsedEvents);
        }

        // Prova a sincronizzare su server PHP se presente
        try {
          const formData = new FormData();
          formData.append('csv_file', file);
          await fetch(this.apiUrl + '?action=upload', {
            method: 'POST',
            body: formData
          });
        } catch (err) {}

        this.showToast(`Importati ${parsedEvents.length} interventi su Turso DB!`, 'success');
      };
      reader.readAsText(file, 'UTF-8');
    }

    // Carica dati demo di esempio
    loadSampleData() {
      const sampleCSV = `TYPE,CONTENT,DESCRIPTION,CALENDAR_LAYOUT,CALENDAR_VISIBLE_DAY_COUNT,CALENDAR_COLOR,ICON,IS_COLLAPSED,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG,REMINDER_TYPE,REMINDER_OFFSET,REMINDER_DATE,REMINDER_DATE_LANG
meta,view_style=calendar,,MONTH,,,,,,,,,,,,,,,,,,,
task,GOODWIN LUKE BERNARD C03 @Goracci,"PDR: 11714040220001\\nMatricola : 5238698\\nTecnico: Goracci\\nIndirizzo: VIA BORGO VECCHIO 2 \\nTelefono: \\nNOTE:",,,,,,2,1,Filippo (5530890),,today at 09:30,en,Europe/Rome,,,,,,,,
task,Lavoro 12 staffe in via degli alfieri,,,,,,,4,1,Filippo (5530890),,today at 14:00,en,Europe/Rome,,,,,,,,
task,CHIONCHINI ALFREDO C03 @Goracci,"PDR: 11714040100016\\nMatricola : 5233492 \\nTecnico: Goracci\\nIndirizzo:  VIALE FORTEBRACCI 12\\nTelefono: 3405050301\\nNOTE:",,,,,,3,1,Filippo (5530890),,in 2 days at 09:30,en,Europe/Rome,,,,,,,,
task,TIRONZELLI ROLANDO C03 @Goracci,"PDR: 11714040180004\\nMatricola : 5004771 \\nTecnico: Goracci\\nIndirizzo:  VIA POLIDORI 2\\nTelefono: 3405050301\\nNOTE:",,,,,,3,1,Filippo (5530890),,in 2 days at 10:30,en,Europe/Rome,,,,,,,,
task,POSTE ITALIANE S.P.A. FILIALE DI PERUGIA C03 @Goracci,"PDR: 11714040130001\\nMatricola : 5233466\\nTecnico: Goracci\\nIndirizzo: PIAZZA FORTEBRACCIO 1\\nTelefono: \\nNOTE:",,,,,,3,1,Filippo (5530890),,in 2 days at 11:30,en,Europe/Rome,,,,,,,,
task,SONAGLIA MATTEO A40 @Goracci,"PDR: 11710000001691\\nMatricola : \\nTecnico: Goracci\\nIndirizzo: VIA GIUSEPPE RONDONI 24\\nTelefono: 3490583326\\nNOTE:",,,,,,4,1,Filippo (5530890),,tomorrow at 10:30,en,Europe/Rome,,,,,,,,
task,TRAORE NOBIDJIA A01 @Goracci,"PDR: 11712010090062\\nMatricola : 30397158\\nTecnico: Goracci\\nIndirizzo: VIALE M. K. GANDHI 7\\nTelefono: 3203280059\\nNOTE:",,,,,,4,1,Filippo (5530890),,in 1 days at 09:30,en,Europe/Rome,,,,,,,,
task,Sonaglia Nicola C03 @Goracci,"PDR: 11714040020003\\nMatricola : 2946968\\nTecnico: Goracci\\nIndirizzo: Via Antonio Gramsci 2\\nTelefono: 3348007564\\nNOTE:",,,,,,3,1,Filippo (5530890),,yesterday at 15:30,en,Europe/Rome,,,,,,,,
task,LUNGHI THOMAS A01 @Goracci,"PDR: 11710000001672\\nMatricola : 000\\nTecnico: Goracci\\nIndirizzo: PIAZZA CADUTI DEL LAVORO 3\\nTelefono: 3470734507\\nNOTE:",,,,,,4,1,Filippo (5530890),,today at 11:30,en,Europe/Rome,,,,,,,,
task,TOUCHANT FATIMA A01 @Goracci,"PDR: 11712010680011\\nMatricola : 2043599\\nTecnico: Goracci\\nIndirizzo: VIA GIUSEPPE LOMBARDO RADICE 4\\nTelefono: 3284610353\\nNOTE:",,,,,,4,1,Filippo (5530890),,today at 12:30,en,Europe/Rome,,,,,,,,
task,PUGGIONINU MARIA ANTONIETTA A01 @Goracci,"PDR: 11712011130001\\nMatricola : 30407768\\nTecnico: Goracci\\nIndirizzo: PUGGIONINU MARIA ANTONIETTA\\nTelefono: 3319833513\\nNOTE:",,,,,,4,1,Filippo (5530890),,in 3 days at 10:30,en,Europe/Rome,,,,,,,,
task,ABBASSI EP HAJRI MAHJOUBA A01 @Goracci,"PDR: 11711030040019\\nMatricola : 36045215\\nTecnico: Goracci\\nIndirizzo: VIA GIOVANNI BOCCACCIO 3\\nTelefono: 3270607457\\nNOTE:",,,,,,4,1,Filippo (5530890),,in 3 days at 09:30,en,Europe/Rome,,,,,,,,
task,SUN YUEJUN D01 @Goracci,"PDR: 11712011520018\\nMatricola : 00050314\\nTecnico: Goracci\\nIndirizzo: VIA UMBRIA 5\\nTelefono: 3388620699-3773914486 Ferid\\nNOTE:",,,,,,4,1,Filippo (5530890),,today at 11:30,en,Europe/Rome,,,,,,,,
task,MAGLIERIA UMBRA DI CAVEDON GIAN DOMENICO D01 @Goracci,"PDR: 11710000001546\\nMatricola : 22210093837\\nTecnico: Goracci\\nIndirizzo: VIA MADONNA DEL MORO 1\\nTelefono: 0756973628\\nNOTE:",,,,,,4,1,Filippo (5530890),,today at 10:30,en,Europe/Rome,,,,,,,,
task,MERCATI MARIA DOLORES D01 @Serpolini,"PDR: 11711050200032\\nMatricola : 19210780759\\nTecnico: Serpolini\\nIndirizzo: VIA UMBRA 9\\nTelefono: 3917040927\\nNOTE:",,,,,,4,1,Filippo (5530890),,tomorrow at 09:30,en,Europe/Rome,,,,,,,,
task,TANZI MICHELE D01 @Serpolini,"PDR: 11711050130030\\nMatricola : 26872\\nTecnico: Serpolini\\nIndirizzo: VIALe FRANCESCO NARDI 67\\nTelefono: 3396630590\\nNOTE:",,,,,,4,1,Filippo (5530890),,tomorrow at 10:30,en,Europe/Rome,,,,,,,,
task,NARDI EMILIA A01 @Serpolini,"PDR: 11711050010021\\nMatricola : 2529255\\nTecnico: Serpolini\\nIndirizzo: VIA DELLA STAZIONE 123\\nTelefono: 3355272022\\nNOTE:",,,,,,4,1,Filippo (5530890),,tomorrow at 11:30,en,Europe/Rome,,,,,,,,
task,SHURBI DORJAN A01 @Goracci,"PDR: 11712010710048\\nMatricola : 5631352\\nTecnico: Goracci\\nIndirizzo: VIA GIUSEPPE MASTRIFORTI 1\\nTelefono: 3519388256\\nNOTE:",,,,,,4,1,Filippo (5530890),,in 7 days at 10:30,en,Europe/Rome,,,,,,,,
task,SABATINI CHIARA A01 @Goracci,"PDR: 11712010140137\\nMatricola : 6725567\\nTecnico: Goracci\\nIndirizzo: VIALE MARTIRI DELLA LIBERTA 6\\nTelefono: 3277907314\\nNOTE:",,,,,,4,1,Filippo (5530890),,in 7 days at 09:30,en,Europe/Rome,,,,,,,,`;

      const events = this.parseCSV(sampleCSV);
      this.setEvents(events);
      if (this.turso.isConfigured()) {
        this.batchImportToTurso(events);
      }
    }

    // Salva e aggiorna gli eventi correnti
    setEvents(events) {
      this.events = events;
      this.saveEventsPermanently();
    }

    // Salva gli eventi sia in LocalStorage che su Turso DB (Permanente e Multi-Utente)
    async saveEventsPermanently(modifiedEvent = null, actionType = 'upsert') {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.events));
      } catch (e) {
        console.warn('Errore salvataggio localStorage', e);
      }

      // Salva su Turso DB Cloud
      if (this.turso.isConfigured()) {
        this.updateTursoBadge('syncing');
        try {
          if (actionType === 'delete' && modifiedEvent) {
            await this.turso.execute('DELETE FROM appointments WHERE id = ?;', [modifiedEvent.id]);
          } else if (modifiedEvent) {
            const sql = `INSERT OR REPLACE INTO appointments (id, client_name, job_code, technician, date, time, duration, priority, pdr, matricola, indirizzo, telefono, note, author, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);`;
            await this.turso.execute(sql, [
              modifiedEvent.id,
              modifiedEvent.clientName,
              modifiedEvent.jobCode || 'Altro',
              modifiedEvent.technician || 'Non assegnato',
              modifiedEvent.date,
              modifiedEvent.time,
              modifiedEvent.duration || 1,
              modifiedEvent.priority || 2,
              modifiedEvent.pdr || '',
              modifiedEvent.matricola || '',
              modifiedEvent.indirizzo || '',
              modifiedEvent.telefono || '',
              modifiedEvent.note || '',
              modifiedEvent.author || 'Operatore'
            ]);
          } else {
            await this.batchImportToTurso(this.events);
          }
          this.updateTursoBadge('online');
        } catch (err) {
          console.error('[Turso Save Error]', err);
          this.updateTursoBadge('error');
        }
      }

      // Se API PHP disponibile, sincronizza su server
      try {
        fetch(this.apiUrl + '?action=save_events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: this.events })
        }).catch(() => {});
      } catch (e) {}

      this.updateFilters();
      this.renderView();
    }

    // Inserisce array di eventi in batch su Turso
    async batchImportToTurso(events) {
      if (!this.turso.isConfigured() || !events || events.length === 0) return;
      try {
        const statements = events.map(ev => ({
          sql: `INSERT OR REPLACE INTO appointments (id, client_name, job_code, technician, date, time, duration, priority, pdr, matricola, indirizzo, telefono, note, author, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);`,
          args: [
            ev.id,
            ev.clientName,
            ev.jobCode || 'Altro',
            ev.technician || 'Non assegnato',
            ev.date,
            ev.time,
            ev.duration || 1,
            ev.priority || 2,
            ev.pdr || '',
            ev.matricola || '',
            ev.indirizzo || '',
            ev.telefono || '',
            ev.note || '',
            ev.author || 'Operatore'
          ]
        }));
        await this.turso.executeBatch(statements);
        this.updateTursoBadge('online');
      } catch (err) {
        console.error('[Turso Batch Import Error]', err);
      }
    }

    // Mappa le righe grezze di Turso in oggetti evento dell'interfaccia
    mapTursoRowsToEvents(rows) {
      return rows.map(r => {
        const dateParts = (r.date || '').split('-');
        const timeParts = (r.time || '09:00').split(':');
        const dt = new Date(
          parseInt(dateParts[0] || 2026),
          parseInt(dateParts[1] || 1) - 1,
          parseInt(dateParts[2] || 1),
          parseInt(timeParts[0] || 9),
          parseInt(timeParts[1] || 0)
        );
        return {
          id: r.id,
          clientName: r.client_name,
          jobCode: r.job_code || 'Altro',
          technician: r.technician || 'Non assegnato',
          priority: parseInt(r.priority, 10) || 1,
          author: r.author || 'Sistema',
          date: r.date,
          time: r.time,
          duration: (r.duration !== null && r.duration !== undefined) ? (parseFloat(r.duration) || 1) : 1,
          dateTime: dt,
          hasSpecificTime: Boolean(r.time),
          pdr: r.pdr || '',
          matricola: r.matricola || '',
          indirizzo: r.indirizzo || '',
          telefono: r.telefono || '',
          note: r.note || '',
          updatedAt: r.updated_at
        };
      });
    }

    // Polling in tempo reale (ogni 15 secondi controlla se ci sono modifiche da altri browser)
    startTursoPolling() {
      if (this._tursoInterval) clearInterval(this._tursoInterval);
      if (!this.turso.isConfigured()) return;

      this._tursoInterval = setInterval(async () => {
        const editMode = this.container.querySelector('#modal-edit-mode');
        if (editMode && editMode.style.display !== 'none') return; // Non interrompere se sta modificando

        try {
          const res = await this.turso.execute('SELECT count(*) as count, max(updated_at) as last_updated FROM appointments;');
          if (res.rows && res.rows[0]) {
            const row = res.rows[0];
            const checkSignature = `${row.count}_${row.last_updated}`;
            if (this._lastTursoSignature && this._lastTursoSignature !== checkSignature) {
              this._lastTursoSignature = checkSignature;
              await this.reloadFromTurso();
              this.showToast('Aggiornamento in tempo reale ricevuto da un altro utente!', 'info');
            } else if (!this._lastTursoSignature) {
              this._lastTursoSignature = checkSignature;
            }
          }
        } catch (e) {}
      }, 15000);
    }

    // Ricarica tutti gli interventi da Turso DB
    async reloadFromTurso() {
      if (!this.turso.isConfigured()) return;
      try {
        const res = await this.turso.execute('SELECT * FROM appointments ORDER BY date ASC, time ASC;');
        if (res.rows) {
          this.events = this.mapTursoRowsToEvents(res.rows);
          try { localStorage.setItem(this.storageKey, JSON.stringify(this.events)); } catch (e) {}
          this.updateFilters();
          this.renderView();
        }
      } catch (e) {}
    }

    // Aggiorna lo stato visivo del badge Turso
    updateTursoBadge(status) {
      const badge = this.container.querySelector('#asim-turso-badge');
      const text = this.container.querySelector('#asim-turso-text');
      if (!badge || !text) return;

      if (status === 'online') {
        badge.className = 'asim-badge-turso is-online';
        text.textContent = 'Turso Cloud Live';
        badge.title = 'Database Turso SQLite Cloud sincronizzato in tempo reale su tutti i dispositivi';
      } else if (status === 'syncing') {
        badge.className = 'asim-badge-turso is-syncing';
        text.textContent = 'Sync in corso...';
      } else if (status === 'error') {
        badge.className = 'asim-badge-turso is-offline';
        text.textContent = 'Turso Offline (Locale)';
        badge.title = 'Impossibile contattare Turso, operatività temporanea in locale';
      }
    }

    // Svuota tutti i dati (da Turso e locale)
    async clearData() {
      this.events = [];
      localStorage.removeItem(this.storageKey);

      if (this.turso.isConfigured()) {
        try {
          await this.turso.execute('DELETE FROM appointments;');
        } catch (e) {}
      }

      this.updateFilters();
      this.renderView();

      try {
        fetch(this.apiUrl + '?action=clear', { method: 'POST' }).catch(() => {});
      } catch (e) {}
      this.showToast('Calendario svuotato sia in locale che su Turso DB.', 'info');
    }

    // Parser CSV completo con supporto per quote multiriga ed escape
    parseCSV(text) {
      const lines = [];
      let row = [];
      let currentVal = '';
      let inQuotes = false;

      // Normalizza caratteri \r\n
      const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Virgolette doppie scappate: "" -> "
            currentVal += '"';
            i++;
          } else {
            // Apertura/Chiusura virgolette
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(currentVal);
          currentVal = '';
        } else if (char === '\n' && !inQuotes) {
          row.push(currentVal);
          lines.push(row);
          row = [];
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      if (currentVal || row.length > 0) {
        row.push(currentVal);
        lines.push(row);
      }

      if (lines.length === 0) return [];

      const headers = lines[0].map(h => h.trim().toUpperCase());
      const events = [];

      for (let r = 1; r < lines.length; r++) {
        const rowData = lines[r];
        if (!rowData || rowData.length === 0 || (rowData.length === 1 && !rowData[0].trim())) {
          continue; // riga vuota
        }

        const rowObj = {};
        for (let c = 0; c < headers.length; c++) {
          rowObj[headers[c]] = rowData[c] !== undefined ? rowData[c].trim() : '';
        }

        // Filtra solo task con contenuto
        if (rowObj['TYPE'] && rowObj['TYPE'].toLowerCase() !== 'task') {
          continue;
        }
        if (!rowObj['CONTENT']) {
          continue;
        }

        const parsedEvent = this.parseTaskRow(rowObj, r);
        if (parsedEvent) {
          events.push(parsedEvent);
        }
      }

      return events;
    }

    // Estrae e normalizza i campi di ciascun intervento
    parseTaskRow(row, index) {
      const rawContent = row['CONTENT'] || '';
      const rawDesc = row['DESCRIPTION'] || '';
      const rawDate = row['DATE'] || '';
      const priority = parseInt(row['PRIORITY']) || 0;
      const author = row['AUTHOR'] || '';

      // 1. Estrai Codice Intervento (es. C03, A01, D01, A40)
      const codeMatch = rawContent.match(/\b([A-Z]\d{2})\b/);
      const jobCode = codeMatch ? codeMatch[1] : '';

      // 2. Estrai Tecnico (@Goracci, @Serpolini o da DESCRIZIONE "Tecnico: Goracci")
      let technician = '';
      const techTagMatch = rawContent.match(/@([A-Za-z0-9_]+)/);
      if (techTagMatch) {
        technician = techTagMatch[1];
      }

      // 3. Estrai dati dalla descrizione strutturata
      const descFields = this.parseDescriptionFields(rawDesc);
      if (!technician && descFields.tecnico) {
        technician = descFields.tecnico;
      }

      // 4. Estrai Nome Cliente pulito (senza codice e senza @tecnico)
      let clientName = rawContent
        .replace(/@[A-Za-z0-9_]+/g, '')
        .replace(/\b[A-Z]\d{2}\b/g, '')
        .trim();
      if (!clientName) {
        clientName = rawContent;
      }

      // 5. Parsa Data, Ora e Durata
      const parsedDateTime = this.parseDateString(rawDate);
      const rawDuration = parseFloat(row['DURATION']) || 1;

      return {
        id: 'task_' + index + '_' + Math.random().toString(36).substr(2, 6),
        rawContent: rawContent,
        clientName: clientName,
        jobCode: jobCode || 'Altro',
        technician: technician || 'Non assegnato',
        priority: priority,
        author: author,
        date: parsedDateTime.isoDate, // YYYY-MM-DD
        time: parsedDateTime.time,    // HH:MM
        duration: rawDuration,
        dateTime: parsedDateTime.fullDate, // Oggetto Date
        hasSpecificTime: parsedDateTime.hasTime,
        rawDate: rawDate,
        pdr: descFields.pdr || '',
        matricola: descFields.matricola || '',
        indirizzo: descFields.indirizzo || '',
        telefono: descFields.telefono || '',
        note: descFields.note || ''
      };
    }

    // Estrae campi con label dalla descrizione (PDR, Matricola, Tecnico, Indirizzo, Telefono, NOTE)
    parseDescriptionFields(desc) {
      const fields = {
        pdr: '',
        matricola: '',
        tecnico: '',
        indirizzo: '',
        telefono: '',
        note: ''
      };

      if (!desc) return fields;

      // Normalizza ritorni a capo letterali "\\n" o reali "\n"
      const lines = desc.replace(/\\n/g, '\n').split('\n');
      let currentSection = '';

      for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (/^PDR\s*:/i.test(trimmed)) {
          fields.pdr = trimmed.replace(/^PDR\s*:/i, '').trim();
          currentSection = 'pdr';
        } else if (/^Matricola\s*:/i.test(trimmed)) {
          fields.matricola = trimmed.replace(/^Matricola\s*:/i, '').trim();
          currentSection = 'matricola';
        } else if (/^Tecnico\s*:/i.test(trimmed)) {
          fields.tecnico = trimmed.replace(/^Tecnico\s*:/i, '').trim();
          currentSection = 'tecnico';
        } else if (/^Indirizzo\s*:/i.test(trimmed)) {
          fields.indirizzo = trimmed.replace(/^Indirizzo\s*:/i, '').trim();
          currentSection = 'indirizzo';
        } else if (/^Telefono\s*:/i.test(trimmed)) {
          fields.telefono = trimmed.replace(/^Telefono\s*:/i, '').trim();
          currentSection = 'telefono';
        } else if (/^NOTE\s*:/i.test(trimmed)) {
          fields.note = trimmed.replace(/^NOTE\s*:/i, '').trim();
          currentSection = 'note';
        } else if (currentSection === 'note') {
          fields.note += (fields.note ? '\n' : '') + trimmed;
        } else if (currentSection === 'indirizzo' && !fields.indirizzo) {
          fields.indirizzo = trimmed;
        }
      }

      return fields;
    }

    // Parser flessibile per date relative ("today at 12:30", "in 2 days at 09:30", "5 days ago", ecc.) e assolute
    parseDateString(str) {
      const now = new Date(this.referenceDate);
      let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
      let timeStr = '09:00';
      let hasTime = false;

      if (!str || !str.trim()) {
        return {
          isoDate: this.formatISODate(targetDate),
          time: timeStr,
          fullDate: targetDate,
          hasTime: false
        };
      }

      const s = str.trim().toLowerCase();

      // Cerca l'orario "at HH:MM" o "HH:MM"
      const timeMatch = s.match(/(?:at\s+)?(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        hasTime = true;
      }

      // Casi relativi
      if (s.includes('today')) {
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (s.includes('tomorrow')) {
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      } else if (s.includes('yesterday')) {
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      } else {
        // "in X days"
        const inDaysMatch = s.match(/in\s+(\d+)\s+days?/);
        if (inDaysMatch) {
          const days = parseInt(inDaysMatch[1], 10);
          targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
        } else {
          // "X days ago"
          const agoMatch = s.match(/(\d+)\s+days?\s+ago/);
          if (agoMatch) {
            const days = parseInt(agoMatch[1], 10);
            targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
          } else {
            // Prova parsing data assoluta standard YYYY-MM-DD o DD/MM/YYYY
            const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (isoMatch) {
              targetDate = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
            } else {
              const itMatch = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
              if (itMatch) {
                targetDate = new Date(parseInt(itMatch[3]), parseInt(itMatch[2]) - 1, parseInt(itMatch[1]));
              } else {
                const parsed = Date.parse(str);
                if (!isNaN(parsed)) {
                  targetDate = new Date(parsed);
                }
              }
            }
          }
        }
      }

      // Imposta ora se trovata
      if (hasTime && timeMatch) {
        targetDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
      }

      return {
        isoDate: this.formatISODate(targetDate),
        time: timeStr,
        fullDate: targetDate,
        hasTime: hasTime
      };
    }

    formatISODate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    // Assegna colori univoci ai tecnici
    getTechColor(tech) {
      if (!tech || tech === 'Non assegnato') {
        return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
      }
      if (!this.techColorMap.has(tech)) {
        const idx = this.techColorMap.size % TECH_COLORS.length;
        this.techColorMap.set(tech, TECH_COLORS[idx]);
      }
      return this.techColorMap.get(tech);
    }

    // Aggiorna tendine di filtro con i dati correnti
    updateFilters() {
      this.technicians.clear();
      this.jobCodes.clear();

      this.events.forEach(ev => {
        if (ev.technician) this.technicians.add(ev.technician);
        if (ev.jobCode) this.jobCodes.add(ev.jobCode);
      });

      // Select Tecnico
      const techSelect = this.container.querySelector('#asim-filter-tech');
      const curTech = techSelect.value;
      techSelect.innerHTML = '<option value="all">Tutti i tecnici</option>';
      Array.from(this.technicians).sort().forEach(tech => {
        const opt = document.createElement('option');
        opt.value = tech;
        opt.textContent = (tech.startsWith('@') ? '' : '@') + tech;
        techSelect.appendChild(opt);
      });
      techSelect.value = this.technicians.has(curTech) ? curTech : 'all';
      this.activeTechnician = techSelect.value;

      // Select Codice
      const codeSelect = this.container.querySelector('#asim-filter-code');
      const curCode = codeSelect.value;
      codeSelect.innerHTML = '<option value="all">Tutti i codici</option>';
      Array.from(this.jobCodes).sort().forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code;
        codeSelect.appendChild(opt);
      });
      codeSelect.value = this.jobCodes.has(curCode) ? curCode : 'all';
      this.activeJobCode = codeSelect.value;

      // Renderizza i pill rapidi per i tecnici
      const pillsContainer = this.container.querySelector('#asim-tech-pills');
      if (pillsContainer) {
        if (this.technicians.size > 0) {
          pillsContainer.style.display = 'flex';
          let pillsHtml = `
            <button class="asim-pill-btn ${this.activeTechnician === 'all' ? 'active' : ''}" data-tech="all">
              Tutti (${this.events.length})
            </button>
          `;
          Array.from(this.technicians).sort().forEach(tech => {
            const count = this.events.filter(e => e.technician === tech).length;
            const colors = this.getTechColor(tech);
            const isAct = this.activeTechnician === tech;
            pillsHtml += `
              <button class="asim-pill-btn ${isAct ? 'active' : ''}" data-tech="${tech}" 
                style="${isAct ? `background-color: ${colors.bg}; color: ${colors.text}; border-color: ${colors.border};` : ''}">
                @${tech} (${count})
              </button>
            `;
          });
          pillsContainer.innerHTML = pillsHtml;

          pillsContainer.querySelectorAll('.asim-pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              this.activeTechnician = btn.dataset.tech;
              techSelect.value = this.activeTechnician;
              this.updateFilters();
              this.renderView();
            });
          });
        } else {
          pillsContainer.style.display = 'none';
        }
      }
    }

    // Esporta gli interventi visibili/filtrati in un file CSV scaricabile
    exportCSV() {
      const filtered = this.getFilteredEvents();
      if (!filtered || filtered.length === 0) {
        this.showToast('Nessun intervento da esportare', 'error');
        return;
      }

      let csv = 'TYPE,CONTENT,DESCRIPTION,PRIORITY,AUTHOR,DATE\n';
      filtered.forEach(ev => {
        const content = `"${(ev.clientName + ' ' + (ev.jobCode !== 'Altro' ? ev.jobCode : '') + ' @' + ev.technician).replace(/"/g, '""').trim()}"`;
        const desc = `"PDR: ${ev.pdr}\\nMatricola : ${ev.matricola}\\nTecnico: ${ev.technician}\\nIndirizzo: ${ev.indirizzo}\\nTelefono: ${ev.telefono}\\nNOTE: ${ev.note}"`;
        csv += `task,${content},${desc},${ev.priority},"${ev.author || ''}","${ev.date} at ${ev.time}"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `interventi_asim_${this.formatISODate(new Date())}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.showToast(`Esportati ${filtered.length} interventi in CSV!`, 'success');
    }

    // Filtra gli eventi in base a ricerca, tecnico e codice lavoro
    getFilteredEvents() {
      return this.events.filter(ev => {
        // Filtro Tecnico
        if (this.activeTechnician !== 'all' && ev.technician !== this.activeTechnician) {
          return false;
        }

        // Filtro Codice
        if (this.activeJobCode !== 'all' && ev.jobCode !== this.activeJobCode) {
          return false;
        }

        // Ricerca testuale
        if (this.searchQuery) {
          const q = this.searchQuery;
          const match =
            ev.clientName.toLowerCase().includes(q) ||
            ev.indirizzo.toLowerCase().includes(q) ||
            ev.pdr.toLowerCase().includes(q) ||
            ev.matricola.toLowerCase().includes(q) ||
            ev.telefono.toLowerCase().includes(q) ||
            ev.technician.toLowerCase().includes(q) ||
            ev.jobCode.toLowerCase().includes(q) ||
            ev.note.toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      });
    }

    // Navigazione temporale in avanti/indietro
    navigateDate(offset) {
      if (this.currentView === 'month') {
        this.selectedDate = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + offset, 1);
      } else if (this.currentView === 'week') {
        this.selectedDate = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate() + (offset * 7));
      } else if (this.currentView === 'day') {
        this.selectedDate = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate() + offset);
      }
      this.renderView();
    }

    // Renderizza la vista attiva
    renderView() {
      const filtered = this.getFilteredEvents();
      const body = this.container.querySelector('#asim-cal-body');
      const counter = this.container.querySelector('#asim-counter-badge');
      const label = this.container.querySelector('#asim-nav-label');

      counter.textContent = `${filtered.length} intervent${filtered.length === 1 ? 'o' : 'i'}`;

      if (this.currentView === 'month') {
        this.renderMonthView(body, label, filtered);
      } else if (this.currentView === 'week') {
        this.renderWeekView(body, label, filtered);
      } else if (this.currentView === 'day') {
        this.renderDayView(body, label, filtered);
      } else if (this.currentView === 'list') {
        this.renderListView(body, label, filtered);
      }

      // Aggiorna intestazione per la stampa
      const printTitle = this.container.querySelector('#asim-print-view-title');
      const printFilter = this.container.querySelector('#asim-print-filter-info');
      if (printTitle && label) {
        printTitle.textContent = label.textContent;
      }
      if (printFilter) {
        const filterParts = [];
        if (this.activeTechnician !== 'all') filterParts.push(`Tecnico: @${this.activeTechnician}`);
        if (this.activeJobCode !== 'all') filterParts.push(`Codice: ${this.activeJobCode}`);
        if (this.searchQuery) filterParts.push(`Cerca: "${this.searchQuery}"`);
        printFilter.textContent = filterParts.length > 0 ? filterParts.join(' | ') : 'Tutti gli interventi';
      }
    }

    // Vista Mese (Griglia 7 colonne: Lun - Dom)
    renderMonthView(container, labelElement, filteredEvents) {
      const year = this.selectedDate.getFullYear();
      const month = this.selectedDate.getMonth();
      const monthNames = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
      ];
      labelElement.textContent = `${monthNames[month]} ${year}`;

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      // Inizio da Lunedì (0 = Lunedì ... 6 = Domenica)
      let startDayOfWeek = firstDay.getDay() - 1;
      if (startDayOfWeek === -1) startDayOfWeek = 6;

      const totalDays = lastDay.getDate();
      const prevMonthLastDay = new Date(year, month, 0).getDate();

      // Raggruppa eventi filtrati per data ISO
      const eventsByDate = {};
      filteredEvents.forEach(ev => {
        if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
        eventsByDate[ev.date].push(ev);
      });

      // Ordina eventi per orario
      Object.keys(eventsByDate).forEach(d => {
        eventsByDate[d].sort((a, b) => a.time.localeCompare(b.time));
      });

      const todayIso = this.formatISODate(new Date());

      let html = `
        <div class="asim-month-grid">
          <div class="asim-week-header">
            <div>Lun</div><div>Mar</div><div>Mer</div><div>Gio</div><div>Ven</div><div>Sab</div><div>Dom</div>
          </div>
          <div class="asim-days-grid">
      `;

      // Giorni del mese precedente
      for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const dayNum = prevMonthLastDay - i;
        html += `<div class="asim-day-cell is-other-month"><span class="asim-day-number">${dayNum}</span></div>`;
      }

      // Giorni del mese corrente
      for (let day = 1; day <= totalDays; day++) {
        const currentIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = currentIso === todayIso;
        const dayEvents = eventsByDate[currentIso] || [];

        html += `
          <div class="asim-day-cell ${isToday ? 'is-today' : ''}" data-date="${currentIso}">
            <div class="asim-day-top">
              <span class="asim-day-number">${day}</span>
              ${dayEvents.length > 0 ? `<span class="asim-day-badge">${dayEvents.length}</span>` : ''}
              <div style="display:flex; align-items:center; gap:4px;">
                ${dayEvents.length > 0 ? `<span class="asim-day-badge">${dayEvents.length}</span>` : ''}
                <button class="asim-cell-add-btn" data-date="${currentIso}" title="Aggiungi intervento per il ${day}">+</button>
              </div>
            </div>
            <div class="asim-day-events">
        `;

        const maxVisible = 3;
        dayEvents.slice(0, maxVisible).forEach(ev => {
          const colors = this.getTechColor(ev.technician);
          const duration = parseFloat(ev.duration) || 1;
          const endTime = this.calculateEndTime(ev.time, duration);
          const timeLabel = duration > 1 ? `${ev.time}-${endTime}` : ev.time;
          html += `
            <div class="asim-event-chip" draggable="true" data-id="${ev.id}" style="background-color: ${colors.bg}; color: ${colors.text}; border-left-color: ${colors.border};" title="Trascina per spostare: ${this.escapeHtml(ev.clientName)} (${ev.time} - ${endTime}, durata ${this.formatDuration(duration)})">
              <span class="asim-chip-time">${timeLabel}</span>
              <span class="asim-chip-code">${ev.jobCode}</span>
              <span class="asim-chip-name">${this.escapeHtml(ev.clientName)}</span>
            </div>
          `;
        });

        if (dayEvents.length > maxVisible) {
          const remaining = dayEvents.length - maxVisible;
          html += `
            <div class="asim-more-chip" data-date="${currentIso}">
              + altri ${remaining} interventi
            </div>
          `;
        }

        html += `
            </div>
          </div>
        `;
      }

      // Giorni del mese successivo per completare la griglia (multiplo di 7)
      const totalCells = startDayOfWeek + totalDays;
      const nextMonthDays = (7 - (totalCells % 7)) % 7;
      for (let i = 1; i <= nextMonthDays; i++) {
        html += `<div class="asim-day-cell is-other-month"><span class="asim-day-number">${i}</span></div>`;
      }

      html += `
          </div>
        </div>
      `;

      container.innerHTML = html;

      // Event click e drag sui chip del mese
      container.querySelectorAll('.asim-event-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const eventId = chip.dataset.id;
          const ev = this.events.find(x => x.id === eventId);
          if (ev) this.openModal(ev);
        });

        chip.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          e.dataTransfer.setData('text/plain', chip.dataset.id);
          chip.classList.add('is-dragging');
        });

        chip.addEventListener('dragend', () => {
          chip.classList.remove('is-dragging');
        });
      });

      // Drop e click sulle celle del mese
      container.querySelectorAll('.asim-day-cell:not(.is-other-month)').forEach(cell => {
        cell.addEventListener('dragover', (e) => {
          e.preventDefault();
          cell.classList.add('drag-over');
        });

        cell.addEventListener('dragleave', (e) => {
          if (!cell.contains(e.relatedTarget)) {
            cell.classList.remove('drag-over');
          }
        });

        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          cell.classList.remove('drag-over');
          const eventId = e.dataTransfer.getData('text/plain');
          const targetDate = cell.dataset.date;
          if (eventId && targetDate) {
            const ev = this.events.find(x => x.id === eventId);
            if (ev && ev.date !== targetDate) {
              ev.date = targetDate;
              const dateParts = targetDate.split('-');
              const timeParts = ev.time.split(':');
              ev.dateTime = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), parseInt(timeParts[0] || 9), parseInt(timeParts[1] || 0));
              this.saveEventsPermanently(ev, 'upsert');
              this.renderView();
              this.showToast(`Intervento di ${ev.clientName} spostato al ${targetDate}!`, 'success');
            }
          }
        });

        cell.addEventListener('click', () => {
          const dateStr = cell.dataset.date;
          if (dateStr) {
            const parts = dateStr.split('-');
            this.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            this.currentView = 'day';
            this.container.querySelectorAll('.asim-view-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.view === 'day');
            });
            this.renderView();
          }
        });
      });

      // Aggiungi intervento da cella mese (+)
      container.querySelectorAll('.asim-cell-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCreateMode(btn.dataset.date);
        });
      });
    }

    // Costruisce l'HTML di un card intervento per la vista settimana (con note ben visibili)
    renderWeekCardHtml(ev, dayTag = '') {
      const colors = this.getTechColor(ev.technician);
      const duration = parseFloat(ev.duration) || 1;
      const endTime = this.calculateEndTime(ev.time, duration);
      const cardHeight = this.calculateCardHeight(duration);
      const durationLabel = this.formatDuration(duration);
      const hasConflict = Boolean(this.findOverlappingEvent(ev.date, ev.time, duration, ev.technician, ev.id));
      const cleanNote = ev.note ? ev.note.replace(/^NOTE:\s*/i, '').trim() : '';

      return `
        <div class="asim-card-event ${hasConflict ? 'asim-card-conflict' : ''}" draggable="true" data-id="${ev.id}" style="border-left: 4px solid ${colors.border}; min-height: ${cardHeight}px;" title="Trascina per spostare: ${this.escapeHtml(ev.clientName)} (Fascia oraria occupata: ${ev.time} - ${endTime})">
          <div>
            <div class="asim-card-top">
              <span class="asim-card-time">${dayTag ? `<span class="asim-badge-day-tag">${dayTag}</span> ` : ''}${ev.time} - ${endTime}</span>
              <span class="asim-badge asim-badge-code-sm">${ev.jobCode}</span>
            </div>
            <div class="asim-card-title">${this.escapeHtml(ev.clientName)}</div>
            <div class="asim-card-tech" style="color: ${colors.text};">
              @${ev.technician}
              ${hasConflict ? `<span class="asim-card-conflict-badge" title="Attenzione: sovrapposizione oraria per questo tecnico">⚠️ Conflitto</span>` : ''}
            </div>
            ${ev.indirizzo ? `<div class="asim-card-addr">📍 ${this.escapeHtml(ev.indirizzo)}</div>` : ''}
            ${cleanNote ? `<div class="asim-card-note" title="${this.escapeHtml(cleanNote)}">📝 ${this.escapeHtml(cleanNote)}</div>` : ''}
          </div>
          <div class="asim-card-occupy-bar">
            <span class="asim-occupy-badge">⏱️ ${durationLabel}</span>
            <span class="asim-occupy-span">${ev.time} ➔ ${endTime}</span>
          </div>
        </div>
      `;
    }

    // Vista Settimana (6 colonne: Lun-Ven + Sabato/Domenica unificati per guadagnare spazio)
    renderWeekView(container, labelElement, filteredEvents) {
      const cur = new Date(this.selectedDate);
      let dayOfWeek = cur.getDay() - 1;
      if (dayOfWeek === -1) dayOfWeek = 6;

      const startOfWeek = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6);

      const dayNames = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì'];
      const todayIso = this.formatISODate(new Date());

      labelElement.textContent = `Settimana ${startOfWeek.getDate()}/${startOfWeek.getMonth() + 1} - ${endOfWeek.getDate()}/${endOfWeek.getMonth() + 1}/${endOfWeek.getFullYear()}`;

      // Raggruppa eventi per data
      const eventsByDate = {};
      filteredEvents.forEach(ev => {
        if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
        eventsByDate[ev.date].push(ev);
      });

      let html = `<div class="asim-week-container">`;

      // 1. Colonne feriali da Lunedì a Venerdì (5 colonne spaziose)
      for (let i = 0; i < 5; i++) {
        const d = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i);
        const iso = this.formatISODate(d);
        const isToday = iso === todayIso;
        const dayEvents = eventsByDate[iso] || [];
        dayEvents.sort((a, b) => a.time.localeCompare(b.time));

        html += `
          <div class="asim-week-col ${isToday ? 'is-today' : ''}" data-date="${iso}">
            <div class="asim-week-col-header">
              <span class="asim-week-day-name">${dayNames[i]}</span>
              <span class="asim-week-day-num">${d.getDate()}</span>
              <button class="asim-col-add-btn" data-date="${iso}" title="Aggiungi intervento per ${dayNames[i]} ${d.getDate()}">+</button>
            </div>
            <div class="asim-week-col-body">
        `;

        if (dayEvents.length === 0) {
          html += `<div class="asim-empty-day" data-date="${iso}" title="Clicca per aggiungere un intervento">+ Nessun intervento</div>`;
        } else {
          dayEvents.forEach(ev => {
            html += this.renderWeekCardHtml(ev);
          });
        }

        html += `
            </div>
          </div>
        `;
      }

      // 2. Colonna 6: Sabato e Domenica integrati nello stesso giorno per massimizzare lo spazio
      const dSat = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 5);
      const dSun = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6);
      const isoSat = this.formatISODate(dSat);
      const isoSun = this.formatISODate(dSun);
      const isTodaySat = isoSat === todayIso;
      const isTodaySun = isoSun === todayIso;
      const satEvents = eventsByDate[isoSat] || [];
      const sunEvents = eventsByDate[isoSun] || [];
      satEvents.sort((a, b) => a.time.localeCompare(b.time));
      sunEvents.sort((a, b) => a.time.localeCompare(b.time));
      const totalWeekendEvents = satEvents.length + sunEvents.length;

      html += `
        <div class="asim-week-col asim-week-col-weekend ${isTodaySat || isTodaySun ? 'is-today' : ''}" data-date="${isoSat}">
          <div class="asim-week-col-header">
            <span class="asim-week-day-name">Sabato / Domenica</span>
            <span class="asim-week-day-num">${dSat.getDate()} - ${dSun.getDate()}</span>
            <div class="asim-weekend-header-actions">
              <button class="asim-col-add-btn asim-col-add-weekend" data-date="${isoSat}" title="Aggiungi intervento per Sabato ${dSat.getDate()}">+Sab</button>
              <button class="asim-col-add-btn asim-col-add-weekend" data-date="${isoSun}" title="Aggiungi intervento per Domenica ${dSun.getDate()}">+Dom</button>
            </div>
          </div>
          <div class="asim-week-col-body">
      `;

      if (totalWeekendEvents === 0) {
        html += `<div class="asim-empty-day" data-date="${isoSat}" title="Clicca per aggiungere un intervento">+ Nessun intervento nel weekend</div>`;
      } else {
        if (satEvents.length > 0) {
          html += `
            <div class="asim-weekend-subhead" data-date="${isoSat}">
              <span>Sabato ${dSat.getDate()}</span>
              <span class="asim-weekend-count">${satEvents.length}</span>
            </div>
          `;
          satEvents.forEach(ev => {
            html += this.renderWeekCardHtml(ev, 'Sab');
          });
        }
        if (sunEvents.length > 0) {
          html += `
            <div class="asim-weekend-subhead" data-date="${isoSun}">
              <span>Domenica ${dSun.getDate()}</span>
              <span class="asim-weekend-count">${sunEvents.length}</span>
            </div>
          `;
          sunEvents.forEach(ev => {
            html += this.renderWeekCardHtml(ev, 'Dom');
          });
        }
      }

      html += `
          </div>
        </div>
      `;

      html += `</div>`;
      container.innerHTML = html;

      // Click e Drag sui card evento
      container.querySelectorAll('.asim-card-event').forEach(card => {
        card.addEventListener('click', () => {
          const ev = this.events.find(x => x.id === card.dataset.id);
          if (ev) this.openModal(ev);
        });

        card.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          e.dataTransfer.setData('text/plain', card.dataset.id);
          card.classList.add('is-dragging');
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('is-dragging');
        });
      });

      // Drop sulle colonne della settimana e sulle sezioni weekend
      container.querySelectorAll('.asim-week-col').forEach(col => {
        col.addEventListener('dragover', (e) => {
          e.preventDefault();
          col.classList.add('drag-over');
        });

        col.addEventListener('dragleave', (e) => {
          if (!col.contains(e.relatedTarget)) {
            col.classList.remove('drag-over');
          }
        });

        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.classList.remove('drag-over');
          const eventId = e.dataTransfer.getData('text/plain');
          const targetEl = e.target.closest('[data-date]') || col;
          const targetDate = targetEl.dataset.date || col.dataset.date;
          if (eventId && targetDate) {
            const ev = this.events.find(x => x.id === eventId);
            if (ev && ev.date !== targetDate) {
              ev.date = targetDate;
              const dateParts = targetDate.split('-');
              const timeParts = ev.time.split(':');
              ev.dateTime = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), parseInt(timeParts[0] || 9), parseInt(timeParts[1] || 0));
              this.saveEventsPermanently(ev, 'upsert');
              this.renderView();
              this.showToast(`Intervento di ${ev.clientName} spostato al ${targetDate}!`, 'success');
            }
          }
        });
      });

      // Aggiungi intervento da colonna settimana (+), da weekend o da cella vuota
      container.querySelectorAll('.asim-col-add-btn, .asim-empty-day').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCreateMode(btn.dataset.date);
        });
      });
    }

      // Clic su "Nessun intervento" per aggiungere rapidamente
      container.querySelectorAll('.asim-empty-day').forEach(emptyEl => {
        emptyEl.addEventListener('click', () => {
          this.openCreateMode(emptyEl.dataset.date);
        });
      });
    }

    // Vista Giorno (Cronologica con orari)
    renderDayView(container, labelElement, filteredEvents) {
      const year = this.selectedDate.getFullYear();
      const month = this.selectedDate.getMonth();
      const day = this.selectedDate.getDate();
      const iso = this.formatISODate(this.selectedDate);

      const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
      const monthNames = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
      ];

      labelElement.textContent = `${dayNames[this.selectedDate.getDay()]} ${day} ${monthNames[month]} ${year}`;

      const dayEvents = filteredEvents.filter(ev => ev.date === iso);
      dayEvents.sort((a, b) => a.time.localeCompare(b.time));

      let html = `
        <div class="asim-day-view-container">
          <div class="asim-day-header-summary">
            <h3>Interventi in programma per oggi (${dayEvents.length})</h3>
          <div class="asim-day-header-summary" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <h3 style="margin:0;">Interventi in programma per oggi (${dayEvents.length})</h3>
            <button class="asim-btn asim-btn-sm asim-btn-primary asim-day-add-btn" data-date="${iso}">
              ➕ Nuovo Intervento
            </button>
          </div>
      `;

      if (dayEvents.length === 0) {
        html += `
          <div class="asim-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p>Nessun intervento programmato per questa giornata.</p>
            <button class="asim-btn asim-btn-sm asim-btn-primary asim-day-add-btn" data-date="${iso}" style="margin-top:10px;">
              ➕ Aggiungi Intervento per Oggi
            </button>
          </div>
        `;
      } else {
        html += `<div class="asim-day-timeline">`;
        dayEvents.forEach(ev => {
          const colors = this.getTechColor(ev.technician);
          const duration = parseFloat(ev.duration) || 1;
          const endTime = this.calculateEndTime(ev.time, duration);
          const cardHeight = this.calculateCardHeight(duration);
          const durationLabel = this.formatDuration(duration);
          const hasConflict = Boolean(this.findOverlappingEvent(ev.date, ev.time, duration, ev.technician, ev.id));
          html += `
            <div class="asim-timeline-item" data-id="${ev.id}">
              <div class="asim-timeline-time">
                <div style="font-weight:700; color:#0f172a; font-size:0.95rem;">${ev.time}</div>
                <div style="font-size:0.75rem; color:#0284c7; font-weight:600; margin:3px 0;">↓ ${durationLabel}</div>
                <div style="font-weight:600; color:#64748b; font-size:0.85rem;">${endTime}</div>
              </div>
              <div class="asim-timeline-card ${hasConflict ? 'asim-card-conflict' : ''}" style="border-left-color: ${colors.border}; min-height: ${cardHeight}px; display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div class="asim-card-header-row">
                    <div class="asim-card-title-group">
                      <span class="asim-badge asim-badge-code">${ev.jobCode}</span>
                      <strong class="asim-card-client">${this.escapeHtml(ev.clientName)}</strong>
                      ${hasConflict ? `<span class="asim-card-conflict-badge">⚠️ Sovrapposizione oraria</span>` : ''}
                    </div>
                    <span class="asim-badge asim-badge-tech" style="background:${colors.bg}; color:${colors.text}; border-color:${colors.border}">
                      @${ev.technician}
                    </span>
                  </div>
                  <div class="asim-timeline-details">
                    ${ev.indirizzo ? `<div><strong>📍 Indirizzo:</strong> ${this.escapeHtml(ev.indirizzo)}</div>` : ''}
                    ${ev.telefono ? `<div><strong>📞 Telefono:</strong> <a href="tel:${ev.telefono}">${ev.telefono}</a></div>` : ''}
                    ${ev.pdr ? `<div><strong>PDR:</strong> <code>${ev.pdr}</code></div>` : ''}
                    ${ev.matricola ? `<div><strong>Matricola:</strong> <code>${ev.matricola}</code></div>` : ''}
                  </div>
                </div>
                <div class="asim-card-occupy-bar" style="margin-top:10px;">
                  <span class="asim-occupy-badge">⏱️ Durata: ${durationLabel}</span>
                  <span class="asim-occupy-span">Fascia oraria occupata: ${ev.time} ➔ ${endTime}</span>
                </div>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }

      html += `</div>`;
      container.innerHTML = html;

      container.querySelectorAll('.asim-timeline-item').forEach(item => {
        item.addEventListener('click', () => {
          const ev = this.events.find(x => x.id === item.dataset.id);
          if (ev) this.openModal(ev);
        });
      });

      // Aggiungi intervento da vista giorno (+)
      container.querySelectorAll('.asim-day-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.openCreateMode(btn.dataset.date);
        });
      });
    }

    // Vista Elenco / Agenda
    renderListView(container, labelElement, filteredEvents) {
      labelElement.textContent = `Tutti gli interventi (${filteredEvents.length})`;

      if (filteredEvents.length === 0) {
        container.innerHTML = `
          <div class="asim-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <p>Nessun intervento trovato con i filtri correnti.</p>
          </div>
        `;
        return;
      }

      // Raggruppa per data
      const grouped = {};
      filteredEvents.forEach(ev => {
        if (!grouped[ev.date]) grouped[ev.date] = [];
        grouped[ev.date].push(ev);
      });

      const sortedDates = Object.keys(grouped).sort();

      let html = `<div class="asim-list-view-container">`;

      sortedDates.forEach(dateStr => {
        const dateEvents = grouped[dateStr];
        dateEvents.sort((a, b) => a.time.localeCompare(b.time));

        const parts = dateStr.split('-');
        const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const formattedDate = dateObj.toLocaleDateString('it-IT', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        html += `
          <div class="asim-list-date-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <h4 class="asim-list-date-title" style="margin:0;">${formattedDate} <span class="asim-count">(${dateEvents.length})</span></h4>
              <button class="asim-col-add-btn" data-date="${dateStr}" title="Aggiungi intervento per questo giorno">+</button>
            </div>
            <div class="asim-list-cards">
        `;

        dateEvents.forEach(ev => {
          const colors = this.getTechColor(ev.technician);
          const duration = parseFloat(ev.duration) || 1;
          const endTime = this.calculateEndTime(ev.time, duration);
          const durationLabel = this.formatDuration(duration);
          html += `
            <div class="asim-list-card" data-id="${ev.id}">
              <div class="asim-list-card-main">
                <div class="asim-list-card-header">
                  <span class="asim-badge asim-badge-code">${ev.jobCode}</span>
                  <span class="asim-list-card-time">${ev.time} - ${endTime}</span>
                  <span class="asim-occupy-badge" style="font-size:0.65rem;">⏱️ ${durationLabel}</span>
                  <h3 class="asim-list-card-title">${this.escapeHtml(ev.clientName)}</h3>
                  <span class="asim-badge asim-badge-tech" style="background:${colors.bg}; color:${colors.text}; border-color:${colors.border}">
                    @${ev.technician}
                  </span>
                </div>
                <div class="asim-list-card-meta">
                  ${ev.indirizzo ? `<span>📍 ${this.escapeHtml(ev.indirizzo)}</span>` : ''}
                  ${ev.telefono ? `<span>📞 ${ev.telefono}</span>` : ''}
                  ${ev.pdr ? `<span>PDR: <code>${ev.pdr}</code></span>` : ''}
                  ${ev.matricola ? `<span>Matr: <code>${ev.matricola}</code></span>` : ''}
                </div>
              </div>
              <div class="asim-list-card-action">
                <button class="asim-btn asim-btn-sm asim-btn-outline">Dettagli &rarr;</button>
              </div>
            </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });

      html += `</div>`;
      container.innerHTML = html;

      container.querySelectorAll('.asim-list-card').forEach(card => {
        card.addEventListener('click', () => {
          const ev = this.events.find(x => x.id === card.dataset.id);
          if (ev) this.openModal(ev);
        });
      });

      // Aggiungi intervento da gruppo data elenco (+)
      container.querySelectorAll('.asim-col-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCreateMode(btn.dataset.date);
        });
      });
    }

    // Apre la modale di dettaglio intervento
    // Apre la modale in modalità CREAZIONE nuovo intervento
    openCreateMode(defaultDate = null) {
      this.currentModalEvent = null;
      const root = this.container;
      const modal = root.querySelector('#asim-modal');
      const viewMode = root.querySelector('#modal-view-mode');
      const editMode = root.querySelector('#modal-edit-mode');
      const btnEdit = root.querySelector('#modal-btn-edit');
      const btnDeleteView = root.querySelector('#modal-btn-delete-view');
      const btnDelete = root.querySelector('#edit-btn-delete');
      const headerBadges = root.querySelector('#modal-header-badges');

      if (viewMode) viewMode.style.display = 'none';
      if (editMode) editMode.style.display = 'block';
      if (btnEdit) btnEdit.style.display = 'none';
      if (btnDeleteView) btnDeleteView.style.display = 'none';
      if (btnDelete) btnDelete.style.display = 'none';
      if (headerBadges) headerBadges.style.display = 'none';

      const editTitle = editMode.querySelector('h3');
      if (editTitle) editTitle.innerHTML = '➕ Nuovo Intervento';

      const saveBtn = root.querySelector('#edit-btn-save');
      if (saveBtn) saveBtn.innerHTML = '💾 Salva Intervento';

      // Precompila o svuota i campi
      root.querySelector('#edit-client').value = '';
      root.querySelector('#edit-date').value = defaultDate || this.formatISODate(this.selectedDate);
      root.querySelector('#edit-time').value = '09:30';
      root.querySelector('#edit-duration').value = '1';
      root.querySelector('#edit-tech').value = (this.activeTechnician && this.activeTechnician !== 'all') ? this.activeTechnician : '';
      root.querySelector('#edit-code').value = (this.activeJobCode && this.activeJobCode !== 'all') ? this.activeJobCode : 'A01';
      root.querySelector('#edit-address').value = '';
      root.querySelector('#edit-phone').value = '';
      root.querySelector('#edit-priority').value = '2';
      root.querySelector('#edit-pdr').value = '';
      root.querySelector('#edit-matricola').value = '';
      root.querySelector('#edit-notes').value = '';

      this.updateOccupyPreview();

      const datalist = root.querySelector('#edit-tech-datalist');
      if (datalist) {
        datalist.innerHTML = '';
        Array.from(this.technicians).forEach(tech => {
          const opt = document.createElement('option');
          opt.value = tech;
          datalist.appendChild(opt);
        });
      }

      modal.style.display = 'flex';
      setTimeout(() => {
        const clientInput = root.querySelector('#edit-client');
        if (clientInput) clientInput.focus();
      }, 50);
    }

    // Apre la modale di dettaglio intervento (Sola Lettura con tasti Modifica ed Elimina)
    openModal(ev) {
      this.currentModalEvent = ev;
      const modal = this.container.querySelector('#asim-modal');
      const colors = this.getTechColor(ev.technician);

      // Reset modalità vista/modifica
      const viewMode = this.container.querySelector('#modal-view-mode');
      const editMode = this.container.querySelector('#modal-edit-mode');
      const btnEdit = this.container.querySelector('#modal-btn-edit');
      const btnDeleteView = this.container.querySelector('#modal-btn-delete-view');
      const headerBadges = this.container.querySelector('#modal-header-badges');

      if (viewMode) viewMode.style.display = 'block';
      if (editMode) editMode.style.display = 'none';
      if (btnEdit) btnEdit.style.display = 'inline-block';
      if (btnEdit) btnEdit.style.display = 'inline-flex';
      if (btnDeleteView) btnDeleteView.style.display = 'inline-flex';
      if (headerBadges) headerBadges.style.display = 'flex';

      // Titolo e Badge
      this.container.querySelector('#modal-title').textContent = ev.clientName;
      this.container.querySelector('#modal-code').textContent = ev.jobCode || 'Intervento';

      const techBadge = this.container.querySelector('#modal-tech');
      techBadge.textContent = '@' + ev.technician;
      techBadge.style.backgroundColor = colors.bg;
      techBadge.style.color = colors.text;
      techBadge.style.borderColor = colors.border;

      const priorityBadge = this.container.querySelector('#modal-priority');
      if (ev.priority > 0) {
        priorityBadge.style.display = 'inline-block';
        priorityBadge.textContent = `Priorità ${ev.priority}`;
      } else {
        priorityBadge.style.display = 'none';
      }

      // Data e Ora
      const parts = ev.date.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const dateFormatted = d.toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      const duration = parseFloat(ev.duration) || 1;
      const endTime = this.calculateEndTime(ev.time, duration);
      const durationLabel = this.formatDuration(duration);
      this.container.querySelector('#modal-date-text').textContent = `${dateFormatted} dalle ${ev.time} alle ${endTime}`;
      const durBadge = this.container.querySelector('#modal-duration-badge');
      if (durBadge) durBadge.textContent = `⏱️ ${durationLabel}`;

      // Indirizzo
      const addrRow = this.container.querySelector('#modal-addr-row');
      const addrVal = this.container.querySelector('#modal-address');
      const mapsLink = this.container.querySelector('#modal-maps-link');
      if (ev.indirizzo) {
        addrRow.style.display = 'flex';
        addrVal.textContent = ev.indirizzo;
        mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.indirizzo)}`;
      } else {
        addrRow.style.display = 'none';
      }

      // Telefono
      const telRow = this.container.querySelector('#modal-tel-row');
      const telVal = this.container.querySelector('#modal-phone');
      const callLink = this.container.querySelector('#modal-phone-link');
      if (ev.telefono) {
        telRow.style.display = 'flex';
        telVal.textContent = ev.telefono;
        const cleanPhone = ev.telefono.replace(/[^0-9+]/g, '');
        callLink.href = `tel:${cleanPhone}`;
      } else {
        telRow.style.display = 'none';
      }

      // PDR e Matricola
      this.container.querySelector('#modal-pdr').textContent = ev.pdr || '-';
      this.container.querySelector('#modal-matricola').textContent = ev.matricola || '-';

      // Note
      const notesRow = this.container.querySelector('#modal-notes-row');
      const notesVal = this.container.querySelector('#modal-notes');
      if (ev.note) {
        notesRow.style.display = 'flex';
        notesVal.textContent = ev.note;
      } else {
        notesRow.style.display = 'none';
      }

      // Metadati
      this.container.querySelector('#modal-author').textContent = ev.author || 'Sistema';
      this.container.querySelector('#modal-raw-date').textContent = ev.rawDate ? `(Origine: ${ev.rawDate})` : '';

      modal.style.display = 'flex';
    }

    // Passa alla modalità modifica di un intervento esistente
    openEditMode(ev) {
      const root = this.container;
      const viewMode = root.querySelector('#modal-view-mode');
      const editMode = root.querySelector('#modal-edit-mode');
      const btnEdit = root.querySelector('#modal-btn-edit');
      const btnDeleteView = root.querySelector('#modal-btn-delete-view');
      const btnDelete = root.querySelector('#edit-btn-delete');
      const headerBadges = root.querySelector('#modal-header-badges');

      if (viewMode) viewMode.style.display = 'none';
      if (editMode) editMode.style.display = 'block';
      if (btnEdit) btnEdit.style.display = 'none';
      if (btnDeleteView) btnDeleteView.style.display = 'none';
      if (btnDelete) btnDelete.style.display = 'inline-flex';
      if (headerBadges) headerBadges.style.display = 'flex';

      const editTitle = editMode.querySelector('h3');
      if (editTitle) editTitle.innerHTML = '✏️ Modifica Intervento';

      const saveBtn = root.querySelector('#edit-btn-save');
      if (saveBtn) saveBtn.innerHTML = '💾 Salva Modifiche';

      root.querySelector('#edit-client').value = ev.clientName || '';
      root.querySelector('#edit-date').value = ev.date || '';
      root.querySelector('#edit-time').value = ev.time || '09:00';
      root.querySelector('#edit-duration').value = String(ev.duration || 1);
      root.querySelector('#edit-tech').value = ev.technician || '';
      root.querySelector('#edit-code').value = ev.jobCode || '';
      root.querySelector('#edit-address').value = ev.indirizzo || '';
      root.querySelector('#edit-phone').value = ev.telefono || '';
      root.querySelector('#edit-priority').value = String(ev.priority || 2);
      root.querySelector('#edit-pdr').value = ev.pdr || '';
      root.querySelector('#edit-matricola').value = ev.matricola || '';
      root.querySelector('#edit-notes').value = ev.note || '';

      this.updateOccupyPreview();

      const datalist = root.querySelector('#edit-tech-datalist');
      if (datalist) {
        datalist.innerHTML = '';
        Array.from(this.technicians).forEach(tech => {
          const opt = document.createElement('option');
          opt.value = tech;
          datalist.appendChild(opt);
        });
      }
    }

    // Apre la modale per inviare il calendario visualizzato via email
    openEmailModal() {
      const root = this.container;
      const modal = root.querySelector('#asim-email-modal');
      const filtered = this.getFilteredEvents();

      // Determina periodo ed eventi della vista corrente
      let periodLabel = '';
      let relevantEvents = [];

      if (this.currentView === 'week') {
        const cur = new Date(this.selectedDate);
        let dayOfWeek = cur.getDay() - 1;
        if (dayOfWeek === -1) dayOfWeek = 6;
        const startOfWeek = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - dayOfWeek);
        const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6);
        periodLabel = `Settimana ${startOfWeek.getDate()}/${startOfWeek.getMonth() + 1} - ${endOfWeek.getDate()}/${endOfWeek.getMonth() + 1}/${endOfWeek.getFullYear()}`;
        const startIso = this.formatISODate(startOfWeek);
        const endIso = this.formatISODate(endOfWeek);
        relevantEvents = filtered.filter(ev => ev.date >= startIso && ev.date <= endIso);
      } else if (this.currentView === 'day') {
        const iso = this.formatISODate(this.selectedDate);
        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        periodLabel = `${dayNames[this.selectedDate.getDay()]} ${this.selectedDate.getDate()}/${this.selectedDate.getMonth() + 1}/${this.selectedDate.getFullYear()}`;
        relevantEvents = filtered.filter(ev => ev.date === iso);
      } else if (this.currentView === 'month') {
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        periodLabel = `Mese di ${monthNames[this.selectedDate.getMonth()]} ${this.selectedDate.getFullYear()}`;
        const prefix = `${this.selectedDate.getFullYear()}-${String(this.selectedDate.getMonth() + 1).padStart(2, '0')}`;
        relevantEvents = filtered.filter(ev => ev.date.startsWith(prefix));
      } else {
        periodLabel = 'Tutti gli interventi visibili';
        relevantEvents = filtered;
      }

      const viewLabelEl = root.querySelector('#email-view-label');
      const viewCountEl = root.querySelector('#email-view-count');
      const subjectInput = root.querySelector('#email-subject');
      const bodyTextarea = root.querySelector('#email-body');
      const toInput = root.querySelector('#email-to');
      const presetsSelect = root.querySelector('#email-quick-presets');

      viewLabelEl.textContent = periodLabel;
      viewCountEl.textContent = `${relevantEvents.length} interventi in riepilogo`;

      // Ripristina ultimo destinatario se salvato
      try {
        toInput.value = localStorage.getItem('asim_last_email_to') || '';
      } catch (e) {}

      // Popola preset email
      presetsSelect.innerHTML = '<option value="">Destinatario rapido...</option>';
      if (this.activeTechnician && this.activeTechnician !== 'all') {
        const opt = document.createElement('option');
        opt.value = `${this.activeTechnician.toLowerCase().replace(/[^a-z0-9]/g, '')}@asimultiservices.com`;
        opt.textContent = `Tecnico @${this.activeTechnician}`;
        presetsSelect.appendChild(opt);
      }
      Array.from(this.technicians).forEach(tech => {
        if (tech !== this.activeTechnician) {
          const opt = document.createElement('option');
          opt.value = `${tech.toLowerCase().replace(/[^a-z0-9]/g, '')}@asimultiservices.com`;
          opt.textContent = `Tecnico @${tech}`;
          presetsSelect.appendChild(opt);
        }
      });
      const optAdmin = document.createElement('option');
      optAdmin.value = 'info@asimultiservices.com';
      optAdmin.textContent = 'Ufficio / Info ASIM';
      presetsSelect.appendChild(optAdmin);

      // Oggetto Email
      const techSuffix = this.activeTechnician !== 'all' ? ` (@${this.activeTechnician})` : '';
      subjectInput.value = `ASIM Multiservices - Riepilogo Interventi: ${periodLabel}${techSuffix}`;

      // Costruzione Testo Chiaro, Essenziale (Senza Icone e Senza Priorità)
      let bodyText = `ASIM MULTISERVICES SRL — PROGRAMMA INTERVENTI\n`;
      bodyText += `-----------------------------------------------------\n`;
      bodyText += `Periodo:  ${periodLabel}\n`;
      if (this.activeTechnician && this.activeTechnician !== 'all') {
        bodyText += `Tecnico:  @${this.activeTechnician}\n`;
      }
      if (this.activeJobCode && this.activeJobCode !== 'all') {
        bodyText += `Codice:   ${this.activeJobCode}\n`;
      }
      bodyText += `Totale:   ${relevantEvents.length} interventi in programma\n`;
      bodyText += `Data:     ${new Date().toLocaleDateString('it-IT')} ore ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}\n`;
      bodyText += `-----------------------------------------------------\n\n`;

      let htmlCards = '';

      if (relevantEvents.length === 0) {
        bodyText += `Nessun intervento programmato per il periodo selezionato.\n\n`;
        htmlCards = `<div style="padding: 24px; text-align: center; color: #64748b;">Nessun intervento programmato per il periodo selezionato.</div>`;
      } else {
        const grouped = {};
        relevantEvents.forEach(ev => {
          if (!grouped[ev.date]) grouped[ev.date] = [];
          grouped[ev.date].push(ev);
        });

        const sortedDates = Object.keys(grouped).sort();
        sortedDates.forEach(dateStr => {
          const parts = dateStr.split('-');
          const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          const dateFormatted = dateObj.toLocaleDateString('it-IT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          const capitalizedDate = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

          const dayList = grouped[dateStr];
          dayList.sort((a, b) => a.time.localeCompare(b.time));

          bodyText += `${capitalizedDate} (${dayList.length} ${dayList.length === 1 ? 'intervento' : 'interventi'})\n`;
          bodyText += `-----------------------------------------------------\n\n`;

          htmlCards += `
            <div style="margin-top: 18px; margin-bottom: 10px;">
              <div style="background-color: #f1f5f9; padding: 10px 14px; font-weight: 700; font-size: 14px; border-left: 4px solid #0284c7; color: #0f172a; border-radius: 4px;">
                ${capitalizedDate} (${dayList.length} interventi)
              </div>
            </div>
          `;

          dayList.forEach((ev) => {
            const duration = parseFloat(ev.duration) || 1;
            const endTime = this.calculateEndTime(ev.time, duration);
            const timeRange = (ev.time && endTime) ? `${ev.time} - ${endTime}` : (ev.time || 'Orario non specificato');
            const tipo = (ev.jobCode && ev.jobCode !== 'Altro') ? ev.jobCode : (ev.clientName || 'Intervento');
            const address = ev.indirizzo || 'Indirizzo non specificato';
            const cleanNote = ev.note ? ev.note.replace(/^NOTE:\s*/i, '').replace(/[\r\n]+/g, ' ').trim() : '';

            bodyText += `Ora: ${timeRange}\n`;
            bodyText += `Tipologia: ${tipo}\n`;
            bodyText += `Indirizzo: ${address}\n`;
            if (cleanNote) {
              bodyText += `Note: ${cleanNote}\n`;
            }
            bodyText += `\n`;

            htmlCards += `
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <div style="font-size: 13px; color: #0f172a; line-height: 1.6;">
                  <div><strong>Ora:</strong> <span style="color: #0284c7; font-weight: 600;">${this.escapeHtml(timeRange)}</span></div>
                  <div><strong>Tipologia:</strong> <span style="background-color: #f1f5f9; color: #334155; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${this.escapeHtml(tipo)}</span></div>
                  <div><strong>Indirizzo:</strong> ${this.escapeHtml(address)}</div>
                  ${cleanNote ? `<div style="margin-top: 4px; color: #475569;"><strong>Note:</strong> <em>${this.escapeHtml(cleanNote)}</em></div>` : ''}
                </div>
              </div>
            `;
          });
        });
      }

      bodyText += `-----------------------------------------------------\n`;
      bodyText += `Consulta il calendario online:\n`;
      bodyText += `https://www.asimultiservices.com/calendario\n\n`;
      bodyText += `ASIM Multiservices SRL\n`;

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0; padding:16px; background-color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden;">
            <div style="background-color:#0284c7; color:#ffffff; padding:16px 20px;">
              <h2 style="margin:0; font-size:18px;">ASIM Multiservices SRL — Programma Interventi</h2>
              <div style="font-size:13px; opacity:0.95; margin-top:4px;">Periodo: <strong>${periodLabel}</strong> &nbsp;|&nbsp; Totale: <strong>${relevantEvents.length}</strong> interventi</div>
            </div>
            <div style="padding:16px 20px;">
              ${htmlCards}
              <div style="margin-top:20px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:12px; color:#64748b; text-align:center;">
                <a href="https://www.asimultiservices.com/calendario" style="color:#0284c7; font-weight:600; text-decoration:none;">Apri il calendario online &rarr;</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      this._lastGeneratedEmailText = bodyText;
      this._lastGeneratedEmailHtml = fullHtml;

      bodyTextarea.value = bodyText;
      modal.style.display = 'flex';
      setTimeout(() => toInput.focus(), 50);
    }

    showToast(message, type = 'info') {
      const toast = this.container.querySelector('#asim-toast');
      if (!toast) return;
      toast.textContent = message;
      toast.className = 'asim-toast asim-toast-' + type;
      toast.style.display = 'block';
      clearTimeout(this._toastTimeout);
      this._toastTimeout = setTimeout(() => {
        toast.style.display = 'none';
      }, 3500);
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }

  return {
    init: function (options) {
      return new CalendarInstance(options);
    }
  };
}));
