/* ── helpers ─────────────────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ── filter ──────────────────────────────────────────────────────── */
const filterInput = $("#filter");
filterInput?.addEventListener("input", () => {
  const q = filterInput.value.toLowerCase().trim();
  $$(".card").forEach(c => {
    const name = c.dataset.name || "";
    c.classList.toggle("hidden", q && !name.includes(q));
  });
});

/* ── card detail drawer ──────────────────────────────────────────── */
const drawer = $("#drawer"),
      drawerScrim = $("#drawerScrim"),
      drawerName = $("#drawerName"),
      drawerBody = $("#drawerBody");

function closeDrawer() {
  drawer.hidden = true;
  drawerScrim.hidden = true;
}
drawerScrim?.addEventListener("click", closeDrawer);
$(".drawer-close")?.addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeDrawer(); closeModal(); }
});

async function openCard(slug) {
  const data = await api(`/api/card/${encodeURIComponent(slug)}`);
  drawerName.textContent = data.name;
  drawerBody.innerHTML = "";
  Object.entries(data.printings).forEach(([pid, p]) => {
    const row = document.createElement("div");
    row.className = "printing-row" + (pid === data.default ? " is-default" : "");
    const thumb = p.exists
      ? `<img src="/thumb/${slug}/${pid}" alt="">`
      : `<div class="card-art-empty" style="width:80px;aspect-ratio:745/1040;background:var(--bg-3);display:flex;align-items:center;justify-content:center">missing</div>`;
    row.innerHTML = `
      ${thumb}
      <div class="printing-meta">
        <b>${pid}${pid === data.default ? '<span class="default-tag">default</span>' : ''}</b><br>
        <span class="src">${p.source}${p.set ? ` · ${p.set} ${p.collector_number || ''}` : ''}${p.tag ? ` · ${p.tag}` : ''}</span><br>
        <span class="src">bleed: ${p.bleed} · added ${p.added}</span>
      </div>
      <div class="printing-actions">
        ${pid !== data.default ? `<button class="btn" data-action="default" data-pid="${pid}">make default</button>` : ''}
        <a class="btn" href="/full/${slug}/${pid}" target="_blank">view full</a>
        <button class="btn danger" data-action="delete" data-pid="${pid}">delete</button>
      </div>
    `;
    drawerBody.appendChild(row);
  });

  drawer.hidden = false;
  drawerScrim.hidden = false;

  // wire actions
  drawerBody.onclick = async (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const pid = btn.dataset.pid;
    if (btn.dataset.action === "default") {
      await api(`/api/card/${slug}/default`, {
        method: "POST",
        body: JSON.stringify({ printing_id: pid }),
      });
      openCard(slug); // refresh
    } else if (btn.dataset.action === "delete") {
      if (!confirm(`Delete printing "${pid}"? The art file will be removed.`)) return;
      await api(`/api/card/${slug}/printing/${pid}`, { method: "DELETE" });
      // Reload page list since the card may now be gone or look different
      location.reload();
    }
  };
}

$$(".card").forEach(c => {
  c.addEventListener("click", () => openCard(c.dataset.slug));
});

/* ── add-card modal ──────────────────────────────────────────────── */
const modal = $("#addModal");
const btnAdd = $("#btnAdd");
btnAdd?.addEventListener("click", () => { modal.hidden = false; });
function closeModal() { if (modal) modal.hidden = true; }
$(".modal-close")?.addEventListener("click", closeModal);
$(".modal-scrim")?.addEventListener("click", closeModal);

$$(".tab").forEach(t => {
  t.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.toggle("active", x === t));
    $$(".tab-panel").forEach(p => p.hidden = (p.dataset.panel !== t.dataset.tab));
  });
});

/* ── Scryfall: autocomplete + printing picker ─────────────────────── */
const sfName = $("#sfName"),
      sfAuto = $("#sfAutocomplete"),
      sfPrintings = $("#printings"),
      sfPrintingsList = $("#printingsList"),
      sfPrintingsMeta = $("#printingsMeta"),
      sfIngest = $("#sfIngest"),
      sfMakeDefault = $("#sfMakeDefault"),
      sfBleed = $("#sfBleed");

let sfAutoTimer = null;
let sfSelectedPrinting = null;
let sfSelectedName = null;

sfName?.addEventListener("input", () => {
  clearTimeout(sfAutoTimer);
  const q = sfName.value.trim();
  sfPrintings.hidden = true;
  sfIngest.disabled = true;
  if (q.length < 2) { sfAuto.hidden = true; return; }
  sfAutoTimer = setTimeout(async () => {
    const r = await api(`/api/scryfall/search?q=${encodeURIComponent(q)}`);
    sfAuto.innerHTML = (r.results || []).map(name =>
      `<li data-name="${name.replace(/"/g, '&quot;')}">${name}</li>`
    ).join("");
    sfAuto.hidden = !r.results || r.results.length === 0;
  }, 200);
});

