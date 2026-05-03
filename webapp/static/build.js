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
const btnIngestXml   = document.getElementById('btnIngestXml');
const xmlArtFileInput = document.getElementById('xmlArtFileInput');
const ingestNote     = document.getElementById('ingestNote');
const btnFetchPinned  = document.getElementById('btnFetchPinned');
const fetchPinnedNote = document.getElementById('fetchPinnedNote');
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
const tokensPanel    = document.getElementById('tokensPanel');
const tokensList     = document.getElementById('tokensList');
const tokensHint     = document.getElementById('tokensHint');
const findPane       = document.getElementById('findPane');
const findPaneTitle  = document.getElementById('findPaneTitle');
const findPaneTabs   = document.getElementById('findPaneTabs');
const findPaneResults = document.getElementById('findPaneResults');
const findPaneClose  = document.getElementById('findPaneClose');

let _findRow = null;   // the deck row currently open in the find pane

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
  btnFetchMissing.addEventListener('click', fetchMissingFromAutofill);

  findPaneClose.addEventListener('click', closeFindPane);
  findPaneTabs.addEventListener('click', e => {
    const tab = e.target.closest('.find-tab');
    if (!tab || !_findRow) return;
    findPaneTabs.querySelectorAll('.find-tab').forEach(t => t.classList.toggle('active', t === tab));
    if (_findRow._isToken) {
      loadTokenResults(_findRow.name);
    } else {
      loadFindResults(_findRow, tab.dataset.tab);
    }
  });

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
    renderTokens(data.tokens_needed || []);
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
  tokensPanel.hidden = true;
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
  findPaneTabs.querySelectorAll('.find-tab').forEach((t, i) => t.classList.toggle('active', i === 1));
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
  findPaneTabs.querySelectorAll('.find-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  findPane.hidden = false;
  findPane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadFindResults(row, 'autofill');
}

async function loadFindResults(row, tab) {
  findPaneResults.innerHTML = `<span class="hint-dim">Loading…</span>`;
  if (tab === 'autofill') {
    await loadAutofillResults(row);
  } else {
    await loadScryfallResults(row);
  }
}

async function loadAutofillResults(row, findTr, container) {
  try {
    const r = await api(`/api/mpcautofill/search?name=${encodeURIComponent(row.name)}`);
    if (r.unconfigured) {
      findPaneResults.innerHTML =
        `<span class="hint-dim">MPC AutoFill backend not configured. ` +
        `Add a backend URL in <a href="/settings" style="color:var(--gold-hi)">Settings</a>.</span>`;
      return;
    }
    if (r.error || !r.results?.length) {
      findPaneResults.innerHTML = `<span class="hint-dim">${escapeHtml(r.error || 'No art found on MPC AutoFill')}</span>`;
      return;
    }
    findPaneResults.innerHTML = r.results.map(p => {
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
    findPaneResults.querySelectorAll('.autofill-pick').forEach(el => {
      el.addEventListener('click', () => {
        ingestAutofillForRow(row, el.dataset.identifier, el.dataset.source, el.dataset.extension);
      });
    });
  } catch (e) {
    findPaneResults.innerHTML = `<span class="hint-dim">Failed to reach MPC AutoFill backend</span>`;
  }
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

async function ingestAutofillForRow(row, identifier, source, extension) {
  closeFindPane();
  const tr = _findRowTr(row);
  const strip = tr?.querySelector('.job-strip');
  const findBtn = tr?.querySelector('.btn-find');
  if (strip) { strip.hidden = false; strip.textContent = 'Starting…'; }
  if (findBtn) findBtn.disabled = true;

  try {
    const job = await api('/api/ingest/mpcautofill-card', {
      method: 'POST',
      body: JSON.stringify({ name: row.name, identifier, source, extension, make_default: true }),
    });
    await pollRowJob(job.id, strip, findBtn);
  } catch (e) {
    if (strip) strip.textContent = '✕ ' + e.message;
    if (findBtn) findBtn.disabled = false;
  }
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

  btnFetchMissing.hidden = missing === 0;
  btnFetchMissing.textContent = `Fetch ${missing} missing from MPC AutoFill`;
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
