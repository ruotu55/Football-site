/**
 * When using run_site.py over http, sync saved scripts to repo storage/saved-scripts/<bucket>.json
 * so all browsers (including other PCs on the LAN) share the same saves across server restarts.
 */
export function createSavedScriptsServerSync(bucket, keys) {
    const url = `/__runner-saved-scripts/${encodeURIComponent(bucket)}`;
    const active =
        typeof location !== "undefined" &&
        location.protocol === "http:" &&
        location.hostname !== "";

    let pushTimer = null;

    function normalize(raw) {
        return {
            scripts: Array.isArray(raw.scripts) ? raw.scripts : [],
            folders: Array.isArray(raw.folders) ? raw.folders : [],
            folderStates:
                raw.folderStates && typeof raw.folderStates === "object" && !Array.isArray(raw.folderStates)
                    ? raw.folderStates
                    : {},
        };
    }

    function isEmpty(data) {
        return (
            data.scripts.length === 0 &&
            data.folders.length === 0 &&
            Object.keys(data.folderStates).length === 0
        );
    }

    return {
        flushLocalAndServer(scripts, folders, folderStates) {
            localStorage.setItem(keys.KEY_SCRIPTS, JSON.stringify(scripts));
            localStorage.setItem(keys.KEY_FOLDERS, JSON.stringify(folders));
            localStorage.setItem(keys.KEY_FOLDER_STATES, JSON.stringify(folderStates));
            if (!active) return;
            clearTimeout(pushTimer);
            pushTimer = setTimeout(() => {
                pushTimer = null;
                fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scripts, folders, folderStates: folderStates }),
                }).catch(() => {});
            }, 300);
        },

        startPull({ replaceAll, render, hasLocalData, getSnapshot }) {
            if (!active) return;
            (async () => {
                try {
                    const r = await fetch(url);
                    if (!r.ok) return;
                    const data = normalize(await r.json());
                    if (!isEmpty(data)) {
                        replaceAll(data.scripts, data.folders, data.folderStates);
                        render();
                        return;
                    }
                    if (hasLocalData()) {
                        const snap = getSnapshot();
                        await fetch(url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                scripts: snap.scripts,
                                folders: snap.folders,
                                folderStates: snap.folderStates,
                            }),
                        });
                    }
                } catch (_) {
                    /* offline or file:// */
                }
            })();
        },
    };
}
