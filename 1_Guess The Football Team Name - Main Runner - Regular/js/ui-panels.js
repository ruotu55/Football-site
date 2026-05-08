import { renderVoiceTab } from "./voice-tab.js";

export function wireMainTabs(els) {
    const tabs = [
        { btn: els.tabBtnLanding, panel: els.panelLanding },
        { btn: els.tabBtnSetup,   panel: els.panelSetup   },
        { btn: els.tabBtnVoice,   panel: els.panelVoice,  onShow: () => renderVoiceTab() },
        { btn: els.tabBtnSaved,   panel: els.panelSaved   },
    ];
    const activate = (index) => {
        tabs.forEach((t, i) => {
            if (!t.btn || !t.panel) return;
            const on = i === index;
            t.btn.classList.toggle("active", on);
            t.panel.classList.toggle("active", on);
        });
        const onShow = tabs[index]?.onShow;
        if (typeof onShow === "function") onShow();
    };
    tabs.forEach((t, i) => { if (t.btn) t.btn.onclick = () => activate(i); });
}

export function wireControlPanelToggle(els) {
    if (els.controlPanel && els.panelFab) {
        els.controlPanel.classList.add("collapsed");
        els.panelFab.hidden = false;
    }

    els.panelToggle.onclick = () => {
        els.controlPanel.classList.add("collapsed");
        els.panelFab.hidden = false;
    };

    els.panelFab.onclick = () => {
        els.controlPanel.classList.remove("collapsed");
        els.panelFab.hidden = true;
    };
}
