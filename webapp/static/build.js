'use strict';
// Relies on $ / $$ / api / escapeHtml defined in app.js (loaded first via base.html)

/* ── state ───────────────────────────────────────────────────────── */
let parsedRows = [];
let selections = {};      // slug -> printing_id
let selectedFormat = 'png';

/* ── element lookup (throws immediately if page HTML is stale) ───── */
function req(id) {
  const el = document.getElementById(id);
  if (!el) {
    document.body.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:center;height:100vh;` +
      `font-family:monospace;font-size:14px;color:#b58a3a;flex-direction:column;gap:12px">` +
      `<span style="font-size:32px">⌬</span>` +
      `<span>Page is outdated — press <kbd>Ctrl+Shift+R</kbd> (or Cmd+Shift+R) to reload.</span>` +
      `<span style="color:#6b6452;font-size:11px">Missing element: #${id}</span>` +
      `</div>`;
    throw new Error(`Required element #${id} not found — stale page`);
  }
  return el;
}

/* ── elements ────────────────────────────────────────────────────── */
const deckInput       = req('deckInput');
const btnParse        = req('btnParse');
const btnImportXml    = req('btnImportXml');
const xmlFileInput    = req('xmlFileInput');
const importNote      = req('importNote');
const btnIngestXml    = req('btnIngestXml');
const xmlArtFileInput = req('xmlArtFileInput');
const ingestNote      = req('ingestNote');
const btnFetchPinned  = req('btnFetchPinned');
const fetchPinnedNote = req('fetchPinnedNote');
const btnBuild        = req('btnBuild');
const buildEmpty      = req('buildEmpty');
const buildTableWrap  = req('buildTableWrap');
const deckBody        = req('deckBody');
const buildFooter     = req('buildFooter');
const footerSummary   = req('footerSummary');
const formatSeg       = req('formatSeg');
const pdfLayoutSel    = req('pdfLayoutSel');
const cardbackSel     = req('cardbackSel');
const tokensPanel     = req('tokensPanel');
const tokensList      = req('tokensList');
const tokensHint      = req('tokensHint');
const findPane        = req('findPane');
const findPaneTitle   = req('findPaneTitle');
const findPaneResults = req('findPaneResults');
const findPaneClose   = req('findPaneClose');
const viewToggle      = req('viewToggle');
const artGridWrap     = req('artGridWrap');
const artGrid         = req('artGrid');
const printPickPane   = req('printPickPane');
const printPickTitle  = req('printPickTitle');
const printPickBody   = req('printPickBody');
const printPickClose  = req('printPickClose');
const deckNameInput   = req('deckNameInput');
const btnSaveDeck     = req('btnSaveDeck');
const savedDecksList  = req('savedDecksList');

let _findRow    = null;   // the deck row currently open in the find pane
let _activeView = 'table';   // 'table' | 'art'

/* ── parse (debounced) ───────────────────────────────────────────── */
let parseTimer = null;

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
  btnIngestXml.addEventListener('click', () => xmlArtFileInput.click());
  xmlArtFileInput.addEventListener('change', ingestArtFromXml);
  btnFetchPinned.addEventListener('click', fetchPinnedPrintings);

  findPaneClose.addEventListener('click', closeFindPane);
  printPickClose.addEventListener('click', closePrintPicker);
  viewToggle.addEventListener('click', e => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    viewToggle.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
    setView(btn.dataset.view);
  });
  btnSaveDeck.addEventListener('click', saveDeck);
  loadSavedDecks();

  formatSeg.addEventListener('click', e => {
    const btn = e.target.closest('.fmt-btn');
    if (!btn || btn.disabled) return;
    Array.from(formatSeg.querySelectorAll('.fmt-btn'))
      .forEach(b => b.classList.toggle('active', b === btn));
    selectedFormat = btn.dataset.fmt;
    pdfLayoutSel.hidden = selectedFormat !== 'pdf';
    cardbackSel.hidden  = selectedFormat !== 'xml';
  });

  // Load cardbacks into dropdown
  fetch('/api/cardbacks').then(r => r.json()).then(data => {
    cardbackSel.innerHTML = '<option value="">— no cardback —</option>';
    for (const cb of data.cardbacks) {
      const opt = document.createElement('option');
      opt.value = cb.key;
      opt.textContent = cb.name + (cb.is_default ? ' ★' : '');
      if (cb.is_default) opt.selected = true;
      cardbackSel.appendChild(opt);
    }
  }).catch(() => {});

  if (saved && saved.trim()) parseDeck();
}

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
  let data;
  try {
    data = await api('/api/parse-decklist', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error('parse API error', e);
    btnParse.disabled = false;
    btnParse.textContent = 'Parse';
    return;
  }
  parsedRows = data.rows;
  updateStats(data.stats);
  renderTable(data.rows);
  renderTokens(data.tokens_needed || []);
  btnParse.disabled = false;
  btnParse.textContent = 'Parse';
}

