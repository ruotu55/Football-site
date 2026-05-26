(function () {
  const { uploadsForDay, uploadsForMonth, phaseForDate, PHASES, pad2, sameYMD, START_DATE } = window.FCSchedule;
  const { get: getUploadStatus, set: setUploadStatus, remove: removeUploadStatus } = window.FCUploadStatus;
  const FCRecordingStatus = window.FCRecordingStatus;

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

  function buildUploadPill(date, u) {
    const status = getUploadStatus(date, u);
    const pill = document.createElement("div");
    pill.className = `upload upload-${u.type} channel-${u.channel}`;
    if (status) pill.classList.add("upload--done");

    /* Flat-column pill layout — chip + YouTube-upload check sit on a top
       row, time and runner name flow below. No absolute positioning so
       nothing overlaps at any cell size. The chip mirrors the runner Saved
       tab's labels; the check still toggles the YouTube-upload URL modal. */
    const top = document.createElement("div");
    top.className = "upload-top";

    if (FCRecordingStatus) {
      const block = FCRecordingStatus.getBlock(u.runner.id, u.type, u.episode);
      const blockState = FCRecordingStatus.statusForBlock(block);
      const pillState = FCRecordingStatus.statusForPill(u.runner.id, u.type, u.episode, u.channel);
      pill.dataset.recState = pillState;
      const chip = document.createElement("span");
      chip.className = `rec-chip rec-chip--${blockState}`;
      chip.textContent = FCRecordingStatus.labelForBlock(block);
      chip.title = block
        ? `Block: ${block.name || "(unnamed)"} — #${u.episode}`
        : `No block yet · #${u.episode}`;
      top.appendChild(chip);
    } else {
      const spacer = document.createElement("span");
      spacer.style.flex = "1";
      top.appendChild(spacer);
    }

    const check = document.createElement("button");
    check.type = "button";
    check.className = "upload-check";
    check.setAttribute("aria-label", status ? "Edit video link" : "Mark as uploaded");
    check.setAttribute("aria-pressed", status ? "true" : "false");
    if (status) check.textContent = "\u2713";
    check.addEventListener("click", (e) => {
      e.stopPropagation();
      openUrlModal(date, u);
    });
    top.appendChild(check);

    const title =
      `${u.channel.toUpperCase()} · ${u.type === "long" ? "Long-form" : "Short"}\n`
      + `${u.runner.name} · Episode #${u.episode}\n`
      + `Upload: ${pad2(u.hour)}:${pad2(u.min)} Israel time`;

    const body = document.createElement(status ? "a" : "div");
    body.className = "upload-body";
    if (status) {
      body.href = status.url;
      body.target = "_blank";
      body.rel = "noopener noreferrer";
      body.title = title + "\n" + status.url;
    } else {
      body.title = title;
    }
    body.innerHTML = `
      <div class="upload-time">${pad2(u.hour)}:${pad2(u.min)}</div>
      <div class="upload-runner">#${u.episode} ${u.runner.name}</div>
      ${status ? '<div class="upload-view">View ↗</div>' : ""}
    `;

    pill.appendChild(top);
    pill.appendChild(body);
    return pill;
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
      const byType = { short: null, long: null };
      for (const u of uploads) {
        if (!passesFilter(u)) continue;
        byType[u.type] = u;
      }

      const uploadsWrap = document.createElement("div");
      uploadsWrap.className = "day-uploads";
      for (const type of ["short", "long"]) {
        const slot = document.createElement("div");
        slot.className = "upload-slot";
        const u = byType[type];
        if (!u) {
          slot.classList.add("upload-slot--empty");
          uploadsWrap.appendChild(slot);
          continue;
        }
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
