(function () {
  const { uploadsForDay, uploadsForMonth, phaseForDate, PHASES, pad2, sameYMD, START_DATE } = window.FCSchedule;
  const { get: getUploadStatus, set: setUploadStatus, remove: removeUploadStatus } = window.FCUploadStatus;
  const FCRecordingStatus = window.FCRecordingStatus;
  const FCYouTube = window.FCYouTube;

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // State
  const today = new Date();
  // Always open on today's month (user can navigate to launch months before/after).
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  let activeChannel = "en"; // "en" or "es"
  const filters = { long: true, short: true };

  const modal = document.getElementById("url-modal");
  const modalMeta = document.getElementById("url-modal-meta");
  const urlInput = document.getElementById("url-input");
  const urlClearBtn = document.getElementById("url-clear");
  let pendingSlot = null; // { date, upload }
  let blockModal = null;
  let pendingBlockSlot = null; // { date, u, block }

  function passesFilter(u) {
    return u.channel === activeChannel && filters[u.type];
  }

  function normalizeUrl(raw) {
    let url = raw.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
      new URL(url);
      return url;
    } catch {
      return null;
    }
  }

  function openUrlModal(date, upload) {
    pendingSlot = { date, upload };
    const status = getUploadStatus(date, upload);
    const typeLabel = upload.type === "long" ? "Long-form" : "Short";
    modalMeta.textContent =
      `${pad2(date.getDate())} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} · `
      + `${upload.channel.toUpperCase()} · ${typeLabel}\n`
      + `#${upload.episode} ${upload.runner.name} · ${pad2(upload.hour)}:${pad2(upload.min)}`;
    urlInput.value = status ? status.url : "";
    urlClearBtn.hidden = !status;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    urlInput.focus();
  }

  function closeUrlModal() {
    pendingSlot = null;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    urlInput.value = "";
  }

  function ensureSaveBlockModal() {
    if (blockModal) return blockModal;
    const root = document.createElement("div");
    root.id = "block-save-modal";
    root.className = "modal";
    root.hidden = true;
    root.innerHTML = `
      <div class="modal-backdrop" data-block-close></div>
      <div class="modal-panel" role="dialog" aria-labelledby="block-save-title">
        <h3 id="block-save-title">Save competition</h3>
        <p id="block-save-meta" class="modal-meta"></p>
        <label class="modal-label" for="block-save-name">Competition name</label>
        <input type="text" id="block-save-name" class="modal-input" autocomplete="off">
        <label class="modal-label" for="block-save-teams">Levels</label>
        <textarea id="block-save-teams" class="block-modal-textarea" rows="12" autocomplete="off"></textarea>
        <div id="block-save-error" class="modal-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="navbtn" data-block-close>Cancel</button>
          <button type="button" class="navbtn modal-save" id="block-save-submit">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    blockModal = root;
    root.addEventListener("click", (e) => {
      if (e.target.dataset && e.target.dataset.blockClose !== undefined) closeSaveBlockModal();
    });
    root.querySelector("#block-save-submit").addEventListener("click", savePendingBlock);
    return root;
  }

  function openSaveBlockModal(date, u, block) {
    const root = ensureSaveBlockModal();
    pendingBlockSlot = { date, u, block };
    const isShort = u.type === "short";
    root.querySelector("#block-save-meta").textContent =
      `${pad2(date.getDate())} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} · `
      + `${u.channel.toUpperCase()} · ${isShort ? "Short" : "Long-form"}\n`
      + `#${u.episode} ${u.runner.name} · ${pad2(u.hour)}:${pad2(u.min)}`;
    // Shorts have no competition name — hide the name field entirely.
    root.querySelector("#block-save-title").textContent = isShort ? "Save short" : "Save competition";
    const nameLabel = root.querySelector('label[for="block-save-name"]');
    const nameInput = root.querySelector("#block-save-name");
    // Use inline display (beats the .modal-label CSS rule, which `hidden` doesn't).
    if (nameLabel) nameLabel.style.display = isShort ? "none" : "";
    nameInput.style.display = isShort ? "none" : "";
    nameInput.value = isShort ? "" : (block?.name || "");
    root.querySelector("#block-save-teams").value = FCRecordingStatus
      ? FCRecordingStatus.teamsImportTextForBlock(block)
      : (block?.teamsImportText || "");
    root.querySelector("#block-save-error").hidden = true;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    (isShort ? root.querySelector("#block-save-teams") : nameInput).focus();
  }

  function closeSaveBlockModal() {
    pendingBlockSlot = null;
    if (!blockModal) return;
    blockModal.hidden = true;
    blockModal.setAttribute("aria-hidden", "true");
  }

  async function savePendingBlock() {
    if (!pendingBlockSlot || !FCRecordingStatus) return;
    const root = ensureSaveBlockModal();
    const nameInput = root.querySelector("#block-save-name");
    const teamsInput = root.querySelector("#block-save-teams");
    const err = root.querySelector("#block-save-error");
    const saveBtn = root.querySelector("#block-save-submit");
    const isShort = pendingBlockSlot.u.type === "short";
    const name = isShort ? "" : nameInput.value.trim();   // shorts are nameless
    const teamsImportText = teamsInput.value.trim();

    if (!isShort) nameInput.classList.toggle("modal-input--error", !name);
    teamsInput.classList.toggle("modal-input--error", !teamsImportText);
    if (!teamsImportText || (!isShort && !name)) {
      err.textContent = (!isShort && !name && !teamsImportText)
        ? "Enter a competition name and levels list."
        : (!isShort && !name)
          ? "Enter a competition name."
          : "Enter a levels list.";
      err.hidden = false;
      ((!isShort && !name) ? nameInput : teamsInput).focus();
      return;
    }

    const { u } = pendingBlockSlot;
    const prevText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    const ok = await FCRecordingStatus.saveBlock(u.runner.id, u.type, u.episode, { name, teamsImportText });
    saveBtn.disabled = false;
    saveBtn.textContent = prevText;
    if (!ok) {
      err.textContent = "Could not save this competition to the calendar.";
      err.hidden = false;
      return;
    }
    closeSaveBlockModal();
    renderCalendar();
  }

  /* Per-pill lifecycle (this pill = one channel of one episode):
       "empty"    - no block created yet
       "toRecord" - block filled, but this language isn't recorded yet
       "toUpload" - recorded (video file exists), not uploaded -> Upload button
       "done"     - uploaded to YouTube (auto-linked to the video)
       "error"    - a previous upload failed -> Retry button */
  function pillState(block, channel) {
    const lang = channel === "en" ? "english" : "spanish";
    if (block?.youtube?.[lang]?.videoId) return "done";
    if (block?.youtube?.[lang]?.error) return "error";
    if (block?.video?.[lang]?.path) return "toUpload";
    if (block) return "toRecord";
    return "empty";
  }

  const STATE_LABEL = { empty: "Empty", toRecord: "Ready to record", done: "Done" };
  const STATE_TINT = { empty: "empty", toRecord: "ready", toUpload: "ready", done: "recorded", error: "ready" };

  function buildUploadPill(date, u) {
    const block = FCRecordingStatus ? FCRecordingStatus.getBlock(u.runner.id, u.type, u.episode) : null;
    const state = pillState(block, u.channel);
    const lang = u.channel === "en" ? "english" : "spanish";
    const videoId = block?.youtube?.[lang]?.videoId || null;

    const pill = document.createElement("div");
    pill.className = `upload upload-${u.type} channel-${u.channel}`;
    pill.dataset.recState = STATE_TINT[state] || "empty";

    const top = document.createElement("div");
    top.className = "upload-top";

    const recChip = document.createElement("span");
    const blockStatus = FCRecordingStatus ? FCRecordingStatus.statusForBlock(block) : "empty";
    recChip.className = `rec-chip rec-chip--${blockStatus}`;
    recChip.textContent = FCRecordingStatus ? FCRecordingStatus.labelForBlock(block) : "Empty";
    top.appendChild(recChip);

    const saveBlockBtn = document.createElement("button");
    saveBlockBtn.type = "button";
    saveBlockBtn.className = "block-save-btn";
    saveBlockBtn.textContent = "▣";
    saveBlockBtn.title = block ? "Edit saved competition" : "Save competition for this calendar box";
    saveBlockBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openSaveBlockModal(date, u, block);
    });
    top.appendChild(saveBlockBtn);

    // Thumbnail button — regular (long) videos only. Sets the YouTube thumbnail
    // for THIS pill's channel ahead of time; the upload uses it automatically.
    if (u.type === "long") {
      const thumbBtn = document.createElement("button");
      thumbBtn.type = "button";
      thumbBtn.className = "block-thumb-btn";
      thumbBtn.textContent = "\u{1F5BC}"; // 🖼
      thumbBtn.title = `Set the ${u.channel.toUpperCase()} YouTube thumbnail for this video`;
      thumbBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSetThumbModal(date, u, block);
      });
      top.appendChild(thumbBtn);
    }

    pill.appendChild(top);

    const title =
      `${u.channel.toUpperCase()} · ${u.type === "long" ? "Long-form" : "Short"}\n`
      + `${u.runner.name} · Episode #${u.episode}\n`
      + `Upload: ${pad2(u.hour)}:${pad2(u.min)} Israel time`;

    const body = document.createElement("div");
    body.className = "upload-body";
    body.title = title;
    body.innerHTML = `
      <div class="upload-time">${pad2(u.hour)}:${pad2(u.min)}</div>
      <div class="upload-runner">#${u.episode} ${u.runner.name}</div>
    `;
    pill.appendChild(body);

    // ONE unified status line under the name — identical shape for every
    // state, only the colour + label (and click behaviour) differ.
    pill.appendChild(buildStatusEl(date, u, block, state, videoId));
    return pill;
  }

  // Small ↺ reset button — clears this language's recording/upload status so the
  // pill rolls back to "Ready to record". Shared by the upload + done states.
  function makeResetButton(u, confirmMsg) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "yt-reset";
    reset.textContent = "↺"; // circular arrow
    reset.title = "Reset back to 'Ready to record'";
    reset.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(confirmMsg)) return;
      reset.disabled = true;
      const ok = await FCYouTube.resetLanguage(
        FCRecordingStatus.blockKey(u.runner.id, u.type, u.episode), u.channel,
      );
      if (ok) {
        await FCRecordingStatus.refresh();
      } else {
        reset.disabled = false;
        alert("Could not reset — the server didn't accept the request.");
      }
    });
    return reset;
  }

  function buildStatusEl(date, u, block, state, videoId) {
    // Recorded but not uploaded / failed -> upload (or retry) button + reset.
    if (state === "toUpload" || state === "error") {
      const row = document.createElement("div");
      row.className = "yt-done-row";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `yt-status yt-status--${state}`;
      btn.textContent = state === "error" ? "Retry upload" : "Upload to YouTube";
      if (state === "error") {
        const lang = u.channel === "en" ? "english" : "spanish";
        btn.title = block?.youtube?.[lang]?.error || "Previous upload failed";
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (u.type === "long") {
          // Regular: use the thumbnail you set ahead of time (or tell you to add one).
          uploadRegularWithSavedThumb(date, u, block, btn);
        } else {
          // Shorts: keep the pick-at-upload modal.
          openThumbnailModal(date, u, block, btn);
        }
      });
      row.appendChild(btn);
      row.appendChild(makeResetButton(u,
        "Reset back to 'Ready to record'?\n\nThis clears the recorded status on the calendar so you can re-record. The video file on disk is not deleted."));
      return row;
    }
    // Uploaded -> "Done" link to the video + a small reset (rolls it back).
    if (state === "done" && videoId) {
      const row = document.createElement("div");
      row.className = "yt-done-row";

      const a = document.createElement("a");
      a.className = "yt-status yt-status--done";
      a.href = `https://www.youtube.com/watch?v=${videoId}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Done \u2197";
      a.title = "Uploaded & scheduled. Click to view on YouTube.";
      row.appendChild(a);
      row.appendChild(makeResetButton(u,
        "Reset this upload status?\n\nThis only clears it on the calendar so you can re-record / re-upload. The video already on YouTube is NOT deleted."));
      return row;
    }
    // Empty / Ready to record -> clickable: launches the runner so you can record.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `yt-status yt-status--${state}`;
    btn.textContent = STATE_LABEL[state] || state;
    btn.title = "Open this runner to record";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Opening runner…";
      // When the calendar is viewed remotely (e.g. on the recording Mac), the
      // server does NOT open the runner on itself — this browser must. Pre-open
      // a tab now, inside the click gesture, so it isn't blocked as a popup;
      // we point it at the runner URL once the server responds.
      const remoteView = !["127.0.0.1", "localhost", "::1", ""].includes(location.hostname);
      const popup = remoteView ? window.open("", "_blank") : null;
      try {
        const r = await fetch("/__launch-runner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runnerId: u.runner.id, type: u.type, episode: u.episode }),
        });
        const res = await r.json();
        if (!res.ok) {
          if (popup) popup.close();
          alert("Couldn't open the runner:\n\n" + (res.error || "unknown error"));
        } else if (res.openOnClient && res.url) {
          // Remote: send our pre-opened tab to the runner on the LAN IP.
          if (popup) popup.location.href = res.url;
          else window.open(res.url, "_blank");
        } else if (popup) {
          // Server opened it locally; drop the stray pre-opened tab.
          popup.close();
        }
      } catch (err) {
        if (popup) popup.close();
        alert("Couldn't reach the calendar server to launch the runner.");
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
    return btn;
  }

  // ---- Thumbnail picker modal (built once, reused) ------------------------
  let thumbModal = null;
  let thumbPending = null; // { date, u, block, btn }
  let thumbFile = null;    // { dataBase64, mime, name }

  function ensureThumbModal() {
    if (thumbModal) return thumbModal;
    const root = document.createElement("div");
    root.id = "yt-thumb-modal";
    root.className = "modal";
    root.hidden = true;
    root.innerHTML = `
      <div class="modal-backdrop" data-yt-close></div>
      <div class="modal-panel" role="dialog" aria-labelledby="yt-thumb-title">
        <h3 id="yt-thumb-title">Upload to YouTube</h3>
        <p id="yt-thumb-meta" class="modal-meta"></p>
        <div id="yt-drop" class="yt-drop">
          <input id="yt-thumb-file" type="file" accept="image/*" hidden>
          <div class="yt-drop-inner">
            <div class="yt-drop-text">Drag an image here</div>
            <img id="yt-thumb-preview" class="yt-thumb-preview" hidden alt="">
            <div id="yt-thumb-name" class="yt-thumb-name"></div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="navbtn" data-yt-close>Cancel</button>
          <button type="button" class="navbtn modal-save" id="yt-thumb-upload" disabled>Upload</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    thumbModal = root;

    const fileInput = root.querySelector("#yt-thumb-file");
    const drop = root.querySelector("#yt-drop");
    const preview = root.querySelector("#yt-thumb-preview");
    const nameEl = root.querySelector("#yt-thumb-name");
    const uploadBtn = root.querySelector("#yt-thumb-upload");

    const readFile = (file) => {
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const comma = dataUrl.indexOf(",");
        thumbFile = { dataBase64: dataUrl.slice(comma + 1), mime: file.type, name: file.name };
        preview.src = dataUrl;
        preview.hidden = false;
        nameEl.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
        uploadBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    };

    drop.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => readFile(fileInput.files[0]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("yt-drop--over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("yt-drop--over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("yt-drop--over");
      readFile(e.dataTransfer.files[0]);
    });

    root.addEventListener("click", (e) => {
      if (e.target.dataset && e.target.dataset.ytClose !== undefined) closeThumbModal();
    });
    uploadBtn.addEventListener("click", doThumbUpload);
    return root;
  }

  function openThumbnailModal(date, u, block, btn) {
    const root = ensureThumbModal();
    thumbPending = { date, u, block, btn };
    thumbFile = null;
    root.querySelector("#yt-thumb-meta").textContent =
      `${u.channel.toUpperCase()} · #${u.episode} ${u.runner.name} · ${pad2(u.hour)}:${pad2(u.min)}`;
    root.querySelector("#yt-thumb-file").value = "";
    root.querySelector("#yt-thumb-preview").hidden = true;
    root.querySelector("#yt-thumb-name").textContent = "";
    const ub = root.querySelector("#yt-thumb-upload");
    ub.disabled = true;
    ub.textContent = "Upload";
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
  }

  function closeThumbModal() {
    if (thumbModal) { thumbModal.hidden = true; thumbModal.setAttribute("aria-hidden", "true"); }
    thumbPending = null;
    thumbFile = null;
  }

  async function doThumbUpload() {
    if (!thumbPending) return;
    const { date, u, block, btn } = thumbPending;
    const root = ensureThumbModal();
    const ub = root.querySelector("#yt-thumb-upload");
    ub.disabled = true;
    ub.textContent = "Uploading…";
    if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }

    const res = await FCYouTube.upload({
      key: FCRecordingStatus.blockKey(u.runner.id, u.type, u.episode),
      channel: u.channel,
      block,
      date: { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() },
      time: { hour: u.hour, min: u.min },
      playlistName: u.runner.name,
    }, thumbFile);

    if (res.ok) {
      closeThumbModal();
      if (res.warning) alert("Uploaded, with a note:\n\n" + res.warning);
      await FCRecordingStatus.refresh(); // re-render pills with the new status
    } else {
      ub.disabled = false;
      ub.textContent = "Retry";
      if (btn) { btn.disabled = false; btn.textContent = "Retry upload"; btn.classList.add("yt-btn--error"); }
      alert("YouTube upload failed:\n\n" + (res.error || "Unknown error"));
    }
  }

  // ---- Set-thumbnail-ahead modal (regular videos, per channel) ------------
  let setThumbModal = null;
  let setThumbCtx = null;   // { key, channel }
  let setThumbFile = null;  // { dataBase64, mime, name } chosen this session, or null

  function ensureSetThumbModal() {
    if (setThumbModal) return setThumbModal;
    const root = document.createElement("div");
    root.id = "yt-setthumb-modal";
    root.className = "modal";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="modal-backdrop" data-st-close></div>
      <div class="modal-panel" role="dialog" aria-labelledby="yt-setthumb-title">
        <h3 id="yt-setthumb-title">Video thumbnail</h3>
        <p id="yt-setthumb-meta" class="modal-meta"></p>
        <div id="yt-setthumb-drop" class="yt-drop">
          <input id="yt-setthumb-file" type="file" accept="image/*" hidden>
          <div class="yt-drop-inner">
            <div class="yt-drop-text">Drag an image here, or click to choose</div>
            <img id="yt-setthumb-preview" class="yt-thumb-preview" hidden alt="">
            <div id="yt-setthumb-name" class="yt-thumb-name"></div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="navbtn" data-st-close>Close</button>
          <button type="button" class="navbtn" id="yt-setthumb-remove" hidden>Remove</button>
          <button type="button" class="navbtn modal-save" id="yt-setthumb-save" disabled>Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    setThumbModal = root;

    const fileInput = root.querySelector("#yt-setthumb-file");
    const drop = root.querySelector("#yt-setthumb-drop");
    const preview = root.querySelector("#yt-setthumb-preview");
    const nameEl = root.querySelector("#yt-setthumb-name");
    const saveBtn = root.querySelector("#yt-setthumb-save");

    const readFile = (file) => {
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const comma = dataUrl.indexOf(",");
        if (comma < 0) return;
        setThumbFile = { dataBase64: dataUrl.slice(comma + 1), mime: file.type, name: file.name };
        preview.src = dataUrl;
        preview.hidden = false;
        nameEl.textContent = file.name;
        saveBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    };

    drop.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => readFile(fileInput.files[0]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("yt-drop--over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("yt-drop--over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("yt-drop--over");
      readFile(e.dataTransfer.files[0]);
    });
    root.addEventListener("click", (e) => {
      if (e.target.dataset && e.target.dataset.stClose !== undefined) closeSetThumbModal();
    });
    saveBtn.addEventListener("click", saveSetThumb);
    root.querySelector("#yt-setthumb-remove").addEventListener("click", removeSetThumb);
    return root;
  }

  async function openSetThumbModal(date, u, block) {
    const root = ensureSetThumbModal();
    const key = FCRecordingStatus.blockKey(u.runner.id, u.type, u.episode);
    setThumbCtx = { key, channel: u.channel };
    setThumbFile = null;
    root.querySelector("#yt-setthumb-meta").textContent =
      `${u.channel.toUpperCase()} · #${u.episode} ${u.runner.name}`;
    const fileInput = root.querySelector("#yt-setthumb-file");
    const preview = root.querySelector("#yt-setthumb-preview");
    const nameEl = root.querySelector("#yt-setthumb-name");
    const saveBtn = root.querySelector("#yt-setthumb-save");
    const removeBtn = root.querySelector("#yt-setthumb-remove");
    fileInput.value = "";
    preview.hidden = true; preview.src = "";
    nameEl.textContent = "Loading…";
    saveBtn.disabled = true; saveBtn.textContent = "Save";
    removeBtn.hidden = true;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");

    const existing = await FCYouTube.getThumbnail(key, u.channel);
    // Guard against a stale response if the user already reopened on another box.
    if (!setThumbCtx || setThumbCtx.key !== key || setThumbCtx.channel !== u.channel) return;
    if (existing && existing.exists && existing.dataBase64) {
      preview.src = `data:${existing.mime || "image/jpeg"};base64,${existing.dataBase64}`;
      preview.hidden = false;
      nameEl.textContent = existing.name || "Current thumbnail";
      removeBtn.hidden = false;
    } else {
      nameEl.textContent = "No thumbnail set yet.";
    }
  }

  function closeSetThumbModal() {
    if (setThumbModal) { setThumbModal.hidden = true; setThumbModal.setAttribute("aria-hidden", "true"); }
    setThumbCtx = null; setThumbFile = null;
  }

  async function saveSetThumb() {
    if (!setThumbCtx || !setThumbFile) return;
    const saveBtn = setThumbModal.querySelector("#yt-setthumb-save");
    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    const ok = await FCYouTube.saveThumbnail(setThumbCtx.key, setThumbCtx.channel, setThumbFile);
    if (ok) { closeSetThumbModal(); }
    else { saveBtn.disabled = false; saveBtn.textContent = "Save"; alert("Couldn't save the thumbnail."); }
  }

  async function removeSetThumb() {
    if (!setThumbCtx) return;
    const ok = await FCYouTube.deleteThumbnail(setThumbCtx.key, setThumbCtx.channel);
    if (ok) closeSetThumbModal();
    else alert("Couldn't remove the thumbnail.");
  }

  /** Regular upload: use the thumbnail set ahead of time; if none, ask for one. */
  async function uploadRegularWithSavedThumb(date, u, block, btn) {
    const key = FCRecordingStatus.blockKey(u.runner.id, u.type, u.episode);
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "Checking…";
    const t = await FCYouTube.getThumbnail(key, u.channel);
    if (!t || !t.exists || !t.dataBase64) {
      btn.disabled = false; btn.textContent = prev;
      alert(`No thumbnail set for the ${u.channel.toUpperCase()} video.\n\nClick the \u{1F5BC} button on this box to add one, then upload.`);
      return;
    }
    btn.textContent = "Uploading…";
    const res = await FCYouTube.upload({
      key, channel: u.channel, block,
      date: { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() },
      time: { hour: u.hour, min: u.min },
      playlistName: u.runner.name,
    }, { dataBase64: t.dataBase64, mime: t.mime, name: t.name });
    if (res.ok) {
      if (res.warning) alert("Uploaded, with a note:\n\n" + res.warning);
      await FCRecordingStatus.refresh();
    } else {
      btn.disabled = false; btn.textContent = "Retry upload";
      btn.classList.add("yt-btn--error");
      alert("YouTube upload failed:\n\n" + (res.error || "Unknown error"));
    }
  }

  function renderHeader() {
    document.getElementById("current-month").textContent =
      `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    // Show the phase(s) that this month spans
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0);
    const phases = new Set();
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      if (cursor >= START_DATE) phases.add(phaseForDate(cursor).id);
      cursor.setDate(cursor.getDate() + 1);
    }
    /* The phase-badge element was removed from the controls bar — bail
       quietly if some future caller still expects to populate it. */
    const badge = document.getElementById("phase-badge");
    if (badge) {
      if (phases.size === 0) {
        badge.textContent = "Pre-launch";
        badge.dataset.phase = "0";
      } else {
        const ids = [...phases].sort();
        const labels = ids.map(id => {
          const p = PHASES.find(x => x.id === id);
          return `P${p.id} · ${p.name}`;
        });
        badge.textContent = labels.join(" → ");
        badge.dataset.phase = ids.join("");
      }
    }
  }

  function renderCalendar() {
    // Feed the schedule only the episodes that actually have a saved video, so
    // it places real videos in rotation, skips runners that run out, and leaves
    // the calendar empty once every video is used.
    if (FCRecordingStatus && typeof FCRecordingStatus.availableEpisodes === "function"
        && window.FCSchedule && typeof window.FCSchedule.setBlockEpisodes === "function") {
      window.FCSchedule.setBlockEpisodes(FCRecordingStatus.availableEpisodes());
    }
    const cal = document.getElementById("calendar");
    cal.innerHTML = "";

    // Day-name header row
    for (const d of DAY_NAMES) {
      const h = document.createElement("div");
      h.className = "day-header";
      h.textContent = d;
      cal.appendChild(h);
    }

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startPad = firstOfMonth.getDay(); // 0=Sun
    for (let i = 0; i < startPad; i++) {
      const c = document.createElement("div");
      c.className = "day-cell empty";
      cal.appendChild(c);
    }

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthUploads = uploadsForMonth(viewYear, viewMonth);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const cell = document.createElement("div");
      cell.className = "day-cell";
      if (sameYMD(date, today)) cell.classList.add("today");
      const dow = date.getDay();
      if (dow === 0 || dow === 6) cell.classList.add("weekend");
      if (date < new Date(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate())) {
        cell.classList.add("pre-start");
      }

      const num = document.createElement("div");
      num.className = "day-number";
      num.textContent = d;
      cell.appendChild(num);

      const uploads = monthUploads.get(d) || [];
      const shorts = [];
      let longUpload = null;
      for (const u of uploads) {
        if (!passesFilter(u)) continue;
        if (u.type === "short") shorts.push(u);
        else if (u.type === "long") longUpload = u;
      }
      shorts.sort((a, b) => (a.hour * 60 + a.min) - (b.hour * 60 + b.min));

      // Render only the videos that actually exist, in time order (morning
      // short → long → evening short). No empty placeholder slots — a day with
      // 1 or 2 videos takes only that much space, and every pill is the same
      // fixed size (see .upload in styles.css).
      const uploadsWrap = document.createElement("div");
      uploadsWrap.className = "day-uploads";
      const slotsInOrder = [shorts[0] || null, longUpload || null, shorts[1] || null].filter(Boolean);
      for (const u of slotsInOrder) {
        const slot = document.createElement("div");
        slot.className = "upload-slot";
        slot.appendChild(buildUploadPill(date, u));
        uploadsWrap.appendChild(slot);
      }
      if (date >= new Date(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate())) {
        cell.appendChild(uploadsWrap);
      }

      cal.appendChild(cell);
    }
  }

  function renderStats() {
    const stats = document.getElementById("month-stats");
    /* The summary bar was removed from the calendar layout — bail early when
       the host element isn't present rather than crashing the render. */
    if (!stats) return;
    let longCount = 0, shortCount = 0, uploadedCount = 0;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const ups = uploadsForDay(date);
      for (const u of ups) {
        if (u.channel !== activeChannel) continue;
        if (!filters[u.type]) continue;
        if (u.type === "long") longCount++;
        else if (u.type === "short") shortCount++;
        if (getUploadStatus(date, u)) uploadedCount++;
      }
    }
    const total = longCount + shortCount;
    const weeksInMonth = daysInMonth / 7;
    const longPerWeek = (longCount / weeksInMonth).toFixed(1);
    const shortPerWeek = (shortCount / weeksInMonth).toFixed(1);
    const channelLabel = activeChannel === "en" ? "English channel" : "Canal Español";
    stats.innerHTML = `
      <div class="stat"><div class="stat-label">Channel</div><div class="stat-value">${channelLabel}</div></div>
      <div class="stat stat-long"><div class="stat-label">Long-form (month)</div><div class="stat-value">${longCount}</div><div class="stat-sub">~${longPerWeek}/week</div></div>
      <div class="stat stat-short"><div class="stat-label">Shorts (month)</div><div class="stat-value">${shortCount}</div><div class="stat-sub">~${shortPerWeek}/week</div></div>
      <div class="stat"><div class="stat-label">Total uploads</div><div class="stat-value">${total}</div></div>
      <div class="stat stat-done"><div class="stat-label">Marked uploaded</div><div class="stat-value">${uploadedCount}<span class="stat-of"> / ${total}</span></div></div>
    `;
  }

  function renderAll() {
    renderHeader();
    renderCalendar();
    renderStats();
  }

  // Navigation
  document.getElementById("prev-month").addEventListener("click", () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderAll();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderAll();
  });

  document.getElementById("today-btn").addEventListener("click", () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    renderAll();
  });

  document.querySelectorAll('.filters input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      filters[cb.dataset.filter] = cb.checked;
      renderCalendar();
    });
  });

  document.querySelectorAll('.switch-btn').forEach(btn => {
    btn.addEventListener("click", () => {
      activeChannel = btn.dataset.channel;
      document.querySelectorAll('.switch-btn').forEach(b => {
        const isActive = b.dataset.channel === activeChannel;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      document.body.dataset.channel = activeChannel;
      renderCalendar();
      renderStats();
    });
  });

  // "Open Remote": copy the LAN URL of this calendar so another device on the
  // same network (the recording Mac) can open it. The server returns the URL
  // because the browser doesn't know this PC's LAN IP (it sees 127.0.0.1).
  const openRemoteBtn = document.getElementById("open-remote");
  if (openRemoteBtn) {
    const flashRemote = (msg) => {
      const prev = openRemoteBtn.dataset.label || openRemoteBtn.textContent;
      openRemoteBtn.dataset.label = prev;
      openRemoteBtn.textContent = msg;
      openRemoteBtn.classList.add("open-remote-btn--flash");
      setTimeout(() => {
        openRemoteBtn.textContent = prev;
        openRemoteBtn.classList.remove("open-remote-btn--flash");
      }, 1500);
    };
    const copyText = async (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    };
    openRemoteBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/__remote-url");
        const data = await res.json();
        if (!data.url) { flashRemote("No LAN IP"); return; }
        await copyText(data.url);
        flashRemote("Copied!");
      } catch {
        flashRemote("Failed");
      }
    });
  }

  document.body.dataset.channel = activeChannel;

  /* Re-render the calendar whenever the recording-status store updates so
     newly-recorded blocks light up without a manual refresh. The client
     polls every 10s; we only need to repaint the pills (not the header or
     stats — those don't depend on recording status). */
  if (FCRecordingStatus && typeof FCRecordingStatus.subscribe === "function") {
    FCRecordingStatus.subscribe(() => renderCalendar());
  }

  document.getElementById("url-save").addEventListener("click", () => {
    if (!pendingSlot) return;
    const url = normalizeUrl(urlInput.value);
    if (!url) {
      urlInput.focus();
      urlInput.classList.add("modal-input--error");
      return;
    }
    urlInput.classList.remove("modal-input--error");
    setUploadStatus(pendingSlot.date, pendingSlot.upload, url);
    closeUrlModal();
    renderCalendar();
    renderStats();
  });

  document.getElementById("url-cancel").addEventListener("click", closeUrlModal);
  document.getElementById("url-clear").addEventListener("click", () => {
    if (!pendingSlot) return;
    removeUploadStatus(pendingSlot.date, pendingSlot.upload);
    closeUrlModal();
    renderCalendar();
    renderStats();
  });

  modal.querySelector(".modal-backdrop").addEventListener("click", closeUrlModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeUrlModal();
    if (e.key === "Escape" && blockModal && !blockModal.hidden) closeSaveBlockModal();
  });

  renderAll();
})();
