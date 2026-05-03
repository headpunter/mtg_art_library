'use strict';
// Relies on $ / $$ / api / escapeHtml defined in app.js (loaded first via base.html)

/* ── state ───────────────────────────────────────────────────────── */
let parsedRows = [];
let selections = {};      // slug -> printing_id
let selectedFormat = 'png';

/* ── elements ────────────────────────────────────────────────────── */
const deckInput      = document.getElementById('deckInput');
const btnParse       = document.getElementById('btnParse');
const btnImportXml   = document.getElementById('btnImportXml');
const xmlFileInput   = document.getElementById('xmlFileInput');
const importNote     = document.getElementById('importNote');
const btnFetchMissing = document.getElementById('btnFetchMissing');
const fetchNote      = document.getElementById('fetchNote');
const btnBuild       = document.getElementById('btnBuild');
const buildEmpty     = document.getElementById('buildEmpty');
const buildTableWrap = document.getElementById('buildTableWrap');
const deckBody       = document.getElementById('deckBody');
const buildFooter    = document.getElementById('buildFooter');
const footerSummary  = document.getElementById('footerSummary');
const formatSeg      = document.getElementById('formatSeg');
const pdfLayoutSel   = document.getElementById('pdfLayoutSel');

/* ── init ────────────────────────────────────────────────────────── */
{
  const saved = localStorage.getItem('build_decklist');
  if (saved) deckInput.value = saved;

  deckInput.addEventListener('input', () => {
    localStorage.setItem('build_decklist', deckInput.value);
    schedParse();
  });
  btnParse.addEventListener('click', () => parseDeck());
  btnBuild.addEventListener('click', buildDeck);

  btnImportXml.addEventListener('click', () => xmlFileInput.click());
  xmlFileInput.addEventListener('change', importMpcFillXml);
  btnFetchMissing.addEventListener('click', fetchMissingFromAutofill);

  formatSeg.addEventListener('click', e => {
    const btn = e.target.closest('.fmt-btn');
    if (!btn || btn.disabled) return;
    Array.from(formatSeg.querySelectorAll('.fmt-btn'))
      .forEach(b => b.classList.toggle('active', b === btn));
    selectedFormat = btn.dataset.fmt;
    pdfLayoutSel.hidden = selectedFormat !== 'pdf';
  });

  if (saved && saved.trim()) parseDeck();
}

/* ── parse (debounced) ───────────────────────────────────────────── */
let parseTimer = null;

function schedParse() {
  clearTimeout(parseTimer);
  parseTimer = setTimeout(parseDeck, 500);
}

async function parseDeck() {
  clearTimeout(parseTimer);
  const text = deckInput.value.trim();
  if (!text) { clearTable(); return; }

  btnParse.disabled = true;
  btnParse.textContent = 'Parsing…';
  try {
    const data = await api('/api/parse-decklist', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    parsedRows = data.rows;
    updateStats(data.stats);
    renderTable(data.rows);
  } catch (e) {
    console.error('parse error', e);
  } finally {
    btnParse.disabled = false;
    btnParse.textContent = 'Parse';
  }
}

/* ── table render ────────────────────────────────────────────────── */
function clearTable() {
  buildEmpty.hidden = false;
  buildTableWrap.hidden = true;
  buildFooter.hidden = true;
  parsedRows = [];
  updateStats({ unique: 0, ok: 0, pick: 0, missing: 0, total_qty: 0 });
}

function renderTable(rows) {
  if (!rows.length) { clearTable(); return; }
  buildEmpty.hidden = true;
  buildTableWrap.hidden = false;
  buildFooter.hidden = false;

  deckBody.innerHTML = '';
  for (const row of rows) {
    if (!selections[row.slug] || !row.printings.find(p => p.id === selections[row.slug])) {
      selections[row.slug] = row.selected;
    }
    deckBody.appendChild(buildRow(row));
  }
  updateSummary();
  updateBuildButton();
}

function buildRow(row) {
  const tr = document.createElement('tr');
  tr.className = `deck-row row-${row.status}`;
  tr.dataset.slug = row.slug;
  tr.dataset.status = row.status;

  // qty
  const tdQty = document.createElement('td');
  tdQty.className = 'col-qty';
  tdQty.textContent = row.qty + '×';

  // card name + inline job strip
  const tdCard = document.createElement('td');
  tdCard.className = 'col-card';
  tdCard.innerHTML =
    `<span class="status-dot dot-${row.status}"></span>` +
    `<span class="row-name">${escapeHtml(row.name)}</span>` +
    `<div class="job-strip" id="strip-${escapeHtml(row.slug)}" hidden></div>`;

  // printing selector
  const tdPrinting = document.createElement('td');
  tdPrinting.className = 'col-printing';
  tdPrinting.id = `printing-${row.slug}`;
  renderPrintingCell(row, tdPrinting);

  // action
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';
  if (row.status === 'missing') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-find';
    btn.textContent = 'Find';
    btn.addEventListener('click', () => toggleFindPanel(row, tr));
    tdAction.appendChild(btn);
  }

  tr.append(tdQty, tdCard, tdPrinting, tdAction);
  return tr;
}

