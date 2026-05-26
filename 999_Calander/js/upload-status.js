/* Persist uploaded-video URLs per calendar slot (localStorage). */
(function () {
  const STORAGE_KEY = "fc-calendar-uploads";

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function slotKey(date, upload) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      + `|${upload.channel}|${upload.type}|r${upload.runner.id}|e${upload.episode}`;
  }

  function get(date, upload) {
    return loadAll()[slotKey(date, upload)] || null;
  }

  function set(date, upload, url) {
    const data = loadAll();
    data[slotKey(date, upload)] = { url, savedAt: Date.now() };
    saveAll(data);
  }

  function remove(date, upload) {
    const data = loadAll();
    delete data[slotKey(date, upload)];
    saveAll(data);
  }

  window.FCUploadStatus = { get, set, remove, slotKey };
})();
