/* Shared debug overlay used by every Main Runner.
   - Small "🐞 Debug" button pinned bottom-right.
   - Click it to open a side panel.
   - REAL BUGS ONLY by default: console.error, uncaught script errors, and
     unhandled promise rejections. Noise (log / warn / resource-fail) is
     captured but hidden — flip "Show noise" in the panel toolbar to see it.
   - Hidden entirely while body has class "play-video-active" (set during
     Play Video / Record Video) so it never appears in recordings.

   Loaded as a regular <script> (not a module) before the module bootstrap so
   it can capture errors that happen during module loading. */
(function () {
    if (window.__DEBUG_OVERLAY_INSTALLED__) return;
    window.__DEBUG_OVERLAY_INSTALLED__ = true;

    /* Kinds we emit. "bug" = real error (visible by default). "noise" = log/warn/
       resource-fail (hidden by default, toggle-able). */
    const KIND_BUG = "bug";
    const KIND_NOISE = "noise";

    function injectStyles() {
        const style = document.createElement("style");
        style.textContent = [
            "body.play-video-active #__dbg_btn,",
            "body.play-video-active #__dbg_panel { display: none !important; }",
            "#__dbg_panel.hide-noise [data-kind='noise'] { display: none; }",
        ].join("\n");
        document.head.appendChild(style);
    }

    function buildUI() {
        const btn = document.createElement("button");
        btn.id = "__dbg_btn";
        btn.type = "button";
        btn.title = "Open debug log";
        btn.style.cssText = [
            "position:fixed", "right:14px", "bottom:14px", "z-index:100000",
            "background:#111", "color:#fff", "border:1px solid #444",
            "border-radius:999px", "padding:8px 14px",
            "font:bold 12px/1 ui-monospace,Consolas,monospace", "cursor:pointer",
            "box-shadow:0 2px 10px rgba(0,0,0,0.5)",
            "display:flex", "align-items:center", "gap:6px",
        ].join(";");
        const label = document.createElement("span");
        label.textContent = "🐞 Debug";
        const count = document.createElement("span");
        count.id = "__dbg_count";
        count.style.cssText = "background:#444;color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;";
        count.textContent = "0";
        btn.appendChild(label);
        btn.appendChild(count);

        const panel = document.createElement("div");
        panel.id = "__dbg_panel";
        panel.className = "hide-noise"; /* real bugs only by default */
        panel.style.cssText = [
            "position:fixed", "top:0", "right:0",
            "width:min(560px,46vw)", "height:100vh", "z-index:99999",
            "background:rgba(0,0,0,0.94)", "color:#fff",
            "font:12px/1.45 ui-monospace,Consolas,monospace",
            "padding:38px 14px 14px", "white-space:pre-wrap",
            "overflow:auto", "display:none",
            "border-left:1px solid #333",
            "box-shadow:-4px 0 18px rgba(0,0,0,0.55)",
        ].join(";");

        const toolbar = document.createElement("div");
        toolbar.style.cssText = "position:absolute;top:6px;right:8px;display:flex;gap:6px;";
        const noiseBtn = document.createElement("button");
        noiseBtn.id = "__dbg_noise";
        noiseBtn.type = "button";
        noiseBtn.textContent = "Show noise";
        noiseBtn.title = "Show/hide logs, warnings, and resource-load failures (off by default)";
        noiseBtn.style.cssText = "background:#222;color:#bbb;border:1px solid #444;border-radius:4px;padding:3px 8px;font:11px ui-monospace,Consolas,monospace;cursor:pointer;";
        const clearBtn = document.createElement("button");
        clearBtn.id = "__dbg_clear";
        clearBtn.type = "button";
        clearBtn.textContent = "Clear";
        clearBtn.style.cssText = "background:#222;color:#bbb;border:1px solid #444;border-radius:4px;padding:3px 8px;font:11px ui-monospace,Consolas,monospace;cursor:pointer;";
        const closeBtn = document.createElement("button");
        closeBtn.id = "__dbg_close";
        closeBtn.type = "button";
        closeBtn.textContent = "✕";
        closeBtn.style.cssText = "background:#222;color:#bbb;border:1px solid #444;border-radius:4px;padding:3px 10px;font:11px ui-monospace,Consolas,monospace;cursor:pointer;";
        toolbar.appendChild(noiseBtn);
        toolbar.appendChild(clearBtn);
        toolbar.appendChild(closeBtn);

        const lines = document.createElement("div");
        lines.id = "__dbg_lines";

        panel.appendChild(toolbar);
        panel.appendChild(lines);

        return { btn, panel, count, noiseBtn, clearBtn, closeBtn, lines };
    }

    function start() {
        injectStyles();
        const { btn, panel, count, noiseBtn, clearBtn, closeBtn, lines } = buildUI();
        document.body.appendChild(btn);
        document.body.appendChild(panel);

        let bugCount = 0;

        function refreshBadge() {
            count.textContent = bugCount > 0 ? bugCount + "!" : "0";
            count.style.background = bugCount > 0 ? "#b00" : "#444";
        }

        function append(prefix, color, args, kind) {
            const line = document.createElement("div");
            line.setAttribute("data-kind", kind);
            line.style.color = color;
            const parts = [];
            for (let i = 0; i < args.length; i++) {
                const a = args[i];
                if (a instanceof Error) {
                    parts.push(a.stack || a.message || String(a));
                } else if (a && typeof a === "object") {
                    try { parts.push(JSON.stringify(a)); } catch (_e) { parts.push(String(a)); }
                } else {
                    parts.push(String(a));
                }
            }
            line.textContent = prefix + " " + parts.join(" ");
            lines.appendChild(line);
            if (kind === KIND_BUG) {
                bugCount += 1;
                refreshBadge();
            }
        }

        btn.addEventListener("click", function () {
            panel.style.display = panel.style.display === "block" ? "none" : "block";
        });
        closeBtn.addEventListener("click", function () { panel.style.display = "none"; });
        clearBtn.addEventListener("click", function () {
            lines.innerHTML = "";
            bugCount = 0;
            refreshBadge();
        });
        noiseBtn.addEventListener("click", function () {
            const hiding = panel.classList.toggle("hide-noise");
            noiseBtn.textContent = hiding ? "Show noise" : "Hide noise";
        });

        const origLog = console.log;
        const origWarn = console.warn;
        const origErr = console.error;
        /* Noise (hidden by default): logs and warns. We still capture them so the
           "Show noise" toggle can reveal them retroactively if you need to dig in. */
        console.log = function () { append("[log]",  "#9cf", arguments, KIND_NOISE); origLog.apply(console, arguments); };
        console.warn = function () { append("[warn]", "#fc6", arguments, KIND_NOISE); origWarn.apply(console, arguments); };
        /* Real bug: explicit console.error in app code. */
        console.error = function () { append("[err]", "#f88", arguments, KIND_BUG); origErr.apply(console, arguments); };

        window.addEventListener("error", function (e) {
            /* Resource load errors (img/script/link/audio failing) bubble here in the
               capture phase. They have e.target set to the failing element and no
               message. They are usually rescued by fallback URLs — classify as noise. */
            const t = e.target;
            if (t && t !== window && t.tagName) {
                const tag = t.tagName.toLowerCase();
                const url = t.src || t.href || t.currentSrc || "(no src)";
                append("[resource fail]", "#f66", ["<" + tag + "> " + url], KIND_NOISE);
                return;
            }
            /* Genuine uncaught script error — real bug. */
            const src = (e.filename || "") + ":" + (e.lineno || "") + ":" + (e.colno || "");
            let m = (e.message || "error") + "  @  " + src;
            if (e.error && e.error.stack) m += "\n" + e.error.stack;
            append("[script error]", "#f66", [m], KIND_BUG);
        }, true);
        window.addEventListener("unhandledrejection", function (e) {
            const r = e.reason;
            const m = (r && (r.stack || r.message)) || String(r);
            append("[unhandledrejection]", "#f66", [m], KIND_BUG);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
}());
