'use strict';
// Relies on $ / $$ / api / escapeHtml from app.js (loaded first via base.html)
// CARD_SLUG and CARD_NAME are injected inline in card.html

const printingsList  = document.getElementById('printingsList');
const heroImg        = document.getElementById('heroImg');
const defaultLabel   = document.getElementById('defaultLabel');
const addZone        = document.getElementById('addPrintingZone');
const btnAddPrinting = document.getElementById('btnAddPrinting');
const btnDeleteCard  = document.getElementById('btnDeleteCard');

/* ── action delegation on printing cards ─────────────────────── */

printingsList.addEventListener('click', async e => {
  // style remove (×) button
  const rmBtn = e.target.closest('.style-rm');
  if (rmBtn) {
    const row = rmBtn.closest('.pc-styles');
    await doRemoveStyle(row.dataset.pid, rmBtn.dataset.style, row);
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;
  const pc  = btn.closest('.printing-card');
  const pid = pc.dataset.pid;
  if (btn.dataset.action === 'default')   await doSetDefault(pid, pc);
  if (btn.dataset.action === 'reprocess') await doReprocess(pid, pc);
  if (btn.dataset.action === 'delete')    await doDelete(pid, pc);
  if (btn.dataset.action === 'add-style') doShowStyleInput(btn.dataset.pid, btn);
});

printingsList.addEventListener('change', async e => {
  const sel = e.target.closest('[data-action="bleed"]');
  if (!sel) return;
  const pc  = sel.closest('.printing-card');
  const pid = pc.dataset.pid;
  await doUpdateBleed(pid, sel.value, pc);
});

/* ── set default ─────────────────────────────────────────────── */

async function doSetDefault(pid, pc) {
  await api(`/api/card/${enc(CARD_SLUG)}/default`, {
    method: 'POST',
    body: JSON.stringify({ printing_id: pid }),
  });

  $$('.printing-card', printingsList).forEach(el => {
    const isNow = el.dataset.pid === pid;
    el.classList.toggle('is-default', isNow);

    if (isNow) {
      el.querySelector('[data-action="default"]')?.remove();
      if (!el.querySelector('.default-tag')) {
        const badge = document.createElement('span');
        badge.className = 'default-tag';
        badge.textContent = 'default';
        el.querySelector('.pc-pid-text').after(badge);
      }
      // Update hero art in the sidebar
      const thumb = el.querySelector('.pc-thumb img');
      if (thumb && heroImg.tagName === 'IMG') heroImg.src = thumb.src;
    } else {
      el.querySelector('.default-tag')?.remove();
      if (!el.querySelector('[data-action="default"]')) {
        const btn = document.createElement('button');
        btn.className = 'btn pc-btn';
        btn.dataset.action = 'default';
        btn.textContent = 'Set default';
        el.querySelector('.pc-actions').prepend(btn);
      }
    }
  });

  if (defaultLabel) defaultLabel.textContent = pid;
}

/* ── bleed update (metadata only) ───────────────────────────── */

async function doUpdateBleed(pid, newBleed, pc) {
  try {
    await api(`/api/card/${enc(CARD_SLUG)}/printing/${enc(pid)}/bleed`, {
      method: 'POST',
      body: JSON.stringify({ bleed: newBleed }),
    });
    const span = document.getElementById(`bleed-text-${pid}`);
    if (span) span.textContent = newBleed;
  } catch (e) {
    alert('Failed to update bleed: ' + e.message);
    location.reload();
  }
}

/* ── re-process ──────────────────────────────────────────────── */

async function doReprocess(pid, pc) {
  const strip = document.getElementById(`job-${pid}`);
  const btn   = pc.querySelector('[data-action="reprocess"]');
  strip.hidden = false;
  strip.textContent = 'Starting…';
  if (btn) btn.disabled = true;

  try {
    const job = await api(`/api/card/${enc(CARD_SLUG)}/printing/${enc(pid)}/reprocess`, {
      method: 'POST',
      body: '{}',
    });
    await pollJob(job.id, strip,
      () => { strip.textContent = '✓ Done — refreshing…'; setTimeout(() => location.reload(), 800); },
      () => { if (btn) btn.disabled = false; }
    );
  } catch (e) {
    strip.textContent = '✕ ' + e.message;
    if (btn) btn.disabled = false;
  }
}

/* ── delete printing ─────────────────────────────────────────── */

async function doDelete(pid, pc) {
  if (!confirm(`Delete printing "${pid}"? The art file will be removed.`)) return;

  await api(`/api/card/${enc(CARD_SLUG)}/printing/${enc(pid)}`, { method: 'DELETE' });

  const remaining = $$('.printing-card', printingsList).length - 1;
  if (remaining === 0) {
    window.location.href = '/library';
  } else {
    pc.remove();
    if (pc.classList.contains('is-default')) location.reload();
  }
}

/* ── refresh metadata ────────────────────────────────────────── */

const btnRefreshMeta  = document.getElementById('btnRefreshMeta');
const refreshMetaNote = document.getElementById('refreshMetaNote');

if (btnRefreshMeta) {
  btnRefreshMeta.addEventListener('click', async () => {
    btnRefreshMeta.disabled = true;
    refreshMetaNote.hidden = false;
    refreshMetaNote.style.color = '';
    refreshMetaNote.textContent = 'Fetching…';
    try {
      const job = await api(`/api/card/${enc(CARD_SLUG)}/refresh-metadata`, { method: 'POST', body: '{}' });
      await pollJob(job.id, refreshMetaNote,
        () => { refreshMetaNote.textContent = '✓ Done — refreshing…'; setTimeout(() => location.reload(), 800); },
        () => { btnRefreshMeta.disabled = false; }
      );
    } catch (e) {
      refreshMetaNote.textContent = '✕ ' + e.message;
      refreshMetaNote.style.color = 'var(--red)';
      btnRefreshMeta.disabled = false;
    }
  });
}

/* ── delete whole card ───────────────────────────────────────── */

btnDeleteCard.addEventListener('click', async () => {
  if (!confirm(`Delete "${CARD_NAME}" and all its printings? This cannot be undone.`)) return;
  await api(`/api/card/${enc(CARD_SLUG)}`, { method: 'DELETE' });
  window.location.href = '/library';
});

/* ── add printing panel ──────────────────────────────────────── */

btnAddPrinting.addEventListener('click', () => {
  addZone.hidden = !addZone.hidden;
  if (!addZone.hidden && !addZone.firstChild) renderAddPanel();
});

let addSelectedPrinting = null;

function renderAddPanel() {
  addZone.innerHTML = `
    <div class="add-panel">
      <div class="tabs">
        <button class="tab active" data-tab="scryfall">From Scryfall</button>
        <button class="tab" data-tab="file">From file</button>
      </div>

      <div class="tab-panel" data-panel="scryfall">
        <div id="addPrintingsWrap">
          <span class="mono dim">Loading printings…</span>
        </div>
        <div class="opts">
          <label class="check">
            <input type="checkbox" id="addMakeDefault">
            <span>Set as default printing</span>
          </label>
          <label class="field inline">
            <span>Bleed</span>
            <select id="addBleed">
              <option value="">default (mirror)</option>
              <option value="mirror">mirror</option>
              <option value="edge">edge</option>
              <option value="black">black</option>
              <option value="white">white</option>
            </select>
          </label>
        </div>
        <footer class="modal-foot">
          <button class="btn primary" id="addSfIngest" disabled>Add printing</button>
          <span class="footer-note" id="addSfNote"></span>
        </footer>
      </div>

      <div class="tab-panel" data-panel="file" hidden>
        <label class="field">
          <span>Tag (e.g. <code>futurama</code>, <code>mpcfill_v1</code>)</span>
          <input id="addFileTag" type="text" placeholder="custom" value="custom">
        </label>
        <label class="field">
          <span>Image file</span>
          <input id="addFileFiles" type="file" accept="image/*">
        </label>
        <div class="opts">
          <label class="check">
            <input type="checkbox" id="addFileMakeDefault">
            <span>Set as default</span>
          </label>
          <label class="field inline">
            <span>Bleed</span>
            <select id="addFileBleed">
              <option value="">default (mirror)</option>
              <option value="mirror">mirror</option>
              <option value="edge">edge</option>
              <option value="black">black</option>
              <option value="white">white</option>
            </select>
          </label>
        </div>
        <footer class="modal-foot">
          <button class="btn primary" id="addFileIngest">Add file</button>
          <span class="footer-note" id="addFileNote"></span>
        </footer>
      </div>
    </div>
  `;

  // tab switching
  addZone.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      addZone.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      addZone.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
    });
  });

  loadAddPrintings();
  document.getElementById('addSfIngest').addEventListener('click', doAddFromScryfall);
  document.getElementById('addFileIngest').addEventListener('click', doAddFromFile);
}