sfAuto?.addEventListener("click", async (ev) => {
  const li = ev.target.closest("li");
  if (!li) return;
  const name = li.dataset.name;
  sfName.value = name;
  sfAuto.hidden = true;
  await loadPrintings(name);
});

async function loadPrintings(name) {
  sfPrintings.hidden = false;
  sfPrintingsList.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;font-family:var(--mono);font-size:11px;color:var(--ink-faint)">loading printings…</div>`;
  sfSelectedName = name;
  sfSelectedPrinting = null;
  sfIngest.disabled = true;

  const r = await api(`/api/scryfall/printings?name=${encodeURIComponent(name)}`);
  if (r.error) {
    sfPrintingsList.innerHTML = `<div style="color:var(--red)">Error: ${r.error}</div>`;
    return;
  }
  sfPrintingsMeta.textContent = `showing 5 of ${r.total}`;
  sfPrintingsList.innerHTML = r.top.map((p, i) => `
    <div class="printing-pick ${p.foil_only ? 'foil-only' : ''}"
         data-set="${p.set}" data-num="${p.collector_number}" data-i="${i}">
      <img src="${p.image_normal || ''}" alt="" loading="lazy">
      <div class="meta">
        <span class="set">${p.set.toUpperCase()} · ${p.set_name}</span>
        <span class="num">#${p.collector_number} · ${p.released_at || ''}</span>
        <span class="price">${p.price ? '$' + p.price.toFixed(2) : '—'}</span>
      </div>
    </div>
  `).join("");
  $$(".printing-pick", sfPrintingsList).forEach(el => {
    el.addEventListener("click", () => {
      $$(".printing-pick", sfPrintingsList).forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
      sfSelectedPrinting = { set: el.dataset.set, num: el.dataset.num };
      sfIngest.disabled = false;
    });
  });
}

sfIngest?.addEventListener("click", async () => {
  if (!sfSelectedPrinting) return;
  sfIngest.disabled = true;
  const job = await api("/api/ingest/scryfall", {
    method: "POST",
    body: JSON.stringify({
      name: sfSelectedName,
      set: sfSelectedPrinting.set,
      num: sfSelectedPrinting.num,
      bleed: sfBleed.value || null,
      make_default: sfMakeDefault.checked,
    }),
  });
  trackJob(job);
  closeModal();
});

/* ── File upload ─────────────────────────────────────────────────── */
const fileIngest = $("#fileIngest");
fileIngest?.addEventListener("click", async () => {
  const fd = new FormData();
  fd.append("name", $("#fileName").value);
  fd.append("tag", $("#fileTag").value || "custom");
  const bleed = $("#fileBleed").value;
  if (bleed) fd.append("bleed", bleed);
  if ($("#fileMakeDefault").checked) fd.append("make_default", "1");
  const files = $("#fileFiles").files;
  for (const f of files) fd.append("files", f);
  if (!fd.get("name")) { alert("Card name required"); return; }
  if (!files.length) { alert("Select at least one file"); return; }

  fileIngest.disabled = true;
  try {
    const res = await fetch("/api/ingest/file", { method: "POST", body: fd });
    const job = await res.json();
    trackJob(job);
    closeModal();
  } finally {
    fileIngest.disabled = false;
  }
});

/* ── job tracking ────────────────────────────────────────────────── */
const jobTray = $("#jobTray");
const trackedJobs = new Map();

function trackJob(job) {
  jobTray.hidden = false;
  const div = document.createElement("div");
  div.className = `job-item state-${job.state}`;
  div.dataset.jid = job.id;
  div.innerHTML = `
    <div class="label">${escapeHtml(job.label)}</div>
    <div class="progress">${escapeHtml(job.progress || job.state)}</div>
  `;
  jobTray.prepend(div);
  trackedJobs.set(job.id, div);
  pollJob(job.id);
}

async function pollJob(jid) {
  while (true) {
    await new Promise(r => setTimeout(r, 1500));
    const j = await api(`/api/job/${jid}`).catch(() => null);
    if (!j) return;
    const div = trackedJobs.get(jid);
    if (!div) return;
    div.className = `job-item state-${j.state}`;
    $(".progress", div).textContent = j.error || j.progress || j.state;
    if (j.state === "done") {
      $(".progress", div).textContent = "added to library";
      // give the user a moment, then refresh the grid silently
      setTimeout(() => location.reload(), 800);
      return;
    }
    if (j.state === "failed") return;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ── close modal/drawer on click outside ─────────────────────────── */
window.addEventListener("click", e => {
  if (e.target === modal?.querySelector(".modal-scrim")) closeModal();
});
