const BOOTSTRAP_UTILS_URL =
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap-utilities.min.css";

export function initOptionalBootstrapUtilities() {
    // Explicit opt-in only; avoid accidental activation via URL params.
    const enable = window.__ENABLE_BOOTSTRAP_UTILS__ === true;
    if (!enable) return;
    if (document.querySelector('link[data-bootstrap-utils="true"]')) return;

    const mount = () => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = BOOTSTRAP_UTILS_URL;
        link.dataset.bootstrapUtils = "true";
        document.head.appendChild(link);
    };

    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(mount, { timeout: 1500 });
    } else {
        setTimeout(mount, 0);
    }
}