async function loadAddPrintings() {
  const wrap = document.getElementById('addPrintingsWrap');
  const r = await api(`/api/scryfall/printings?name=${encodeURIComponent(CARD_NAME)}`);
  if (r.error || !r.top?.length) {
    wrap.innerHTML = `<span class="mono dim">${escapeHtml(r.error || 'No printings found')}</span>`;
    return;
  }
  wrap.innerHTML = `
    <div class="printings-head">
      <span>Top 5 printings · non-foil first</span>
      <span class="printings-meta">of ${r.total}</span>
    </div>
    <div class="printings-list" id="addPickList">
      ${r.top.map(p => `
        <div class="printing-pick ${p.foil_only ? 'foil-only' : ''}"
             data-set="${escapeHtml(p.set)}" data-num="${escapeHtml(p.collector_number)}">
          <img src="${escapeHtml(p.image_normal || '')}" alt="" loading="lazy">
          <div class="meta">
            <span class="set">${escapeHtml(p.set.toUpperCase())} · ${escapeHtml(p.set_name)}</span>
            <span class="num">#${escapeHtml(p.collector_number)} · ${escapeHtml(p.released_at || '')}</span>
            <span class="price">${p.price ? '$' + p.price.toFixed(2) : '—'}</span>
          </div>
        </div>`).join('')}
    </div>`;

  wrap.querySelectorAll('.printing-pick').forEach(el => {
    el.addEventListener('click', () => {
      wrap.querySelectorAll('.printing-pick').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      addSelectedPrinting = { set: el.dataset.set, num: el.dataset.num };
      document.getElementById('addSfIngest').disabled = false;
    });
  });
}