/* ── table render ────────────────────────────────────────────────── */
function clearTable() {
  buildEmpty.hidden = false;
  buildTableWrap.hidden = true;
  artGridWrap.hidden = true;
  buildFooter.hidden = true;
  tokensPanel.hidden = true;
  viewToggle.hidden = true;
  parsedRows = [];
  updateStats({ unique: 0, ok: 0, pick: 0, missing: 0, total_qty: 0 });
}

function renderTable(rows) {
  if (!rows.length) { clearTable(); return; }
  buildEmpty.hidden = true;
  viewToggle.hidden = false;
  buildFooter.hidden = false;

  for (const row of rows) {
    if (!selections[row.slug] || !row.printings.find(p => p.id === selections[row.slug])) {
      selections[row.slug] = row.selected;
    }
  }

  if (_activeView === 'art') {
    buildTableWrap.hidden = true;
    artGridWrap.hidden = false;
    renderArtGrid(rows);
  } else {
    buildTableWrap.hidden = false;
    artGridWrap.hidden = true;
    deckBody.innerHTML = '';
    for (const row of rows) deckBody.appendChild(buildRow(row));
  }
  updateSummary();
  updateBuildButton();
}

function setView(view) {
  _activeView = view;
  if (!parsedRows.length) return;
  closePrintPicker();
  closeFindPane();
  if (view === 'art') {
    buildTableWrap.hidden = true;
    artGridWrap.hidden = false;
    renderArtGrid(parsedRows);
  } else {
    artGridWrap.hidden = true;
    buildTableWrap.hidden = false;
    deckBody.innerHTML = '';
    for (const row of parsedRows) deckBody.appendChild(buildRow(row));
  }
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
  // Multiple printings — show horizontal thumbnail strip
  const strip = document.createElement('div');
  strip.className = 'print-strip';
  for (const p of row.printings) {
    const selected = p.id === selections[row.slug];
    const tile = document.createElement('div');
    tile.className = 'print-strip-tile' + (selected ? ' selected' : '');
    tile.dataset.pid = p.id;
    const label = p.set && p.collector_number
      ? `${p.set.toUpperCase()} #${p.collector_number}`
      : (p.tag || p.id);
    tile.innerHTML =
      `<img src="/thumb/${encodeURIComponent(row.slug)}/${encodeURIComponent(p.id)}" alt="" loading="lazy">` +
      `<span class="print-strip-label">${escapeHtml(label)}</span>`;
    tile.addEventListener('click', () => {
      selections[row.slug] = p.id;
      strip.querySelectorAll('.print-strip-tile').forEach(t =>
        t.classList.toggle('selected', t.dataset.pid === p.id)
      );
      updateSummary();
      updateBuildButton();
    });
    strip.appendChild(tile);
  }
  td.appendChild(strip);
}

function printingLabel(p) {
  if (p.set && p.collector_number) {
    return `${p.set.toUpperCase()} #${p.collector_number} · ${p.bleed}`;
  }
  return `${p.tag || p.id} · ${p.bleed}`;
}

/* ── tokens panel ───────────────────────────────────────────────── */

