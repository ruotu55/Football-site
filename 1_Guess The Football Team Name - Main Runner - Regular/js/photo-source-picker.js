// js/photo-source-picker.js — "Add Player Photo" source chooser + candidate picker.
// Two self-contained modals (no dependencies), mirroring photo-crop.js.
//   openPhotoSourceChooser({ playerName, onPasteUrl, onFetchFutgg, onFetch365 })
//   openPhotoCandidatePicker({ title, loadCandidates, onSelect })
// loadCandidates: () => Promise<Array<{ url, dataUrl }>>  (owns the search call)
// onSelect:       (candidate) => Promise<void>            (throws -> inline error)

let chooserRoot = null;
let pickerRoot = null;

function ensureChooserRoot() {
  if (chooserRoot) return chooserRoot;
  const root = document.createElement("div");
  root.className = "psrc-modal fc-modal-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="psrc-backdrop" data-psrc-close></div>
    <div class="psrc-panel" role="dialog" aria-label="Add player photo">
      <h3 class="psrc-title">Add player photo</h3>
      <div class="psrc-name"></div>
      <div class="psrc-options">
        <button type="button" class="psrc-opt" data-psrc-action="url">
          <span class="psrc-opt-title">Paste image URL</span>
          <span class="psrc-opt-sub">Enter a direct link to an image</span>
        </button>
        <button type="button" class="psrc-opt" data-psrc-action="futgg">
          <span class="psrc-opt-title">Fetch FUT cards</span>
          <span class="psrc-opt-sub">Search fut.gg — pick from this player's cards</span>
        </button>
        <button type="button" class="psrc-opt" data-psrc-action="s365">
          <span class="psrc-opt-title">Fetch from 365scores</span>
          <span class="psrc-opt-sub">Search 365scores — pick the face photo</span>
        </button>
      </div>
      <div class="psrc-actions">
        <button type="button" class="psrc-btn psrc-btn-secondary" data-psrc-close>Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  chooserRoot = root;
  return root;
}

export function openPhotoSourceChooser({ playerName, onPasteUrl, onFetchFutgg, onFetch365 } = {}) {
  const root = ensureChooserRoot();
  const nameEl = root.querySelector(".psrc-name");
  nameEl.textContent = playerName ? `For: ${playerName}` : "";

  const close = () => {
    root.hidden = true;
    root.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  const onClick = (e) => {
    if (e.target?.dataset?.psrcClose !== undefined) { close(); return; }
    const opt = e.target.closest?.("[data-psrc-action]");
    if (!opt) return;
    const action = opt.dataset.psrcAction;
    close();
    if (action === "url") onPasteUrl?.();
    else if (action === "futgg") onFetchFutgg?.();
    else if (action === "s365") onFetch365?.();
  };
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  root.hidden = false;
}

function ensurePickerRoot() {
  if (pickerRoot) return pickerRoot;
  const root = document.createElement("div");
  root.className = "ppick-modal fc-modal-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="ppick-backdrop" data-ppick-close></div>
    <div class="ppick-panel" role="dialog" aria-label="Pick a photo">
      <h3 class="ppick-title">Pick a photo</h3>
      <div class="ppick-status"></div>
      <div class="ppick-grid" hidden></div>
      <div class="ppick-actions">
        <button type="button" class="ppick-btn ppick-btn-secondary" data-ppick-close>Close</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  pickerRoot = root;
  return root;
}

export function openPhotoCandidatePicker({ title, loadCandidates, onSelect } = {}) {
  const root = ensurePickerRoot();
  const titleEl = root.querySelector(".ppick-title");
  const statusEl = root.querySelector(".ppick-status");
  const grid = root.querySelector(".ppick-grid");
  titleEl.textContent = title || "Pick a photo";
  grid.hidden = true;
  grid.innerHTML = "";
  statusEl.hidden = false;
  statusEl.className = "ppick-status";
  statusEl.textContent = "Searching…";

  let cells = [];
  let busy = false;

  const close = () => {
    root.hidden = true;
    root.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  const showError = (msg) => {
    statusEl.hidden = false;
    statusEl.className = "ppick-status ppick-status-error";
    statusEl.textContent = msg;
  };
  const onClick = async (e) => {
    if (e.target?.dataset?.ppickClose !== undefined) { close(); return; }
    const cell = e.target.closest?.(".ppick-cell");
    if (!cell || busy) return;
    const candidate = cells[Number(cell.dataset.idx)];
    if (!candidate) return;
    busy = true;
    cell.classList.add("ppick-cell-busy");
    try {
      await onSelect?.(candidate);
      close();
    } catch (err) {
      showError(err?.message || "Failed to save photo.");
      cell.classList.remove("ppick-cell-busy");
      busy = false;
    }
  };

  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  root.hidden = false;

  (async () => {
    try {
      cells = (await loadCandidates?.()) || [];
    } catch (err) {
      showError(err?.message || "Search failed.");
      return;
    }
    if (!cells.length) {
      statusEl.hidden = false;
      statusEl.className = "ppick-status";
      statusEl.textContent = "No photos found for this player.";
      return;
    }
    statusEl.hidden = true;
    grid.hidden = false;
    grid.innerHTML = cells
      .map((c, i) => `<button type="button" class="ppick-cell" data-idx="${i}"><img src="${c.dataUrl}" alt="" draggable="false" /></button>`)
      .join("");
  })();
}