async function doAddFromScryfall() {
  if (!addSelectedPrinting) return;
  const btn  = document.getElementById('addSfIngest');
  const note = document.getElementById('addSfNote');
  btn.disabled = true;
  note.textContent = 'Starting…';
  try {
    const job = await api('/api/ingest/scryfall', {
      method: 'POST',
      body: JSON.stringify({
        name: CARD_NAME,
        set: addSelectedPrinting.set,
        num: addSelectedPrinting.num,
        bleed: document.getElementById('addBleed').value || null,
        make_default: document.getElementById('addMakeDefault').checked,
      }),
    });
    await pollJob(job.id, note,
      () => setTimeout(() => location.reload(), 600),
      () => { btn.disabled = false; }
    );
  } catch (e) {
    note.textContent = '✕ ' + e.message;
    btn.disabled = false;
  }
}

async function doAddFromFile() {
  const btn  = document.getElementById('addFileIngest');
  const note = document.getElementById('addFileNote');
  const fd   = new FormData();
  fd.append('name', CARD_NAME);
  fd.append('tag', document.getElementById('addFileTag').value || 'custom');
  const bleed = document.getElementById('addFileBleed').value;
  if (bleed) fd.append('bleed', bleed);
  if (document.getElementById('addFileMakeDefault').checked) fd.append('make_default', '1');
  const files = document.getElementById('addFileFiles').files;
  if (!files.length) { alert('Select a file first.'); return; }
  for (const f of files) fd.append('files', f);

  btn.disabled = true;
  note.textContent = 'Uploading…';
  try {
    const res = await fetch('/api/ingest/file', { method: 'POST', body: fd });
    const job = await res.json();
    await pollJob(job.id, note,
      () => setTimeout(() => location.reload(), 600),
      () => { btn.disabled = false; }
    );
  } catch (e) {
    note.textContent = '✕ ' + e.message;
    btn.disabled = false;
  }
}