function renderTokens(tokens) {
  if (!tokens.length) { tokensPanel.hidden = true; return; }

  tokensPanel.hidden = false;
  const missing = tokens.filter(t => !t.in_library).length;
  tokensHint.textContent = missing
    ? `${missing} not in library — click Find to add`
    : 'all in library';

  tokensList.innerHTML = tokens.map(t => {
    const producers = t.produced_by.slice(0, 3).map(escapeHtml).join(', ')
      + (t.produced_by.length > 3 ? ` +${t.produced_by.length - 3}` : '');
    const statusCls = t.in_library ? 'tok-ok' : 'tok-missing';
    const statusDot = t.in_library ? '✓' : '?';
    return (
      `<div class="token-row" data-slug="${escapeHtml(t.slug)}" data-name="${escapeHtml(t.name)}">` +
        `<span class="tok-dot ${statusCls}">${statusDot}</span>` +
        `<span class="tok-name">${escapeHtml(t.name)}</span>` +
        `<span class="tok-producers dim">${producers}</span>` +
        (!t.in_library
          ? `<button class="btn btn-find tok-find" data-name="${escapeHtml(t.name)}">Find</button>`
          : '') +
      `</div>`
    );
  }).join('');

  tokensList.querySelectorAll('.tok-find').forEach(btn => {
    btn.addEventListener('click', () => openTokenFinder(btn.dataset.name));
  });
}

function openTokenFinder(tokenName) {
  _findRow = { slug: `__token__${tokenName}`, name: tokenName, _isToken: true };
  findPaneTitle.innerHTML = `Token: <em>${escapeHtml(tokenName)}</em>`;
  findPane.hidden = false;
  findPane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadTokenResults(tokenName);
}

async function loadTokenResults(tokenName) {
  findPaneResults.innerHTML = `<span class="hint-dim">Loading token printings…</span>`;
  try {
    const r = await api(`/api/scryfall/token-printings?name=${encodeURIComponent(tokenName)}`);
    if (r.error || !r.printings?.length) {
      findPaneResults.innerHTML = `<span class="hint-dim">${escapeHtml(r.error || 'No token printings found')}</span>`;
      return;
    }
    findPaneResults.innerHTML = r.printings.map(p =>
      `<div class="find-pick" data-set="${escapeHtml(p.set)}" data-num="${escapeHtml(p.collector_number)}">` +
        `<img src="${escapeHtml(p.image_normal || '')}" alt="" loading="lazy">` +
        `<div class="find-pick-meta">` +
          `<span class="fp-set">${escapeHtml(p.set.toUpperCase())} · ${escapeHtml(p.set_name)}</span>` +
          `<span class="fp-num">#${escapeHtml(p.collector_number)} · ${escapeHtml(p.released_at || '')}</span>` +
        `</div>` +
      `</div>`
    ).join('');
    findPaneResults.querySelectorAll('.find-pick').forEach(el => {
      el.addEventListener('click', () => {
        ingestForRow({ name: tokenName, slug: `__token__${tokenName}` }, el.dataset.set, el.dataset.num);
      });
    });
  } catch (e) {
    findPaneResults.innerHTML = `<span class="hint-dim">Failed to load token printings</span>`;
  }
}

/* ── find pane (top panel for art selection) ─────────────────────── */
function closeFindPane() {
  findPane.hidden = true;
  _findRow = null;
}

function toggleFindPanel(row, tr) {
  if (_findRow && _findRow.slug === row.slug) {
    closeFindPane();
    return;
  }
  _findRow = row;
  findPaneTitle.innerHTML = `<em>${escapeHtml(row.name)}</em>`;
  findPane.hidden = false;
  findPane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadFindResults(row);
}

async function loadFindResults(row) {
  findPaneResults.innerHTML = `<span class="hint-dim">Loading…</span>`;
  await loadScryfallResults(row);
}