function renderPrintingCell(row, td) {
  if (row.status === 'missing' || !row.printings.length) {
    td.innerHTML = '<span class="no-printing">not in library</span>';
    return;
  }
  if (row.printings.length === 1) {
    td.innerHTML = `<span class="printing-label">${escapeHtml(printingLabel(row.printings[0]))}</span>`;
    return;
  }
  const sel = document.createElement('select');
  sel.className = 'printing-sel';
  for (const p of row.printings) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = printingLabel(p);
    if (p.id === selections[row.slug]) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    selections[row.slug] = sel.value;
    updateSummary();
  });
  td.innerHTML = '';
  td.appendChild(sel);
}

function printingLabel(p) {
  if (p.set && p.collector_number) {
    return `${p.set.toUpperCase()} #${p.collector_number} · ${p.bleed}`;
  }
  return `${p.tag || p.id} · ${p.bleed}`;
}

/* ── find panel (MPC AutoFill + Scryfall picker for missing cards) ── */
function toggleFindPanel(row, tr) {
  const existing = tr.nextElementSibling;
  if (existing && existing.classList.contains('find-row')) {
    existing.remove();
    return;
  }
  const findTr = document.createElement('tr');
  findTr.className = 'find-row';
  findTr.dataset.forSlug = row.slug;

  const td = document.createElement('td');
  td.colSpan = 4;
  td.className = 'find-cell';
  td.innerHTML =
    `<div class="find-panel">` +
      `<div class="find-header">` +
        `<span class="find-title"><em>${escapeHtml(row.name)}</em></span>` +
        `<div class="find-tabs">` +
          `<button class="find-tab active" data-tab="autofill">MPC AutoFill</button>` +
          `<button class="find-tab" data-tab="scryfall">Scryfall</button>` +
        `</div>` +
        `<button class="btn-icon close-find" title="Close">×</button>` +
      `</div>` +
      `<div class="find-results" id="find-res-${escapeHtml(row.slug)}">` +
        `<span class="hint-dim">Loading…</span>` +
      `</div>` +
    `</div>`;

  td.querySelector('.close-find').addEventListener('click', () => findTr.remove());
  td.querySelectorAll('.find-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      td.querySelectorAll('.find-tab').forEach(t => t.classList.toggle('active', t === tab));
      loadFindResults(row, findTr, tab.dataset.tab);
    });
  });

  findTr.appendChild(td);
  tr.after(findTr);
  loadFindResults(row, findTr, 'autofill');
}

