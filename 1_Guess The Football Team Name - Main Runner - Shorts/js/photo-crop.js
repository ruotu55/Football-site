// js/photo-crop.js — lightweight image crop modal (no dependencies).
// openPhotoCropModal({ imageUrl, title, onSave }) shows the given image with a
// draggable / resizable selection box; on "Save crop" it draws the selected
// region to a canvas and calls onSave(pngDataUrl). Used to crop player photos
// (e.g. down to the shirt) and overwrite the stored file.

let cropRoot = null;

function ensureCropRoot() {
    if (cropRoot) return cropRoot;
    const root = document.createElement("div");
    root.className = "pcrop-modal";
    root.hidden = true;
    root.innerHTML = `
        <div class="pcrop-backdrop" data-pcrop-close></div>
        <div class="pcrop-panel" role="dialog" aria-label="Crop photo">
            <h3 class="pcrop-title">Crop photo</h3>
            <div class="pcrop-hint">Drag the box to move it, drag a corner to resize, then Save crop.</div>
            <div class="pcrop-stagewrap">
                <div class="pcrop-stage">
                    <img class="pcrop-img" alt="" draggable="false" />
                    <div class="pcrop-sel" hidden>
                        <span class="pcrop-handle" data-h="nw"></span>
                        <span class="pcrop-handle" data-h="ne"></span>
                        <span class="pcrop-handle" data-h="sw"></span>
                        <span class="pcrop-handle" data-h="se"></span>
                    </div>
                </div>
            </div>
            <div class="pcrop-error" hidden></div>
            <div class="pcrop-actions">
                <button type="button" class="pcrop-btn pcrop-btn-secondary" data-pcrop-close>Cancel</button>
                <button type="button" class="pcrop-btn pcrop-btn-primary" data-pcrop-save>Save crop</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);
    cropRoot = root;
    return root;
}

export function openPhotoCropModal({ imageUrl, title, onSave } = {}) {
    const root = ensureCropRoot();
    const img = root.querySelector(".pcrop-img");
    const stage = root.querySelector(".pcrop-stage");
    const sel = root.querySelector(".pcrop-sel");
    const titleEl = root.querySelector(".pcrop-title");
    const errEl = root.querySelector(".pcrop-error");
    const saveBtn = root.querySelector("[data-pcrop-save]");
    titleEl.textContent = title || "Crop photo";
    errEl.hidden = true;
    errEl.textContent = "";

    // selection rect in stage (displayed) pixels
    let rect = { x: 0, y: 0, w: 0, h: 0 };
    let stageW = 0, stageH = 0;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const MIN = 16;

    function applyRect() {
        sel.style.left = rect.x + "px";
        sel.style.top = rect.y + "px";
        sel.style.width = rect.w + "px";
        sel.style.height = rect.h + "px";
    }

    function initSelection() {
        const r = img.getBoundingClientRect();
        stageW = r.width;
        stageH = r.height;
        stage.style.width = stageW + "px";
        stage.style.height = stageH + "px";
        // Start covering the FULL image; the user only shrinks it inward.
        rect.x = 0;
        rect.y = 0;
        rect.w = stageW;
        rect.h = stageH;
        sel.hidden = false;
        applyRect();
    }

    let drag = null; // { mode, startX, startY, start: {...rect} }
    function onPointerDown(e) {
        const handle = e.target.closest?.(".pcrop-handle");
        const mode = handle ? handle.dataset.h : (e.target === sel ? "move" : null);
        if (!mode) return;
        e.preventDefault();
        drag = { mode, startX: e.clientX, startY: e.clientY, start: { ...rect } };
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp, { once: true });
    }
    function onPointerMove(e) {
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        const s = drag.start;
        if (drag.mode === "move") {
            rect.x = clamp(s.x + dx, 0, stageW - s.w);
            rect.y = clamp(s.y + dy, 0, stageH - s.h);
        } else {
            let left = s.x, top = s.y, right = s.x + s.w, bottom = s.y + s.h;
            if (drag.mode.includes("w")) left = clamp(s.x + dx, 0, right - MIN);
            if (drag.mode.includes("e")) right = clamp(s.x + s.w + dx, left + MIN, stageW);
            if (drag.mode.includes("n")) top = clamp(s.y + dy, 0, bottom - MIN);
            if (drag.mode.includes("s")) bottom = clamp(s.y + s.h + dy, top + MIN, stageH);
            rect.x = left; rect.y = top; rect.w = right - left; rect.h = bottom - top;
        }
        applyRect();
    }
    function onPointerUp() {
        drag = null;
        window.removeEventListener("pointermove", onPointerMove);
    }

    function cleanup() {
        sel.removeEventListener("pointerdown", onPointerDown);
        root.removeEventListener("click", onRootClick);
        window.removeEventListener("pointermove", onPointerMove);
    }
    function close() {
        root.hidden = true;
        cleanup();
    }
    function showErr(msg) {
        errEl.textContent = String(msg || "");
        errEl.hidden = !msg;
    }

    async function doSave() {
        if (!rect.w || !rect.h) { showErr("Draw a crop box first."); return; }
        const scaleX = img.naturalWidth / stageW;
        const scaleY = img.naturalHeight / stageH;
        const sx = Math.max(0, Math.round(rect.x * scaleX));
        const sy = Math.max(0, Math.round(rect.y * scaleY));
        const sw = Math.max(1, Math.round(rect.w * scaleX));
        const sh = Math.max(1, Math.round(rect.h * scaleY));
        let dataUrl;
        try {
            const canvas = document.createElement("canvas");
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            dataUrl = canvas.toDataURL("image/png");
        } catch (err) {
            showErr("Could not read the image for cropping (" + (err?.message || err) + ").");
            return;
        }
        saveBtn.disabled = true;
        const prev = saveBtn.textContent;
        saveBtn.textContent = "Saving…";
        try {
            await onSave?.(dataUrl);
            close();
        } catch (err) {
            showErr(err?.message || "Failed to save crop.");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = prev;
        }
    }

    function onRootClick(e) {
        if (e.target?.dataset?.pcropClose !== undefined) { close(); return; }
        if (e.target?.dataset?.pcropSave !== undefined) { doSave(); }
    }

    sel.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("click", onRootClick);

    img.onload = () => initSelection();
    img.onerror = () => showErr("Could not load the image to crop.");
    // Same-origin asset → canvas stays untainted; set src after handlers.
    img.removeAttribute("src");
    img.src = imageUrl;
    root.hidden = false;
    if (img.complete && img.naturalWidth) initSelection();
}