async function loadScryfallResults(row) {
  try {
    const r = await api(`/api/scryfall/printings?name=${encodeURIComponent(row.name)}`);
    if (r.error || !r.top?.length) {
      findPaneResults.innerHTML = `<span class="hint-dim">${escapeHtml(r.error || 'No printings found')}</span>`;
      return;
    }
    findPaneResults.innerHTML = r.top.map(p =>
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
    findPaneResults.querySelectorAll('.find-pick').forEach(el => {
      el.addEventListener('click', () => {
        ingestForRow(row, el.dataset.set, el.dataset.num);
      });
    });
  } catch (e) {
    findPaneResults.innerHTML = `<span class="hint-dim">Failed to load printings</span>`;
  }
}

function _findRowTr(row) {
  return deckBody.querySelector(`tr[data-slug="${CSS.escape(row.slug)}"]`);
}

async function ingestForRow(row, setCode, collNum) {
  closeFindPane();
  const tr = _findRowTr(row);
  const strip = tr?.querySelector('.job-strip');
  const findBtn = tr?.querySelector('.btn-find');
  if (strip) { strip.hidden = false; strip.textContent = 'Starting…'; }
  if (findBtn) findBtn.disabled = true;

  try {
    const job = await api('/api/ingest/scryfall', {
      method: 'POST',
      body: JSON.stringify({ name: row.name, set: setCode, num: collNum, make_default: true }),
    });
    await pollRowJob(job.id, strip, findBtn);
  } catch (e) {
    if (strip) strip.textContent = '✕ ' + e.message;
    if (findBtn) findBtn.disabled = false;
  }
}

async function pollRowJob(jid, strip, findBtn) {
  while (true) {
    await new Promise(r => setTimeout(r, 1200));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;
    if (strip) strip.textContent = j.error || j.progress || j.state;
    if (j.state === 'done') {
      if (strip) strip.textContent = '✓ Added — re-parsing…';
      setTimeout(() => parseDeck(), 600);
      return;
    }
    if (j.state === 'failed') {
      if (strip) strip.textContent = '✕ ' + (j.error || 'Failed');
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

  const pinned = parsedRows.filter(
    r => r.status === 'missing' && r.set_code && r.collector_num
  );
  btnFetchPinned.hidden = pinned.length === 0;
  btnFetchPinned.textContent = `Auto-fetch ${pinned.length} pinned from Scryfall`;
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
  if (selectedFormat === 'xml' && cardbackSel.value) buildPayload.cardback_key = cardbackSel.value;

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

/* ── Auto-fetch pinned printings from Scryfall ───────────────────── */

async function fetchPinnedPrintings() {
  const pinned = parsedRows.filter(
    r => r.status === 'missing' && r.set_code && r.collector_num
  );
  if (!pinned.length) return;

  btnFetchPinned.disabled = true;
  fetchPinnedNote.hidden = false;
  fetchPinnedNote.style.color = '';
  fetchPinnedNote.textContent = `Fetching ${pinned.length} cards from Scryfall…`;

  const entries = pinned.map(r => ({ name: r.name, set: r.set_code, num: r.collector_num }));

  try {
    const job = await api('/api/ingest/scryfall-pinned', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
    await pollPinnedJob(job.id, pinned.length);
  } catch (e) {
    fetchPinnedNote.textContent = '✕ ' + e.message;
    fetchPinnedNote.style.color = 'var(--red)';
    btnFetchPinned.disabled = false;
  }
}

async function pollPinnedJob(jid, total) {
  while (true) {
    await new Promise(r => setTimeout(r, 1200));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;

    fetchPinnedNote.textContent = j.progress || j.state;

    if (j.state === 'done') {
      const r = j.result || {};
      const ok     = (r.ok     || []).length;
      const failed = (r.failed || []).length;
      let msg = `✓ ${ok} of ${total} downloaded`;
      if (failed) msg += ` · ${failed} failed`;
      fetchPinnedNote.textContent = msg;
      btnFetchPinned.disabled = false;
      if (ok > 0) setTimeout(() => parseDeck(), 800);
      return;
    }

    if (j.state === 'failed') {
      fetchPinnedNote.textContent = '✕ ' + (j.error || 'Failed');
      fetchPinnedNote.style.color = 'var(--red)';
      btnFetchPinned.disabled = false;
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

/* ── Ingest art from MPCFill XML ─────────────────────────────────── */

async function ingestArtFromXml() {
  const file = xmlArtFileInput.files[0];
  if (!file) return;

  btnIngestXml.disabled = true;
  btnIngestXml.textContent = 'Reading…';
  ingestNote.hidden = false;
  ingestNote.style.color = '';
  ingestNote.textContent = 'Starting…';

  try {
    const xml = await file.text();
    const res  = await fetch('/api/ingest/mpcfill-xml-art', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xml,
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const total = data.total;
    const skipped = data.skipped_no_id;
    ingestNote.textContent =
      `Queued ${total} cards for download` +
      (skipped ? ` (${skipped} had no Drive ID, skipped)` : '') +
      ` — polling…`;

    await pollIngestXmlJob(data.id, total);
  } catch (e) {
    ingestNote.textContent = '✕ ' + e.message;
    ingestNote.style.color = 'var(--red)';
    btnIngestXml.disabled = false;
    btnIngestXml.textContent = 'Ingest art from XML';
  } finally {
    xmlArtFileInput.value = '';
  }
}

async function pollIngestXmlJob(jid, total) {
  while (true) {
    await new Promise(r => setTimeout(r, 1500));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;

    ingestNote.textContent = j.progress || j.state;

    if (j.state === 'done') {
      const r = j.result || {};
      const ok      = (r.ok      || []).length;
      const failed  = (r.failed  || []).length;
      const skipped = r.skipped_no_id || 0;
      let msg = `✓ ${ok} of ${total} downloaded`;
      if (failed)  msg += ` · ${failed} failed`;
      if (skipped) msg += ` · ${skipped} had no Drive ID`;
      ingestNote.textContent = msg;
      btnIngestXml.disabled = false;
      btnIngestXml.textContent = 'Ingest art from XML';
      if (ok > 0 && parsedRows.length) setTimeout(() => parseDeck(), 800);
      return;
    }

    if (j.state === 'failed') {
      ingestNote.textContent = '✕ ' + (j.error || 'Ingest failed');
      ingestNote.style.color = 'var(--red)';
      btnIngestXml.disabled = false;
      btnIngestXml.textContent = 'Ingest art from XML';
      return;
    }
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

/* ── art grid view ────────────────────────────────────────────────── */

function renderArtGrid(rows) {
  artGrid.innerHTML = '';
  for (const row of rows) {
    artGrid.appendChild(buildArtCard(row));
  }
}

function buildArtCard(row) {
  const pid = selections[row.slug] || row.selected;
  const printing = row.printings.find(p => p.id === pid) || row.printings[0];
  const hasArt = row.status !== 'missing' && printing;

  const div = document.createElement('div');
  div.className = `art-card art-card-${row.status}`;
  div.dataset.slug = row.slug;

  const thumbHtml = hasArt
    ? `<img src="/thumb/${encodeURIComponent(row.slug)}/${encodeURIComponent(pid)}" alt="" loading="lazy">`
    : `<div class="art-card-placeholder"><span>not in library</span></div>`;

  const printCount = row.printings.length;
  const countLabel = printCount > 1 ? `${printCount} printings` : printing
    ? (printing.set ? `${printing.set.toUpperCase()} #${printing.collector_number || ''}` : (printing.tag || ''))
    : '';

  div.innerHTML =
    `<div class="art-card-thumb">${thumbHtml}</div>` +
    `<div class="art-card-footer">` +
      `<span class="art-card-qty">${row.qty}×</span>` +
      `<span class="art-card-name">${escapeHtml(row.name)}</span>` +
      (countLabel ? `<span class="art-card-sub">${escapeHtml(countLabel)}</span>` : '') +
    `</div>`;

  div.addEventListener('click', () => openPrintPicker(row));
  return div;
}

/* ── printing picker panel ────────────────────────────────────────── */

let _pickerRow = null;

function openPrintPicker(row) {
  if (_pickerRow && _pickerRow.slug === row.slug) {
    closePrintPicker();
    return;
  }
  _pickerRow = row;
  printPickTitle.innerHTML = `<em>${escapeHtml(row.name)}</em>`;
  printPickPane.hidden = false;
  renderPrintPickBody(row);
}

function closePrintPicker() {
  _pickerRow = null;
  printPickPane.hidden = true;
}

function renderPrintPickBody(row) {
  if (row.status === 'missing' || !row.printings.length) {
    printPickBody.innerHTML =
      `<div class="pick-empty">` +
        `<p>No printings in your library for <em>${escapeHtml(row.name)}</em>.</p>` +
        `<button class="btn btn-find" id="ppFindBtn">Find art →</button>` +
      `</div>`;
    printPickBody.querySelector('#ppFindBtn').addEventListener('click', () => {
      closePrintPicker();
      setView('table');
      viewToggle.querySelectorAll('.view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === 'table')
      );
      // open the find panel for this row via the table
      setTimeout(() => {
        const tr = deckBody.querySelector(`tr[data-slug="${CSS.escape(row.slug)}"]`);
        const btn = tr?.querySelector('.btn-find');
        btn?.click();
      }, 50);
    });
    return;
  }

  const currentPid = selections[row.slug] || row.selected;
  printPickBody.innerHTML = row.printings.map(p => {
    const isSelected = p.id === currentPid;
    const label = p.set && p.collector_number
      ? `${p.set.toUpperCase()} #${p.collector_number}`
      : (p.tag || p.id);
    return (
      `<div class="pick-row ${isSelected ? 'pick-row-selected' : ''}" data-pid="${escapeHtml(p.id)}">` +
        `<div class="pick-thumb">` +
          `<img src="/thumb/${encodeURIComponent(row.slug)}/${encodeURIComponent(p.id)}" alt="" loading="lazy">` +
        `</div>` +
        `<div class="pick-meta">` +
          `<span class="pick-label">${escapeHtml(label)}</span>` +
          `<span class="pick-detail">${escapeHtml(p.source)}${p.tag ? ' · ' + p.tag : ''}</span>` +
          `<span class="pick-detail">bleed: ${escapeHtml(p.bleed || '—')} · added ${escapeHtml(p.added || '—')}</span>` +
        `</div>` +
        `<div class="pick-action">` +
          (isSelected
            ? `<span class="pick-selected-badge">✓ selected</span>`
            : `<button class="btn" data-pid="${escapeHtml(p.id)}">Use this</button>`) +
        `</div>` +
      `</div>`
    );
  }).join('');

  printPickBody.querySelectorAll('.btn[data-pid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      selections[row.slug] = pid;
      // refresh art grid tile and picker
      const tile = artGrid.querySelector(`.art-card[data-slug="${CSS.escape(row.slug)}"]`);
      if (tile) tile.replaceWith(buildArtCard(row));
      renderPrintPickBody(row);
      updateSummary();
    });
  });
}

/* ── saved decklists ──────────────────────────────────────────────── */

async function loadSavedDecks() {
  try {
    const data = await api('/api/decklists');
    renderSavedDecks(data.decklists || []);
  } catch (e) {
    console.error('Failed to load saved decklists', e);
  }
}

function renderSavedDecks(decklists) {
  if (!decklists.length) {
    savedDecksList.innerHTML = '<span class="dim" style="font-size:12px">No saved decklists yet.</span>';
    return;
  }
  savedDecksList.innerHTML = decklists.map(d =>
    `<div class="saved-deck-item" data-key="${escapeHtml(d.key)}">` +
      `<button class="saved-deck-load" data-key="${escapeHtml(d.key)}" title="Load this deck">${escapeHtml(d.name)}</button>` +
      `<span class="saved-deck-date dim">${escapeHtml(d.added || '')}</span>` +
      `<button class="saved-deck-del btn-icon" data-key="${escapeHtml(d.key)}" title="Delete">×</button>` +
    `</div>`
  ).join('');

  savedDecksList.querySelectorAll('.saved-deck-load').forEach(btn => {
    btn.addEventListener('click', () => loadDeck(btn.dataset.key));
  });
  savedDecksList.querySelectorAll('.saved-deck-del').forEach(btn => {
    btn.addEventListener('click', () => deleteDeck(btn.dataset.key));
  });
}

async function saveDeck() {
  const name = deckNameInput.value.trim();
  const text = deckInput.value.trim();
  if (!name) { deckNameInput.focus(); return; }
  if (!text) { alert('Paste a decklist first.'); return; }

  btnSaveDeck.disabled = true;
  try {
    await api('/api/decklists', {
      method: 'POST',
      body: JSON.stringify({ name, text }),
    });
    deckNameInput.value = '';
    await loadSavedDecks();
  } catch (e) {
    alert('Failed to save: ' + e.message);
  } finally {
    btnSaveDeck.disabled = false;
  }
}

async function loadDeck(key) {
  try {
    const data = await api(`/api/decklists/${encodeURIComponent(key)}`);
    deckInput.value = data.text;
    localStorage.setItem('build_decklist', data.text);
    deckNameInput.value = data.name;
    await parseDeck();
  } catch (e) {
    alert('Failed to load deck: ' + e.message);
  }
}

async function deleteDeck(key) {
  if (!confirm('Delete this saved decklist?')) return;
  try {
    await api(`/api/decklists/${encodeURIComponent(key)}`, { method: 'DELETE' });
    await loadSavedDecks();
  } catch (e) {
    alert('Failed to delete: ' + e.message);
  }
}