async function loadFindResults(row, findTr, tab) {
  const container = findTr.querySelector('.find-results');
  container.innerHTML = `<span class="hint-dim">Loading…</span>`;
  if (tab === 'autofill') {
    await loadAutofillResults(row, findTr, container);
  } else {
    await loadScryfallResults(row, findTr, container);
  }
}

async function loadAutofillResults(row, findTr, container) {
  try {
    const r = await api(`/api/mpcautofill/search?name=${encodeURIComponent(row.name)}`);
    if (r.error || !r.results?.length) {
      container.innerHTML = `<span class="hint-dim">${escapeHtml(r.error || 'No art found on MPC AutoFill')}</span>`;
      return;
    }
    container.innerHTML = r.results.map(p => {
      const isPref = p.preferredRank !== null && p.preferredRank !== undefined;
      return (
        `<div class="find-pick autofill-pick"` +
          ` data-identifier="${escapeHtml(p.identifier || '')}"` +
          ` data-source="${escapeHtml(p.source || '')}"` +
          ` data-extension="${escapeHtml(p.extension || 'jpg')}">` +
          `<img src="${escapeHtml(p.thumbnailUrl || '')}" alt="" loading="lazy">` +
          `<div class="find-pick-meta">` +
            `<span class="fp-set">` +
              (isPref ? `<span class="pref-badge">★</span> ` : '') +
              escapeHtml(p.sourceName || p.source || '—') +
            `</span>` +
            `<span class="fp-num">${p.dpi ? p.dpi + ' DPI' : '—'}</span>` +
          `</div>` +
        `</div>`
      );
    }).join('');
    container.querySelectorAll('.autofill-pick').forEach(el => {
      el.addEventListener('click', () => {
        ingestAutofillForRow(row, el.dataset.identifier, el.dataset.source,
                             el.dataset.extension, findTr);
      });
    });
  } catch (e) {
    container.innerHTML = `<span class="hint-dim">Failed to reach MPC AutoFill</span>`;
  }
}

async function loadScryfallResults(row, findTr, container) {
  try {
    const r = await api(`/api/scryfall/printings?name=${encodeURIComponent(row.name)}`);
    if (r.error || !r.top?.length) {
      container.innerHTML = `<span class="hint-dim">${escapeHtml(r.error || 'No printings found')}</span>`;
      return;
    }
    container.innerHTML = r.top.map(p =>
      `<div class="find-pick${p.foil_only ? ' foil' : ''}"
            data-set="${escapeHtml(p.set)}" data-num="${escapeHtml(p.collector_number)}">
        <img src="${escapeHtml(p.image_normal || '')}" alt="" loading="lazy">
        <div class="find-pick-meta">
          <span class="fp-set">${escapeHtml(p.set.toUpperCase())} · ${escapeHtml(p.set_name)}</span>
          <span class="fp-num">#${escapeHtml(p.collector_number)} · ${escapeHtml(p.released_at || '')}</span>
          <span class="fp-price">${p.price ? '$' + p.price.toFixed(2) : '—'}${p.foil_only ? ' · foil only' : ''}</span>
        </div>
      </div>`
    ).join('');
    container.querySelectorAll('.find-pick').forEach(el => {
      el.addEventListener('click', () => {
        ingestForRow(row, el.dataset.set, el.dataset.num, findTr);
      });
    });
  } catch (e) {
    container.innerHTML = `<span class="hint-dim">Failed to load printings</span>`;
  }
}

async function ingestAutofillForRow(row, identifier, source, extension, findTr) {
  const tr = findTr.previousElementSibling;
  findTr.remove();

  const strip = tr.querySelector('.job-strip');
  strip.hidden = false;
  strip.textContent = 'Starting…';

  const findBtn = tr.querySelector('.btn-find');
  if (findBtn) findBtn.disabled = true;

  try {
    const job = await api('/api/ingest/mpcautofill-card', {
      method: 'POST',
      body: JSON.stringify({
        name: row.name, identifier, source, extension, make_default: true,
      }),
    });
    await pollRowJob(job.id, strip, findBtn);
  } catch (e) {
    strip.textContent = '✕ ' + e.message;
    if (findBtn) findBtn.disabled = false;
  }
}

