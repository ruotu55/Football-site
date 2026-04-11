export function wireMainTabs(els) {
    els.tabBtnLanding.onclick = () => {
        els.tabBtnLanding.classList.add("active");
        els.tabBtnSetup.classList.remove("active");
        els.tabBtnSaved.classList.remove("active");
        els.panelLanding.classList.add("active");
        els.panelSetup.classList.remove("active");
        els.panelSaved.classList.remove("active");
    };

    els.tabBtnSetup.onclick = () => {
        els.tabBtnSetup.classList.add("active");
        els.tabBtnLanding.classList.remove("active");
        els.tabBtnSaved.classList.remove("active");
        els.panelSetup.classList.add("active");
        els.panelLanding.classList.remove("active");
        els.panelSaved.classList.remove("active");
    };

    els.tabBtnSaved.onclick = () => {
        els.tabBtnSaved.classList.add("active");
        els.tabBtnLanding.classList.remove("active");
        els.tabBtnSetup.classList.remove("active");
        els.panelSaved.classList.add("active");
        els.panelLanding.classList.remove("active");
        els.panelSetup.classList.remove("active");
    };
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
