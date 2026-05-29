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
  // Open the month containing today, or the start month if start is in the future
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  if (new Date(viewYear, viewMonth, 1) < new Date(START_DATE.getFullYear(), START_DATE.getMonth(), 1)) {
    viewYear = START_DATE.getFullYear();
    viewMonth = START_DATE.getMonth();
  }

  let activeChannel = "en"; // "en" or "es"
  const filters = { long: true, short: true };

  const modal = document.getElementById("url-modal");
  const modalMeta = document.getElementById("url-modal-meta");
  const urlInput = document.getElementById("url-input");
  const urlClearBtn = document.getElementById("url-clear");
  let pendingSlot = null; // { date, upload }

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
        openThumbnailModal(date, u, block, btn);
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
      try {
        const r = await fetch("/__launch-runner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runnerId: u.runner.id, type: u.type }),
        });
        const res = await r.json();
        if (!res.ok) {
          alert("Couldn't open the runner:\n\n" + (res.error || "unknown error"));
          btn.disabled = false;
          btn.textContent = prev;
        } else {
          // The server opened the runner in the browser. Reset the label.
          btn.disabled = false;
          btn.textContent = prev;
        }
      } catch (err) {
        alert("Couldn't reach the calendar server to launch the runner.");
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

      // Fixed 3-slot layout per day so cell heights stay uniform across the
      // grid: morning short, long (every day in launch month, Sun/Wed/Fri after),
      // evening short.
      const uploadsWrap = document.createElement("div");
      uploadsWrap.className = "day-uploads";
      const slotsInOrder = [shorts[0] || null, longUpload, shorts[1] || null];
      for (const u of slotsInOrder) {
        const slot = document.createElement("div");
        slot.className = "upload-slot";
        if (!u) {
          slot.classList.add("upload-slot--empty");
        } else {
          slot.appendChild(buildUploadPill(date, u));
        }
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
  });

  renderAll();
})();
