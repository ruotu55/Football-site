/** Canonical YouTube thumbnail title bar — shared by all Regular runners. */

export const THUMB_W = 1280;
export const THUMB_H = 720;
export const BANNER_RED = "#FF0000";
export const BANNER_DIVIDER_H = 4;
export const BANNER_H = Math.round(THUMB_H * 0.20);
export const STAGE_TOP = BANNER_H + BANNER_DIVIDER_H;
export const STAGE_H = THUMB_H - STAGE_TOP;

const BANNER_FONT_FAMILY = '"Anton", Impact, "Arial Black", sans-serif';
const BANNER_TITLE_VERT_MARGIN = 8;

let bannerFontsReady = null;

export function ensureBannerFonts() {
    if (bannerFontsReady) return bannerFontsReady;
    bannerFontsReady = (async () => {
        if (!document.getElementById("ts-banner-fonts")) {
            const link = document.createElement("link");
            link.id = "ts-banner-fonts";
            link.rel = "stylesheet";
            link.href = "https://fonts.googleapis.com/css2?family=Anton&display=swap";
            document.head.appendChild(link);
        }
        try {
            await Promise.all([
                document.fonts.load('400 120px "Anton"'),
                document.fonts.load('900 120px Impact'),
            ]);
        } catch { /* fall back to system bold */ }
    })();
    return bannerFontsReady;
}

function setBannerTitleFont(ctx, fontSize) {
    ctx.font = `400 ${fontSize}px ${BANNER_FONT_FAMILY}`;
    ctx.letterSpacing = `${Math.max(2, Math.round(fontSize * 0.04))}px`;
    if ("fontKerning" in ctx) ctx.fontKerning = "normal";
    if ("textRendering" in ctx) ctx.textRendering = "geometricPrecision";
}

function titleOutlinePx(fontSize) {
    return Math.max(4, Math.round(fontSize * 0.075));
}

function measureTitleMetrics(ctx, fontSize) {
    setBannerTitleFont(ctx, fontSize);
    const m = ctx.measureText("FOOTBALL");
    const ascent = m.actualBoundingBoxAscent || fontSize * 0.72;
    const descent = m.actualBoundingBoxDescent || fontSize * 0.18;
    return { ascent, descent, textH: ascent + descent };
}

function titleTotalHeight(ctx, fontSize) {
    const { textH } = measureTitleMetrics(ctx, fontSize);
    return textH + titleOutlinePx(fontSize) * 2;
}

function bannerTitleBaselineY(ctx, bannerH, fontSize) {
    const { ascent, textH } = measureTitleMetrics(ctx, fontSize);
    const outline = titleOutlinePx(fontSize);
    const totalH = textH + outline * 2;
    const top = (bannerH - totalH) / 2;
    return top + outline + ascent;
}

function measureBannerTitleWords(ctx, words, wordGap) {
    let total = 0;
    for (let i = 0; i < words.length; i++) {
        if (i > 0) total += wordGap;
        total += ctx.measureText(words[i].text).width;
    }
    return total;
}

function findBannerTitleFontSize(ctx, words, bannerH, maxW) {
    const maxBlockH = bannerH - BANNER_TITLE_VERT_MARGIN * 2;
    let lo = 28;
    let hi = bannerH;
    while (lo < hi) {
        const fontSize = Math.ceil((lo + hi) / 2);
        setBannerTitleFont(ctx, fontSize);
        const wordGap = Math.round(fontSize * 0.14);
        const fitsVert = titleTotalHeight(ctx, fontSize) <= maxBlockH;
        const fitsHoriz = measureBannerTitleWords(ctx, words, wordGap) <= maxW;
        if (fitsVert && fitsHoriz) lo = fontSize;
        else hi = fontSize - 1;
    }
    setBannerTitleFont(ctx, lo);
    return lo;
}

function layoutBannerTitleWords(ctx, words, wordGap, cx, cy) {
    const totalW = measureBannerTitleWords(ctx, words, wordGap);
    let x = cx - totalW / 2;
    const baselineY = Math.round(cy);
    return words.map((word, i) => {
        const pos = { text: word.text, fill: word.fill, x: Math.round(x), y: baselineY };
        x += ctx.measureText(word.text).width;
        if (i < words.length - 1) x += wordGap;
        return pos;
    });
}

function drawCrispBannerWord(ctx, text, x, y, fill, outlinePx) {
    const t = Math.max(2, outlinePx);
    ctx.fillStyle = "#000000";
    for (let dy = -t; dy <= t; dy++) {
        for (let dx = -t; dx <= t; dx++) {
            if (dx * dx + dy * dy > t * t) continue;
            if (dx === 0 && dy === 0) continue;
            ctx.fillText(text, x + dx, y + dy);
        }
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}

function bannerTitleWords(titleWhite, titleYellow) {
    return [
        ...String(titleWhite || "").split(/\s+/).filter(Boolean).map((text) => ({ text, fill: "#FFFFFF" })),
        ...String(titleYellow || "").split(/\s+/).filter(Boolean).map((text) => ({ text, fill: "#FACC15" })),
    ];
}

/** Flat red bar + Anton title + white divider — identical on every runner. */
export function drawThumbnailBanner(ctx, { titleWhite, titleYellow, canvasW = THUMB_W }) {
    ctx.fillStyle = BANNER_RED;
    ctx.fillRect(0, 0, canvasW, BANNER_H);

    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    const words = bannerTitleWords(titleWhite, titleYellow);
    const fontSize = findBannerTitleFontSize(ctx, words, BANNER_H, canvasW - 20);
    setBannerTitleFont(ctx, fontSize);

    const wordGap = Math.round(fontSize * 0.14);
    const baselineY = bannerTitleBaselineY(ctx, BANNER_H, fontSize);
    const layout = layoutBannerTitleWords(ctx, words, wordGap, canvasW / 2, baselineY);
    const outline = titleOutlinePx(fontSize);

    for (const { text, fill, x, y } of layout) {
        drawCrispBannerWord(ctx, text, x, y, fill, outline);
    }

    ctx.restore();

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, BANNER_H, canvasW, BANNER_DIVIDER_H);
}