async function ingestForRow(row, setCode, collNum, findTr) {
  const tr = findTr.previousElementSibling;
  findTr.remove();

  const strip = tr.querySelector('.job-strip');
  strip.hidden = false;
  strip.textContent = 'Starting…';

  const findBtn = tr.querySelector('.btn-find');
  if (findBtn) findBtn.disabled = true;

  try {
    const job = await api('/api/ingest/scryfall', {
      method: 'POST',
      body: JSON.stringify({ name: row.name, set: setCode, num: collNum, make_default: true }),
    });
    await pollRowJob(job.id, strip, findBtn);
  } catch (e) {
    strip.textContent = '✕ ' + e.message;
    if (findBtn) findBtn.disabled = false;
  }
}

async function pollRowJob(jid, strip, findBtn) {
  while (true) {
    await new Promise(r => setTimeout(r, 1200));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;
    strip.textContent = j.error || j.progress || j.state;
    if (j.state === 'done') {
      strip.textContent = '✓ Added — re-parsing…';
      setTimeout(() => parseDeck(), 600);
      return;
    }
    if (j.state === 'failed') {
      strip.textContent = '✕ ' + (j.error || 'Failed');
      if (findBtn) findBtn.disabled = false;
      return;
    }
  }
}

/* ── stats + summary ─────────────────────────────────────────────── */
function updateStats(s) {
  document.getElementById('statUnique').textContent  = s.unique  ?? 0;
  document.getElementById('statOk').textContent      = s.ok      ?? 0;
  document.getElementById('statPick').textContent    = s.pick    ?? 0;
  document.getElementById('statMissing').textContent = s.missing ?? 0;
}

function updateSummary() {
  const missing  = parsedRows.filter(r => r.status === 'missing').length;
  const ok       = parsedRows.filter(r => r.status === 'ok').length;
  const pick     = parsedRows.filter(r => r.status === 'pick').length;
  const totalQty = parsedRows.reduce((s, r) => s + r.qty, 0);

  footerSummary.innerHTML =
    `<span class="chip chip-ink">${parsedRows.length} unique · ${totalQty} cards</span>` +
    `<span class="chip chip-ok">${ok} ready</span>` +
    (pick    ? `<span class="chip chip-pick">${pick} to pick</span>`       : '') +
    (missing ? `<span class="chip chip-missing">${missing} missing</span>` : '');
}

function updateBuildButton() {
  const missing = parsedRows.filter(r => r.status === 'missing').length;
  const empty   = parsedRows.length === 0;
  btnBuild.disabled = missing > 0 || empty;
  btnBuild.textContent = missing > 0 ? `Fix ${missing} first` : 'Build →';

  btnFetchMissing.hidden = missing === 0;
  btnFetchMissing.textContent =
    `Fetch ${missing} missing from MPC AutoFill`;
}

/* ── build ───────────────────────────────────────────────────────── */
async function buildDeck() {
  if (btnBuild.disabled) return;

  const rows = parsedRows.map(r => ({
    slug:        r.slug,
    printing_id: selections[r.slug] || r.selected,
    qty:         r.qty,
    name:        r.name,
  }));

  const buildPayload = { rows, format: selectedFormat };
  if (selectedFormat === 'pdf') buildPayload.layout = pdfLayoutSel.value;

  btnBuild.disabled = true;
  btnBuild.textContent = 'Building…';

  const statusChip = document.createElement('span');
  statusChip.className = 'chip chip-accent';
  statusChip.id = 'buildStatusChip';
  statusChip.textContent = 'Starting build…';
  footerSummary.appendChild(statusChip);

  try {
    const job = await api('/api/build', {
      method: 'POST',
      body: JSON.stringify(buildPayload),
    });
    await pollBuildJob(job.id, statusChip);
  } catch (e) {
    statusChip.textContent = '✕ ' + e.message;
    btnBuild.disabled = false;
    btnBuild.textContent = 'Build →';
  }
}