/* ── shared job poller ───────────────────────────────────────── */

async function pollJob(jid, statusEl, onDone, onFail) {
  while (true) {
    await new Promise(r => setTimeout(r, 1200));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;
    statusEl.textContent = j.error || j.progress || j.state;
    if (j.state === 'done')   { onDone(j);  return; }
    if (j.state === 'failed') { statusEl.textContent = '✕ ' + (j.error || 'Failed'); onFail(j); return; }
  }
}

/* ── style tag management ────────────────────────────────────── */

function _stylesFromRow(row) {
  return (row.dataset.styles || '').split(',').filter(Boolean);
}

function _renderStyleRow(row, styles) {
  row.dataset.styles = styles.join(',');
  const pid = row.dataset.pid;

  const existingInput = row.querySelector('.style-input-wrap');
  row.innerHTML = '';

  styles.forEach(s => {
    const chip = document.createElement('span');
    chip.className = 'style-chip-sm';
    chip.innerHTML =
      `${escapeHtml(s)}<button class="style-rm" data-style="${escapeHtml(s)}" aria-label="Remove ${escapeHtml(s)}">×</button>`;
    row.appendChild(chip);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'style-add-btn';
  addBtn.dataset.action = 'add-style';
  addBtn.dataset.pid = pid;
  addBtn.textContent = '+ tag';
  row.appendChild(addBtn);

  if (existingInput) row.appendChild(existingInput);
}

async function doRemoveStyle(pid, style, row) {
  const styles = _stylesFromRow(row).filter(s => s !== style);
  await api(`/api/card/${enc(CARD_SLUG)}/printing/${enc(pid)}/styles`, {
    method: 'POST',
    body: JSON.stringify({ styles }),
  });
  _renderStyleRow(row, styles);
}

function doShowStyleInput(pid, addBtn) {
  const row = document.getElementById(`pc-styles-${pid}`);
  if (row.querySelector('.style-input-wrap')) return;

  addBtn.style.display = 'none';

  const wrap = document.createElement('span');
  wrap.className = 'style-input-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'style-input';
  input.placeholder = 'e.g. borderless';
  input.maxLength = 40;

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'style-confirm-btn';
  confirmBtn.textContent = '✓';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'style-cancel-btn';
  cancelBtn.textContent = '×';

  wrap.append(input, confirmBtn, cancelBtn);
  row.appendChild(wrap);
  input.focus();

  async function commit() {
    const val = input.value.trim().toLowerCase();
    if (!val) { cancel(); return; }
    const existing = _stylesFromRow(row);
    if (existing.includes(val)) { cancel(); return; }
    const styles = [...existing, val];
    await api(`/api/card/${enc(CARD_SLUG)}/printing/${enc(pid)}/styles`, {
      method: 'POST',
      body: JSON.stringify({ styles }),
    });
    _renderStyleRow(row, styles);
  }

  function cancel() {
    wrap.remove();
    addBtn.style.display = '';
  }

  confirmBtn.addEventListener('click', commit);
  cancelBtn.addEventListener('click', cancel);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') cancel();
  });
}

/* ── tiny URL encoder helper ─────────────────────────────────── */
function enc(s) { return encodeURIComponent(s); }
