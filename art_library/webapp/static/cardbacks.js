"use strict";

let _pendingFile = null;

async function loadCardbacks() {
  const res = await fetch("/api/cardbacks");
  const data = await res.json();
  renderGrid(data.cardbacks, data.default);
}

function renderGrid(cardbacks, defaultKey) {
  const grid = document.getElementById("cbGrid");
  const empty = document.getElementById("cbEmpty");

  if (!cardbacks.length) {
    empty.hidden = false;
    grid.innerHTML = "";
    grid.appendChild(empty);
    return;
  }

  empty.hidden = true;
  grid.innerHTML = "";

  for (const cb of cardbacks) {
    const card = document.createElement("div");
    card.className = "cb-card" + (cb.is_default ? " cb-default" : "");
    card.dataset.key = cb.key;

    card.innerHTML = `
      <div class="cb-img-wrap">
        <img src="${cb.thumb_url}" alt="${cb.name}" loading="lazy">
        ${cb.is_default ? '<span class="cb-badge">default</span>' : ""}
      </div>
      <div class="cb-info">
        <span class="cb-name">${cb.name}</span>
        <div class="cb-actions">
          ${!cb.is_default ? `<button class="btn-link" onclick="setDefault('${cb.key}')">set default</button>` : ""}
          <button class="btn-link danger" onclick="deleteCb('${cb.key}', '${cb.name}')">delete</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
}

async function setDefault(key) {
  await fetch(`/api/cardbacks/${key}/set-default`, { method: "POST" });
  loadCardbacks();
}

async function deleteCb(key, name) {
  if (!confirm(`Delete cardback "${name}"?`)) return;
  await fetch(`/api/cardbacks/${key}`, { method: "DELETE" });
  loadCardbacks();
}

// File pick → show name form
document.getElementById("cbFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  _pendingFile = file;
  const nameInput = document.getElementById("cbNameInput");
  nameInput.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  document.getElementById("cbUploadForm").hidden = false;
  document.getElementById("uploadNote").hidden = true;
});

document.getElementById("btnCancelCb").addEventListener("click", () => {
  _pendingFile = null;
  document.getElementById("cbUploadForm").hidden = true;
  document.getElementById("cbFileInput").value = "";
});

document.getElementById("btnUploadCb").addEventListener("click", async () => {
  if (!_pendingFile) return;
  const name = document.getElementById("cbNameInput").value.trim();
  if (!name) { alert("Enter a name for this cardback."); return; }
  const makeDefault = document.getElementById("cbMakeDefault").checked;

  const note = document.getElementById("uploadNote");
  note.textContent = "Uploading…";
  note.hidden = false;

  const form = new FormData();
  form.append("file", _pendingFile);
  form.append("name", name);
  if (makeDefault) form.append("default", "1");

  try {
    const res = await fetch("/api/cardbacks", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    note.textContent = `Added: ${data.name}`;
    document.getElementById("cbUploadForm").hidden = true;
    document.getElementById("cbFileInput").value = "";
    _pendingFile = null;
    loadCardbacks();
  } catch (err) {
    note.textContent = `Error: ${err.message}`;
  }
});

// Also allow dragging an image label
document.addEventListener("DOMContentLoaded", loadCardbacks);
