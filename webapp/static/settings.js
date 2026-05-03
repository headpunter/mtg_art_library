'use strict';
// Relies on $ / $$ / api / escapeHtml from app.js (loaded first via base.html)

/* ── state ───────────────────────────────────────────────────────── */
let allSources  = [];   // [{key, name, description}, ...]
let prefKeys    = [];   // ordered list of source keys

/* ── elements ────────────────────────────────────────────────────── */
const autofillUrl  = document.getElementById('autofillUrl');
const btnSaveUrl   = document.getElementById('btnSaveUrl');
const saveUrlNote  = document.getElementById('saveUrlNote');
const prefList    = document.getElementById('prefList');
const prefEmpty   = document.getElementById('prefEmpty');
const availList   = document.getElementById('availList');
const sourceSearch = document.getElementById('sourceSearch');
const btnSave     = document.getElementById('btnSave');
const saveNote    = document.getElementById('saveNote');

/* ── boot ────────────────────────────────────────────────────────── */
(async () => {
  const [settingsRes, sourcesRes] = await Promise.all([
    api('/api/settings').catch(() => ({ preferred_sources: [] })),
    api('/api/mpcautofill/sources').catch(() => ({ sources: [], error: 'Could not reach MPC AutoFill' })),
  ]);

  prefKeys   = settingsRes.preferred_sources || [];
  autofillUrl.value = settingsRes.autofill_url || '';
  allSources = sourcesRes.sources || [];

  if (sourcesRes.error && !allSources.length) {
    availList.innerHTML =
      `<div class="avail-error">⚠ ${escapeHtml(sourcesRes.error)}</div>`;
  }

  renderPref();
  renderAvail();
})();

/* ── render preferred list ───────────────────────────────────────── */
function renderPref() {
  prefEmpty.hidden = prefKeys.length > 0;

  // Remove existing source rows (keep prefEmpty)
  $$('.pref-item', prefList).forEach(el => el.remove());

  prefKeys.forEach((key, idx) => {
    const src  = allSources.find(s => s.key === key);
    const name = src ? src.name : key;

    const item = document.createElement('div');
    item.className = 'pref-item';
    item.dataset.key = key;
    item.innerHTML =
      `<span class="pref-rank">${idx + 1}</span>` +
      `<div class="pref-info">` +
        `<span class="pref-name">${escapeHtml(name)}</span>` +
        `<span class="pref-key mono dim">${escapeHtml(key)}</span>` +
      `</div>` +
      `<div class="pref-controls">` +
        `<button class="pref-btn" data-action="up"   title="Move up"   ${idx === 0 ? 'disabled' : ''}>↑</button>` +
        `<button class="pref-btn" data-action="down" title="Move down" ${idx === prefKeys.length - 1 ? 'disabled' : ''}>↓</button>` +
        `<button class="pref-btn pref-remove" data-action="remove" title="Remove">×</button>` +
      `</div>`;

    prefList.appendChild(item);
  });
}

prefList.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const item = btn.closest('.pref-item');
  const key  = item.dataset.key;
  const idx  = prefKeys.indexOf(key);
  if (idx === -1) return;

  if (btn.dataset.action === 'up' && idx > 0) {
    [prefKeys[idx - 1], prefKeys[idx]] = [prefKeys[idx], prefKeys[idx - 1]];
  } else if (btn.dataset.action === 'down' && idx < prefKeys.length - 1) {
    [prefKeys[idx], prefKeys[idx + 1]] = [prefKeys[idx + 1], prefKeys[idx]];
  } else if (btn.dataset.action === 'remove') {
    prefKeys.splice(idx, 1);
  }

  renderPref();
  renderAvail();
});

/* ── render available sources ────────────────────────────────────── */
function renderAvail() {
  const q = (sourceSearch.value || '').toLowerCase().trim();

  const visible = allSources.filter(s => {
    if (prefKeys.includes(s.key)) return false;           // already preferred
    if (!q) return true;
    return s.name.toLowerCase().includes(q) ||
           s.key.toLowerCase().includes(q)  ||
           (s.description || '').toLowerCase().includes(q);
  });

  if (!visible.length) {
    availList.innerHTML = allSources.length
      ? '<div class="avail-empty">No sources match the filter.</div>'
      : '';
    return;
  }

  availList.innerHTML = visible.map(s =>
    `<div class="avail-item" data-key="${escapeHtml(s.key)}">` +
      `<div class="avail-info">` +
        `<span class="avail-name">${escapeHtml(s.name)}</span>` +
        `<span class="avail-key mono dim">${escapeHtml(s.key)}</span>` +
        (s.description ? `<span class="avail-desc dim">${escapeHtml(s.description)}</span>` : '') +
      `</div>` +
      `<button class="btn avail-add" data-key="${escapeHtml(s.key)}">+ Add</button>` +
    `</div>`
  ).join('');
}

availList.addEventListener('click', e => {
  const btn = e.target.closest('.avail-add');
  if (!btn) return;
  const key = btn.dataset.key;
  if (!prefKeys.includes(key)) {
    prefKeys.push(key);
    renderPref();
    renderAvail();
  }
});

sourceSearch.addEventListener('input', renderAvail);

/* ── save url ────────────────────────────────────────────────────── */
btnSaveUrl.addEventListener('click', async () => {
  btnSaveUrl.disabled = true;
  saveUrlNote.hidden = false;
  saveUrlNote.style.color = '';
  saveUrlNote.textContent = 'Saving…';
  try {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ autofill_url: autofillUrl.value.trim() }),
    });
    saveUrlNote.textContent = '✓ Saved';
    setTimeout(() => { saveUrlNote.hidden = true; }, 2000);
  } catch (e) {
    saveUrlNote.textContent = '✕ ' + e.message;
    saveUrlNote.style.color = 'var(--red)';
  } finally {
    btnSaveUrl.disabled = false;
  }
});

/* ── save preferred sources ──────────────────────────────────────── */
btnSave.addEventListener('click', async () => {
  btnSave.disabled = true;
  saveNote.hidden  = false;
  saveNote.style.color = '';
  saveNote.textContent = 'Saving…';

  try {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ preferred_sources: prefKeys }),
    });
    saveNote.textContent = '✓ Saved';
    setTimeout(() => { saveNote.hidden = true; }, 2000);
  } catch (e) {
    saveNote.textContent = '✕ ' + e.message;
    saveNote.style.color = 'var(--red)';
  } finally {
    btnSave.disabled = false;
  }
});