/* ── MPC AutoFill bulk ingest ────────────────────────────────────── */

async function fetchMissingFromAutofill() {
  const missingRows = parsedRows.filter(r => r.status === 'missing');
  if (!missingRows.length) return;

  btnFetchMissing.disabled = true;
  fetchNote.hidden = false;
  fetchNote.style.color = '';
  fetchNote.textContent = `Querying MPC AutoFill for ${missingRows.length} cards…`;

  const names = missingRows.map(r => r.name);

  try {
    const job = await api('/api/ingest/mpcautofill-bulk', {
      method: 'POST',
      body: JSON.stringify({ names, make_default: true }),
    });
    await pollFetchJob(job.id);
  } catch (e) {
    fetchNote.textContent = '✕ ' + e.message;
    fetchNote.style.color = 'var(--red)';
    btnFetchMissing.disabled = false;
  }
}

async function pollFetchJob(jid) {
  while (true) {
    await new Promise(r => setTimeout(r, 1500));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;

    fetchNote.textContent = j.progress || j.state;

    if (j.state === 'done') {
      const r = j.result || {};
      const ok      = (r.ok      || []).length;
      const missing = (r.missing || []).length;
      const failed  = (r.failed  || []).length;

      let msg = `✓ ${ok} added`;
      if (missing) msg += ` · ${missing} not found on MPC AutoFill`;
      if (failed)  msg += ` · ${failed} failed`;
      fetchNote.textContent = msg;

      btnFetchMissing.disabled = false;
      if (ok > 0) setTimeout(() => parseDeck(), 800);
      return;
    }

    if (j.state === 'failed') {
      fetchNote.textContent = '✕ ' + (j.error || 'Ingest failed');
      fetchNote.style.color = 'var(--red)';
      btnFetchMissing.disabled = false;
      return;
    }
  }
}

/* ── MPCFill XML import ──────────────────────────────────────────── */

async function importMpcFillXml() {
  const file = xmlFileInput.files[0];
  if (!file) return;

  btnImportXml.disabled = true;
  btnImportXml.textContent = 'Parsing…';
  importNote.hidden = true;

  try {
    const xml = await file.text();
    const res  = await fetch('/api/import-mpcfill-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xml,
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    deckInput.value = data.decklist;
    localStorage.setItem('build_decklist', data.decklist);

    importNote.hidden = false;
    importNote.textContent =
      `Imported ${data.unique} cards (${data.total_qty} total)` +
      (data.tokens_skipped ? ` · ${data.tokens_skipped} token slots skipped` : '');

    await parseDeck();
  } catch (e) {
    importNote.hidden = false;
    importNote.textContent = '✕ ' + e.message;
    importNote.style.color = 'var(--red)';
  } finally {
    btnImportXml.disabled = false;
    btnImportXml.textContent = 'Import XML';
    xmlFileInput.value = '';
  }
}

async function pollBuildJob(jid, chip) {
  while (true) {
    await new Promise(r => setTimeout(r, 1200));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;
    chip.textContent = j.error || j.progress || j.state;

    if (j.state === 'done') {
      const dlUrl = j.result?.download_url;
      if (dlUrl) {
        chip.innerHTML = `✓ Done — <a class="download-link" href="${escapeHtml(dlUrl)}">Download ZIP</a>`;
      } else {
        chip.textContent = '✓ Done';
      }
      btnBuild.disabled = false;
      btnBuild.textContent = 'Build →';
      return;
    }
    if (j.state === 'failed') {
      chip.textContent = '✕ ' + (j.error || 'Build failed');
      btnBuild.disabled = false;
      btnBuild.textContent = 'Build →';
      return;
    }
  }
}
