(function () {
  const { uploadsForDay, uploadsForMonth, phaseForDate, PHASES, pad2, sameYMD, START_DATE } = window.FCSchedule;

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

  function passesFilter(u) {
    return u.channel === activeChannel && filters[u.type];
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
    const badge = document.getElementById("phase-badge");
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
      for (const u of uploads) {
        if (!passesFilter(u)) continue;
        const pill = document.createElement("div");
        pill.className = `upload upload-${u.type} channel-${u.channel}`;
        pill.innerHTML = `
          <span class="time">${pad2(u.hour)}:${pad2(u.min)}</span>
          <span class="runner">#${u.episode} ${u.runner.name}</span>
        `;
        pill.title =
          `${u.channel.toUpperCase()} channel · ${u.type === "long" ? "Long-form" : "Short"}\n` +
          `${u.runner.name} · Episode #${u.episode}\n` +
          `Upload: ${pad2(u.hour)}:${pad2(u.min)} Israel time`;
        cell.appendChild(pill);
      }

      cal.appendChild(cell);
    }
  }

  function renderStats() {
    const stats = document.getElementById("month-stats");
    let longCount = 0, shortCount = 0;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const ups = uploadsForDay(date);
      for (const u of ups) {
        if (u.channel !== activeChannel) continue;
        if (u.type === "long") longCount++;
        else if (u.type === "short") shortCount++;
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
  renderAll();
})();
